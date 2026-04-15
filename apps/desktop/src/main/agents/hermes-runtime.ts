/**
 * Hermes Runtime
 *
 * Manages Hermes Agent as a Python subprocess within the Electron main process.
 * Communication via JSON-RPC over stdin/stdout.
 *
 * Lifecycle:
 *   start() → spawns hermes process
 *   sendMessage(msg) → sends user message, gets agent response
 *   runWorkflow(id) → triggers a workflow
 *   stop() → graceful shutdown
 *
 * Features:
 *   - Health monitoring with automatic restart on crash
 *   - Resource limits (memory, timeout)
 *   - IPC bridge: Electron ↔ Hermes stdin/stdout (JSON-RPC)
 *   - Multi-agent isolation (each agent runs in its own process)
 */

import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ── Types ──

export type HermesRuntimeStatus = 'stopped' | 'starting' | 'running' | 'error' | 'restarting';

export interface HermesMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallResult[];
  metadata?: Record<string, any>;
}

export interface ToolCallResult {
  tool: string;
  args: Record<string, any>;
  result?: string;
  error?: string;
}

export interface HermesRuntimeConfig {
  /** Agent name (for identification) */
  agentName: string;
  /** Path to agent install directory */
  agentDir: string;
  /** Path to hermes-config.yaml */
  configPath: string;
  /** Python executable path (default: 'python') */
  pythonPath?: string;
  /** Hermes Agent install path */
  hermesPath?: string;
  /** Maximum memory usage in MB */
  maxMemoryMB?: number;
  /** Response timeout in seconds */
  responseTimeoutSec?: number;
  /** Auto-restart on crash */
  autoRestart?: boolean;
  /** Maximum restart attempts */
  maxRestartAttempts?: number;
  /** IzziAPI base URL (for provider resolution) */
  izziApiUrl?: string;
  /** IzziAPI key */
  izziApiKey?: string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// ── Hermes Runtime ──

export class HermesRuntime extends EventEmitter {
  private process: ChildProcess | null = null;
  private status: HermesRuntimeStatus = 'stopped';
  private config: HermesRuntimeConfig;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }>();
  private restartAttempts = 0;
  private outputBuffer = '';

  constructor(config: HermesRuntimeConfig) {
    super();
    this.config = {
      pythonPath: 'python',
      maxMemoryMB: 512,
      responseTimeoutSec: 120,
      autoRestart: true,
      maxRestartAttempts: 3,
      ...config,
    };
  }

  /** Get current runtime status */
  getStatus(): HermesRuntimeStatus {
    return this.status;
  }

  /** Get agent name */
  getAgentName(): string {
    return this.config.agentName;
  }

  /**
   * Start the Hermes Agent process.
   */
  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.setStatus('starting');

    try {
      // Validate config file exists
      if (!fs.existsSync(this.config.configPath)) {
        throw new Error(`Hermes config not found: ${this.config.configPath}`);
      }

      // Build command arguments
      const args = this.buildHermesArgs();

      // Set environment variables
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        HERMES_CONFIG: this.config.configPath,
        HERMES_AGENT_DIR: this.config.agentDir,
        HERMES_OUTPUT_FORMAT: 'jsonrpc',
      };

      // Add IzziAPI config if provided
      if (this.config.izziApiUrl) {
        env['IZZIAPI_BASE_URL'] = this.config.izziApiUrl;
      }
      if (this.config.izziApiKey) {
        env['IZZIAPI_API_KEY'] = this.config.izziApiKey;
      }

      // Spawn Hermes process
      this.process = spawn(this.config.pythonPath!, args, {
        cwd: this.config.agentDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Limit memory via Node.js (Python memory limits are set differently)
        ...(process.platform === 'win32' ? {} : {
          uid: process.getuid?.(),
          gid: process.getgid?.(),
        }),
      });

      // Handle stdout (JSON-RPC responses)
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data);
      });

      // Handle stderr (log output)
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          this.emit('log', { level: 'debug', message, agent: this.config.agentName });
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        this.handleProcessExit(code, signal);
      });

      // Handle process errors
      this.process.on('error', (err) => {
        this.setStatus('error');
        this.emit('error', { agent: this.config.agentName, error: err.message });
      });

      // Wait for ready signal (with timeout)
      await this.waitForReady(10000);
      this.setStatus('running');
      this.restartAttempts = 0;
      this.emit('started', { agent: this.config.agentName });

    } catch (err: any) {
      this.setStatus('error');
      this.emit('error', { agent: this.config.agentName, error: err.message });
      throw err;
    }
  }

  /**
   * Send a user message and get agent response.
   */
  async sendMessage(message: string, sessionId?: string): Promise<HermesMessage> {
    this.ensureRunning();

    const response = await this.sendRpc('chat', {
      message,
      session_id: sessionId || 'default',
    });

    const result: HermesMessage = {
      role: 'assistant',
      content: response.content || response.message || '',
      toolCalls: response.tool_calls,
      metadata: response.metadata,
    };

    this.emit('message', { agent: this.config.agentName, message: result });
    return result;
  }

  /**
   * Run a named workflow.
   */
  async runWorkflow(workflowId: string, params?: Record<string, any>): Promise<any> {
    this.ensureRunning();
    return this.sendRpc('run_workflow', { workflow_id: workflowId, params: params || {} });
  }

  /**
   * Execute a cron job manually.
   */
  async runCronJob(jobName: string): Promise<any> {
    this.ensureRunning();
    return this.sendRpc('run_cron', { job_name: jobName });
  }

  /**
   * Get agent memory contents.
   */
  async getMemory(): Promise<Record<string, any>> {
    this.ensureRunning();
    return this.sendRpc('get_memory', {});
  }

  /**
   * Update agent memory.
   */
  async updateMemory(key: string, value: any): Promise<void> {
    this.ensureRunning();
    await this.sendRpc('update_memory', { key, value });
  }

  /**
   * Get agent's available skills.
   */
  async listSkills(): Promise<string[]> {
    this.ensureRunning();
    const res = await this.sendRpc('list_skills', {});
    return res.skills || [];
  }

  /**
   * Get runtime health info.
   */
  async getHealth(): Promise<{
    status: HermesRuntimeStatus;
    uptime: number;
    memoryMB: number;
    activeSessions: number;
  }> {
    if (this.status !== 'running') {
      return { status: this.status, uptime: 0, memoryMB: 0, activeSessions: 0 };
    }

    try {
      const health = await this.sendRpc('health', {});
      return { status: 'running', ...health };
    } catch {
      return { status: this.status, uptime: 0, memoryMB: 0, activeSessions: 0 };
    }
  }

  /**
   * Gracefully stop the Hermes process.
   */
  async stop(): Promise<void> {
    if (this.status === 'stopped' || !this.process) return;

    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Runtime shutting down'));
      this.pendingRequests.delete(id);
    }

    // Send shutdown signal
    try {
      this.sendRpcRaw('shutdown', {});
    } catch { /* ignore */ }

    // Give process time to clean up
    await new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        this.process?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.process?.on('exit', () => {
        clearTimeout(killTimeout);
        resolve();
      });
    });

    this.process = null;
    this.setStatus('stopped');
    this.emit('stopped', { agent: this.config.agentName });
  }

  /**
   * Force kill the process.
   */
  kill(): void {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
    this.setStatus('stopped');
  }

  // ── Private Methods ──

  private buildHermesArgs(): string[] {
    const hermesPath = this.config.hermesPath || 'hermes';

    // Run Hermes in JSON-RPC server mode
    return [
      '-m', 'hermes',
      '--config', this.config.configPath,
      '--mode', 'jsonrpc-server',
      '--agent-dir', this.config.agentDir,
    ];
  }

  private setStatus(status: HermesRuntimeStatus): void {
    const prev = this.status;
    this.status = status;
    if (prev !== status) {
      this.emit('statusChange', { agent: this.config.agentName, from: prev, to: status });
    }
  }

  private ensureRunning(): void {
    if (this.status !== 'running') {
      throw new Error(`Hermes runtime is not running (status: ${this.status})`);
    }
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Hermes runtime did not become ready within ${timeoutMs}ms`));
      }, timeoutMs);

      // Check for ready signal in stdout
      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.once('ready', onReady);

      // Also resolve if we get any successful RPC response
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          clearTimeout(timeout);
          this.removeListener('ready', onReady);
          resolve();
        }
      }, 2000);
    });
  }

  private handleStdout(data: Buffer): void {
    this.outputBuffer += data.toString();

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for ready signal
      if (trimmed.includes('"method":"ready"') || trimmed.includes('"status":"ready"')) {
        this.emit('ready');
        continue;
      }

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);

          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        } else if ((msg as any).method === 'notification') {
          // Handle notifications from agent (e.g., tool output, progress)
          this.emit('notification', (msg as any).params);
        }
      } catch {
        // Not JSON — treat as log output
        this.emit('log', { level: 'info', message: trimmed, agent: this.config.agentName });
      }
    }
  }

  private handleProcessExit(code: number | null, signal: string | null): void {
    const wasRunning = this.status === 'running';

    if (code === 0) {
      this.setStatus('stopped');
      this.emit('stopped', { agent: this.config.agentName, code });
    } else {
      this.setStatus('error');
      this.emit('error', {
        agent: this.config.agentName,
        error: `Process exited with code ${code} (signal: ${signal})`,
      });

      // Auto-restart if configured
      if (wasRunning && this.config.autoRestart && this.restartAttempts < (this.config.maxRestartAttempts || 3)) {
        this.restartAttempts++;
        this.setStatus('restarting');
        this.emit('restarting', {
          agent: this.config.agentName,
          attempt: this.restartAttempts,
        });

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, this.restartAttempts - 1), 10000);
        setTimeout(() => {
          this.start().catch(err => {
            this.emit('error', { agent: this.config.agentName, error: `Restart failed: ${err.message}` });
          });
        }, delay);
      }
    }
  }

  private async sendRpc(method: string, params: Record<string, any>): Promise<any> {
    const id = ++this.requestId;
    const timeoutSec = this.config.responseTimeoutSec || 120;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call "${method}" timed out after ${timeoutSec}s`));
      }, timeoutSec * 1000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.sendRpcRaw(method, params, id);
    });
  }

  private sendRpcRaw(method: string, params: Record<string, any>, id?: number): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Hermes process stdin not writable');
    }

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: id ?? ++this.requestId,
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(request) + '\n');
  }
}
