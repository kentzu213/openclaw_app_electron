/**
 * Agent Manager
 *
 * Central manager for all installed AI agent bundles.
 * Handles install, uninstall, update, configure, start, stop operations.
 * Coordinates between AgentBundleInstaller and HermesRuntime instances.
 *
 * Each installed agent gets:
 *   - Its own directory under ~/.openclaw/agents/{name}/
 *   - Its own HermesRuntime process (isolated)
 *   - Persisted config in .agent-config.json
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { HermesRuntime, type HermesRuntimeConfig, type HermesMessage } from './hermes-runtime';

// ── Types ──

export interface AgentInfo {
  name: string;
  version: string;
  displayName: string;
  icon: string;
  category: string;
  status: 'active' | 'paused' | 'configuring' | 'error' | 'stopped';
  installedAt: string;
  lastActiveAt?: string;
  connectedPlatforms: string[];
  activeCronJobs: number;
  errorMessage?: string;
  stats?: {
    totalMessages: number;
    totalWorkflowRuns: number;
    totalCronRuns: number;
  };
}

export interface AgentManagerConfig {
  /** Base directory for agents (default: userData/agents/) */
  agentsDir?: string;
  /** Python executable path */
  pythonPath?: string;
  /** Hermes Agent install path */
  hermesPath?: string;
  /** IzziAPI URL */
  izziApiUrl?: string;
  /** IzziAPI key */
  izziApiKey?: string;
}

// ── Agent Manager ──

export class AgentManager extends EventEmitter {
  private config: Required<AgentManagerConfig>;
  private runtimes = new Map<string, HermesRuntime>();
  private agentConfigs = new Map<string, any>();

  constructor(config: AgentManagerConfig = {}) {
    super();
    this.config = {
      agentsDir: config.agentsDir || path.join(app.getPath('userData'), 'agents'),
      pythonPath: config.pythonPath || 'python',
      hermesPath: config.hermesPath || 'hermes',
      izziApiUrl: config.izziApiUrl || '',
      izziApiKey: config.izziApiKey || '',
    };

    // Ensure agents directory exists
    if (!fs.existsSync(this.config.agentsDir)) {
      fs.mkdirSync(this.config.agentsDir, { recursive: true });
    }
  }

  /**
   * Initialize: load all installed agents and start active ones.
   */
  async initialize(): Promise<void> {
    const agents = this.listAgents();
    for (const agent of agents) {
      this.agentConfigs.set(agent.name, this.loadAgentConfig(agent.name));

      // Auto-start agents that were active
      if (agent.status === 'active') {
        try {
          await this.startAgent(agent.name);
        } catch (err: any) {
          this.emit('error', { agent: agent.name, error: `Failed to auto-start: ${err.message}` });
        }
      }
    }

    this.emit('initialized', { agentCount: agents.length });
  }

  /**
   * List all installed agents with their current status.
   */
  listAgents(): AgentInfo[] {
    if (!fs.existsSync(this.config.agentsDir)) return [];

    const agents: AgentInfo[] = [];
    const entries = fs.readdirSync(this.config.agentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const info = this.getAgentInfo(entry.name);
      if (info) agents.push(info);
    }

    return agents;
  }

  /**
   * Get info about a specific installed agent.
   */
  getAgentInfo(agentName: string): AgentInfo | null {
    const manifestPath = path.join(this.config.agentsDir, agentName, 'manifest.json');
    const configPath = path.join(this.config.agentsDir, agentName, '.agent-config.json');

    if (!fs.existsSync(manifestPath)) return null;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const agentConfig = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : {};

      // Check runtime status
      const runtime = this.runtimes.get(agentName);
      const runtimeStatus = runtime?.getStatus();

      let status: AgentInfo['status'] = agentConfig.status || 'stopped';
      if (runtimeStatus === 'running') status = 'active';
      else if (runtimeStatus === 'error') status = 'error';

      return {
        name: manifest.name,
        version: manifest.version,
        displayName: manifest.displayName,
        icon: manifest.icon || '🤖',
        category: manifest.category,
        status,
        installedAt: agentConfig.installedAt || new Date().toISOString(),
        lastActiveAt: agentConfig.lastActiveAt,
        connectedPlatforms: agentConfig.connectedPlatforms || [],
        activeCronJobs: agentConfig.activeCronJobs || 0,
        errorMessage: agentConfig.errorMessage,
        stats: agentConfig.stats,
      };
    } catch {
      return null;
    }
  }

  /**
   * Start an agent's Hermes runtime.
   */
  async startAgent(agentName: string): Promise<void> {
    // Check if already running
    if (this.runtimes.has(agentName)) {
      const runtime = this.runtimes.get(agentName)!;
      if (runtime.getStatus() === 'running') return;
    }

    const agentDir = path.join(this.config.agentsDir, agentName);
    const configPath = path.join(agentDir, 'hermes-config.yaml');

    if (!fs.existsSync(configPath)) {
      throw new Error(`Agent "${agentName}" hermes-config.yaml not found`);
    }

    const runtimeConfig: HermesRuntimeConfig = {
      agentName,
      agentDir,
      configPath,
      pythonPath: this.config.pythonPath,
      hermesPath: this.config.hermesPath,
      izziApiUrl: this.config.izziApiUrl,
      izziApiKey: this.config.izziApiKey,
      autoRestart: true,
    };

    const runtime = new HermesRuntime(runtimeConfig);

    // Forward events
    runtime.on('message', (data) => this.emit('agentMessage', data));
    runtime.on('error', (data) => this.emit('agentError', data));
    runtime.on('statusChange', (data) => {
      this.emit('agentStatusChange', data);
      // Persist status
      this.updateAgentConfig(agentName, { status: data.to, lastActiveAt: new Date().toISOString() });
    });
    runtime.on('log', (data) => this.emit('agentLog', data));
    runtime.on('notification', (data) => this.emit('agentNotification', { agent: agentName, ...data }));

    await runtime.start();
    this.runtimes.set(agentName, runtime);
    this.updateAgentConfig(agentName, { status: 'active', lastActiveAt: new Date().toISOString() });
  }

  /**
   * Stop an agent's runtime.
   */
  async stopAgent(agentName: string): Promise<void> {
    const runtime = this.runtimes.get(agentName);
    if (!runtime) return;

    await runtime.stop();
    this.runtimes.delete(agentName);
    this.updateAgentConfig(agentName, { status: 'stopped' });
  }

  /**
   * Pause agent (stop runtime but keep config).
   */
  async pauseAgent(agentName: string): Promise<void> {
    await this.stopAgent(agentName);
    this.updateAgentConfig(agentName, { status: 'paused' });
  }

  /**
   * Send a message to a specific agent.
   */
  async sendMessage(agentName: string, message: string, sessionId?: string): Promise<HermesMessage> {
    const runtime = this.runtimes.get(agentName);
    if (!runtime || runtime.getStatus() !== 'running') {
      throw new Error(`Agent "${agentName}" is not running`);
    }

    const response = await runtime.sendMessage(message, sessionId);

    // Update stats
    const config = this.loadAgentConfig(agentName);
    const stats = config.stats || { totalMessages: 0, totalWorkflowRuns: 0, totalCronRuns: 0 };
    stats.totalMessages++;
    this.updateAgentConfig(agentName, { stats });

    return response;
  }

  /**
   * Run a workflow on a specific agent.
   */
  async runWorkflow(agentName: string, workflowId: string, params?: Record<string, any>): Promise<any> {
    const runtime = this.runtimes.get(agentName);
    if (!runtime || runtime.getStatus() !== 'running') {
      throw new Error(`Agent "${agentName}" is not running`);
    }

    const result = await runtime.runWorkflow(workflowId, params);

    // Update stats
    const config = this.loadAgentConfig(agentName);
    const stats = config.stats || { totalMessages: 0, totalWorkflowRuns: 0, totalCronRuns: 0 };
    stats.totalWorkflowRuns++;
    this.updateAgentConfig(agentName, { stats });

    return result;
  }

  /**
   * Update agent secrets/config (from setup wizard).
   */
  async configureAgent(agentName: string, secrets: Record<string, string>, config: Record<string, any>): Promise<void> {
    const agentDir = path.join(this.config.agentsDir, agentName);
    const manifestPath = path.join(agentDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Agent "${agentName}" not found`);
    }

    // Update config
    this.updateAgentConfig(agentName, {
      secrets,
      config,
      status: 'active',
    });

    // Regenerate Hermes config with new secrets
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const hermesConfig = this.generateHermesConfig(manifest, agentDir, secrets);
    fs.writeFileSync(path.join(agentDir, 'hermes-config.yaml'), hermesConfig);

    // Restart if running
    if (this.runtimes.has(agentName)) {
      await this.stopAgent(agentName);
      await this.startAgent(agentName);
    }
  }

  /**
   * Uninstall an agent.
   */
  async uninstallAgent(agentName: string): Promise<void> {
    // Stop if running
    await this.stopAgent(agentName);

    const agentDir = path.join(this.config.agentsDir, agentName);
    if (!fs.existsSync(agentDir)) return;

    // Move to trash (recoverable)
    const trashDir = path.join(this.config.agentsDir, '.trash', `${agentName}-${Date.now()}`);
    fs.mkdirSync(path.dirname(trashDir), { recursive: true });
    fs.renameSync(agentDir, trashDir);

    this.agentConfigs.delete(agentName);
    this.emit('agentUninstalled', { agent: agentName });
  }

  /**
   * Get health of all running agents.
   */
  async getHealthReport(): Promise<Record<string, any>> {
    const report: Record<string, any> = {};

    for (const [name, runtime] of this.runtimes) {
      report[name] = await runtime.getHealth();
    }

    return report;
  }

  /**
   * Shutdown all agents (for app exit).
   */
  async shutdown(): Promise<void> {
    const stopPromises = Array.from(this.runtimes.keys()).map(name => this.stopAgent(name));
    await Promise.allSettled(stopPromises);
    this.emit('shutdown');
  }

  // ── Private Helpers ──

  private loadAgentConfig(agentName: string): any {
    const configPath = path.join(this.config.agentsDir, agentName, '.agent-config.json');
    if (fs.existsSync(configPath)) {
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch { /* fallthrough */ }
    }
    return {};
  }

  private updateAgentConfig(agentName: string, updates: Record<string, any>): void {
    const configPath = path.join(this.config.agentsDir, agentName, '.agent-config.json');
    const existing = this.loadAgentConfig(agentName);
    const merged = { ...existing, ...updates };

    try {
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
      this.agentConfigs.set(agentName, merged);
    } catch { /* ignore write errors during shutdown */ }
  }

  private generateHermesConfig(manifest: any, agentDir: string, secrets: Record<string, string>): string {
    const skillDirs = (manifest.agent?.skills || [])
      .map((s: string) => `  - ${path.join(agentDir, 'skills', s)}`)
      .join('\n');

    const envVars = Object.entries(secrets)
      .map(([k, v]) => `  ${k}: "${v}"`)
      .join('\n');

    return `# Auto-generated Hermes config for ${manifest.displayName}
# Managed by OpenClaw Agent Manager

provider: ${manifest.agent?.provider?.default || 'izziapi'}
model: ${manifest.agent?.provider?.model || 'gpt-4o'}

soul_path: ${path.join(agentDir, manifest.agent?.soul || 'soul.md')}
${manifest.agent?.memory ? `memory_path: ${path.join(agentDir, manifest.agent.memory)}` : ''}

skills:
  external_dirs:
${skillDirs}

tools:
  enabled: [${(manifest.agent?.tools || []).join(', ')}]

session:
  timeout_minutes: ${manifest.agent?.sessionTimeoutMinutes || 30}
  max_concurrent: ${manifest.agent?.maxConcurrentSessions || 1}

${envVars ? `env:\n${envVars}` : ''}
`;
  }
}
