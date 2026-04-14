// ── 9Router Integration Service ──
// Ported from tuanminhhole/openclaw-setup (cli.js)
// Handles smart-route sync, OAuth flow, and 9Router management.

import { exec, execFile, spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';

// ── Provider → Model Mapping ──
// Source: tuanminhhole/openclaw-setup build9RouterSmartRouteSyncScript()

const PROVIDER_MODELS: Record<string, string[]> = {
  codex: ['cx/gpt-5.4', 'cx/gpt-5.3-codex', 'cx/gpt-5.3-codex-high', 'cx/gpt-5.2-codex', 'cx/gpt-5.2'],
  'claude-code': ['cc/claude-opus-4-6', 'cc/claude-sonnet-4-6', 'cc/claude-opus-4-5-20251101'],
  github: ['gh/gpt-5.4', 'gh/gpt-5.3-codex', 'gh/gpt-5.2-codex', 'gh/claude-opus-4.6', 'gh/gemini-3-pro-preview'],
  cursor: ['cu/default', 'cu/claude-4.6-opus-max', 'cu/gpt-5.3-codex'],
  kilo: ['kc/anthropic/claude-sonnet-4-20250514', 'kc/google/gemini-2.5-pro', 'kc/openai/gpt-4.1'],
  cline: ['cl/anthropic/claude-sonnet-4.6', 'cl/openai/gpt-5.3-codex', 'cl/google/gemini-3.1-pro-preview'],
  'gemini-cli': ['gc/gemini-3-flash-preview', 'gc/gemini-3-pro-preview'],
  iflow: ['if/qwen3-coder-plus', 'if/kimi-k2', 'if/deepseek-r1', 'if/deepseek-v3.2'],
  qwen: ['qw/qwen3-coder-plus', 'qw/qwen3-coder-flash'],
  kiro: ['kr/claude-sonnet-4.5', 'kr/deepseek-3.2'],
  ollama: ['ollama/gemma4:e2b', 'ollama/gemma4:e4b', 'ollama/qwen3.5'],
  'kimi-coding': ['kmc/kimi-k2.5', 'kmc/kimi-k2.5-thinking'],
  glm: ['glm/glm-5.1', 'glm/glm-5', 'glm/glm-4.7'],
  minimax: ['minimax/MiniMax-M2.7', 'minimax/MiniMax-M2.5'],
  kimi: ['kimi/kimi-k2.5', 'kimi/kimi-k2.5-thinking'],
  deepseek: ['deepseek/deepseek-chat', 'deepseek/deepseek-reasoner'],
  xai: ['xai/grok-4', 'xai/grok-4-fast-reasoning'],
  mistral: ['mistral/mistral-large-latest', 'mistral/codestral-latest'],
  groq: ['groq/llama-3.3-70b-versatile'],
  openai: ['openai/gpt-4o', 'openai/gpt-4.1'],
  anthropic: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-3.5'],
  gemini: ['gemini/gemini-2.5-flash', 'gemini/gemini-2.5-pro'],
};

// Provider priority for smart-route ordering
const PROVIDER_PRIORITY = [
  'openai', 'anthropic', 'claude-code', 'codex', 'cursor', 'github',
  'cline', 'kimi', 'minimax', 'deepseek', 'glm', 'xai', 'mistral',
  'kilo', 'kiro', 'iflow', 'qwen', 'gemini-cli', 'ollama',
];

// ── Types ──

export interface NineRouterStatus {
  running: boolean;
  port: number;
  dashboardUrl: string;
  providers: string[];
  smartRouteModels: number;
}

export interface SmartRouteCombo {
  id: string;
  name: string;
  alias: string;
  models: string[];
}

// ── Service ──

export class NineRouterService {
  private syncInterval: NodeJS.Timeout | null = null;
  private routerProcess: ChildProcess | null = null;
  private readonly port: number;
  private readonly dataDir: string;

  constructor(projectDir?: string) {
    this.port = 20128;
    this.dataDir = projectDir
      ? path.join(projectDir, '.9router')
      : path.join(os.homedir(), '.9router');
  }

  // ── Check if 9Router is installed ──

  isInstalled(): boolean {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      require('child_process').execSync(`${cmd} 9router`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // ── Install 9Router globally ──

  async install(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const cmd = 'npm install -g 9router';
      exec(cmd, { timeout: 90000 }, (error) => {
        if (error) {
          resolve({ success: false, error: `npm install failed: ${error.message}` });
          return;
        }
        resolve({ success: true });
      });
    });
  }

  // ── Start 9Router process ──

  async start(): Promise<boolean> {
    if (await this.isRunning()) return true;

    // Ensure data directory exists
    fs.mkdirSync(this.dataDir, { recursive: true });

    const routerBin = this.resolveCommand('9router');
    const args = ['-n', '-H', '0.0.0.0', '-p', String(this.port), '--skip-update'];

    this.routerProcess = spawn(routerBin, args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(this.port),
        HOSTNAME: '0.0.0.0',
        DATA_DIR: this.dataDir,
      },
    });

    this.routerProcess.unref();

    // Wait for API to be ready
    const ready = await this.waitForReady(15000);
    if (ready) {
      this.startSmartRouteSync();
    }
    return ready;
  }

  // ── Stop 9Router ──

  stop(): void {
    this.stopSmartRouteSync();
    if (this.routerProcess) {
      try {
        this.routerProcess.kill();
      } catch {
        // Already dead
      }
      this.routerProcess = null;
    }
  }

  // ── Check if 9Router is running ──

  async isRunning(): Promise<boolean> {
    try {
      const response = await this.fetchJson(`http://127.0.0.1:${this.port}/api/version`);
      return !!response;
    } catch {
      return false;
    }
  }

  // ── Get status ──

  async getStatus(): Promise<NineRouterStatus> {
    const running = await this.isRunning();
    if (!running) {
      return {
        running: false,
        port: this.port,
        dashboardUrl: `http://localhost:${this.port}/dashboard`,
        providers: [],
        smartRouteModels: 0,
      };
    }

    const providers = await this.getActiveProviders();
    const combos = await this.getCombos();
    const smartRoute = combos.find(c => c.id === 'smart-route');

    return {
      running: true,
      port: this.port,
      dashboardUrl: `http://localhost:${this.port}/dashboard`,
      providers: providers.map(p => p.provider),
      smartRouteModels: smartRoute?.models.length || 0,
    };
  }

  // ── Smart Route Sync ──
  // Continuously syncs active providers into a unified "smart-route" combo.
  // Ported from: tuanminhhole/openclaw-setup build9RouterSmartRouteSyncScript()

  startSmartRouteSync(intervalMs = 30000): void {
    if (this.syncInterval) return;

    // Initial sync after 5s delay
    setTimeout(() => this.syncSmartRoute(), 5000);
    this.syncInterval = setInterval(() => this.syncSmartRoute(), intervalMs);
  }

  stopSmartRouteSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async syncSmartRoute(): Promise<void> {
    try {
      // 1. Get active providers from 9Router API
      const activeProviders = await this.getActiveProviders();
      const providerNames = activeProviders
        .filter(c => c.isActive !== false && !c.disabled)
        .map(c => c.provider);

      if (providerNames.length === 0) {
        await this.removeSmartRoute();
        return;
      }

      // 2. Sort by priority
      providerNames.sort((a, b) => {
        const ai = PROVIDER_PRIORITY.indexOf(a);
        const bi = PROVIDER_PRIORITY.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      // 3. Build model list from active providers
      const models = providerNames.flatMap(pv => PROVIDER_MODELS[pv] || []);
      if (models.length === 0) {
        await this.removeSmartRoute();
        return;
      }

      // 4. Create/update smart-route combo
      const combo: SmartRouteCombo = {
        id: 'smart-route',
        name: 'smart-route',
        alias: 'smart-route',
        models,
      };

      // 5. Sync to disk (db.json)
      const dbPath = path.join(this.dataDir, 'db.json');
      let db: any = {};
      try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      } catch {
        // Fresh db
      }
      if (!db.combos) db.combos = [];

      const existingIdx = db.combos.findIndex((x: any) => x.id === 'smart-route');
      if (existingIdx >= 0) {
        if (JSON.stringify(db.combos[existingIdx].models) !== JSON.stringify(combo.models)) {
          db.combos[existingIdx] = combo;
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        }
      } else {
        db.combos.push(combo);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      }

      // 6. Sync to 9Router API memory
      const memoryCombos = await this.getCombos();
      const inMemory = memoryCombos.find(x => x.id === 'smart-route');
      if (inMemory) {
        if (JSON.stringify(inMemory.models) !== JSON.stringify(combo.models)) {
          await this.deleteCombo('smart-route');
          await this.createCombo(combo);
        }
      } else {
        await this.createCombo(combo);
      }
    } catch (err: any) {
      console.warn('[9Router] Smart-route sync error:', err.message);
    }
  }

  private async removeSmartRoute(): Promise<void> {
    // Remove from disk
    const dbPath = path.join(this.dataDir, 'db.json');
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      if (db.combos) {
        db.combos = db.combos.filter((x: any) => x.id !== 'smart-route');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      }
    } catch {
      // Ignore
    }

    // Remove from API
    await this.deleteCombo('smart-route');
  }

  // ── 9Router API helpers ──

  private async getActiveProviders(): Promise<any[]> {
    try {
      const data = await this.fetchJson(`http://127.0.0.1:${this.port}/api/providers`);
      return data?.connections || [];
    } catch {
      return [];
    }
  }

  private async getCombos(): Promise<SmartRouteCombo[]> {
    try {
      const data = await this.fetchJson(`http://127.0.0.1:${this.port}/api/combos`);
      return data?.combos || [];
    } catch {
      return [];
    }
  }

  private async createCombo(combo: SmartRouteCombo): Promise<void> {
    try {
      await this.fetchJson(`http://127.0.0.1:${this.port}/api/combos`, {
        method: 'POST',
        body: JSON.stringify(combo),
      });
    } catch {
      // Silent fail
    }
  }

  private async deleteCombo(id: string): Promise<void> {
    try {
      await this.fetchJson(`http://127.0.0.1:${this.port}/api/combos/${id}`, {
        method: 'DELETE',
      });
    } catch {
      // Silent fail
    }
  }

  // ── Utility ──

  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const candidates = [
      `http://127.0.0.1:${this.port}/api/settings/require-login`,
      `http://127.0.0.1:${this.port}/api/version`,
    ];

    while (Date.now() < deadline) {
      for (const url of candidates) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
          if (response.ok) return true;
        } catch {
          // Keep polling
        }
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    return false;
  }

  private resolveCommand(command: string): string {
    if (process.platform === 'win32') {
      try {
        const output = require('child_process').execSync(`where.exe ${command}`, {
          stdio: ['ignore', 'pipe', 'ignore'],
          encoding: 'utf8',
          shell: true,
        });
        return output.split(/\r?\n/).map((l: string) => l.trim()).find(Boolean) || command;
      } catch {
        return command;
      }
    }
    try {
      return require('child_process').execSync(`command -v ${command}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        shell: true,
      }).trim() || command;
    } catch {
      return command;
    }
  }

  private async fetchJson(url: string, options: any = {}): Promise<any> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  // ── Docker Compose for 9Router ──

  generateDockerComposeEntry(): string {
    return [
      '  9router:',
      '    image: 9router/9router:latest',
      '    container_name: izzi-9router',
      '    restart: unless-stopped',
      '    ports:',
      `      - "${this.port}:${this.port}"`,
      '    environment:',
      `      - PORT=${this.port}`,
      '      - HOSTNAME=0.0.0.0',
      '    volumes:',
      `      - ${this.dataDir}:/app/data`,
    ].join('\n');
  }

  // ── Get reachable dashboard URLs ──

  getReachableDashboardUrls(): string[] {
    const urls: string[] = [
      `http://127.0.0.1:${this.port}/dashboard`,
      `http://localhost:${this.port}/dashboard`,
    ];

    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces || {})) {
      for (const entry of entries || []) {
        if (!entry || entry.internal || entry.family !== 'IPv4' || !entry.address) continue;
        urls.push(`http://${entry.address}:${this.port}/dashboard`);
      }
    }

    return [...new Set(urls)];
  }
}
