import { AuthManager } from '../auth/auth-manager';
import { DatabaseManager } from '../db/database';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

interface SyncState {
  status: SyncStatus;
  lastSynced: string | null;
  error: string | null;
  progress: number;
}

// IzziAPI.com backend URL — used for /v1/models and /v1/key-info
const IZZI_API_BASE = process.env.OPENCLAW_API_URL || 'https://api.izziapi.com';

export class SyncEngine {
  private auth: AuthManager;
  private db: DatabaseManager;
  private state: SyncState = {
    status: 'idle',
    lastSynced: null,
    error: null,
    progress: 0,
  };
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(auth: AuthManager, db: DatabaseManager) {
    this.auth = auth;
    this.db = db;

    // Load last sync time
    const lastSynced = this.db.getSetting('last_synced');
    if (lastSynced) this.state.lastSynced = lastSynced;

    // Auto-sync every 5 minutes
    this.syncInterval = setInterval(() => {
      if (this.auth.isAuthenticated()) {
        this.startSync();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Read local ~/.openclaw/openclaw.json config.
   * This config is set by the izzi-openclaw installer and contains:
   * - apiKey: the user's izzi API key
   * - baseUrl: API base URL (https://api.izziapi.com)
   * - models: available model list
   * - defaultModel: user's default model
   */
  private readLocalConfig(): Record<string, any> | null {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      if (!fs.existsSync(configPath)) return null;
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async startSync(): Promise<SyncState> {
    if (!this.auth.isAuthenticated()) {
      return { ...this.state, status: 'error', error: 'Not authenticated' };
    }

    if (this.state.status === 'syncing') {
      return this.state;
    }

    this.state = { status: 'syncing', lastSynced: this.state.lastSynced, error: null, progress: 0 };

    try {
      // 1. Sync user profile from Supabase auth (NOT /api/auth/me)
      this.state.progress = 20;
      try {
        const user = this.auth.getCurrentUser();
        if (user) {
          this.db.cacheUserData('profile', 'profile', user as unknown as object);
          console.log('[Sync] Profile synced from auth:', user.email);
        }
      } catch (err: any) {
        console.warn('[Sync] Profile sync failed:', err.message);
      }

      // 2. Sync API key info from local OpenClaw config + /v1/key-info
      this.state.progress = 40;
      try {
        const localConfig = this.readLocalConfig();
        const apiKey = localConfig?.apiKey;
        if (apiKey) {
          // Verify key with izziapi.com /v1/key-info (this endpoint exists)
          try {
            const keyInfoRes = await fetch(`${IZZI_API_BASE}/v1/key-info`, {
              headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            });
            if (keyInfoRes.ok) {
              const keyInfo = await keyInfoRes.json() as any;
              this.db.cacheUserData('api_keys', 'api_keys', {
                keys: [{ key: apiKey, name: keyInfo.key_name, plan: keyInfo.plan, status: 'active' }],
                plan: keyInfo.plan,
                email: keyInfo.email_masked,
              });
              console.log('[Sync] API key info synced:', keyInfo.key_name);
            }
          } catch {
            // /v1/key-info may not be available, cache local key info
            this.db.cacheUserData('api_keys', 'api_keys', {
              keys: [{ key: apiKey, name: 'izzi-key', status: 'active' }],
            });
            console.log('[Sync] API key cached from local config');
          }
        }
      } catch (err: any) {
        console.warn('[Sync] API keys sync failed:', err.message);
      }

      // 3. Sync available models from /v1/models (this endpoint DOES exist)
      this.state.progress = 60;
      try {
        const localConfig = this.readLocalConfig();
        const apiKey = localConfig?.apiKey;
        if (apiKey) {
          const modelsRes = await fetch(`${IZZI_API_BASE}/v1/models`, {
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
          });
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json() as any;
            this.db.cacheUserData('usage', 'usage', {
              models: modelsData.data || [],
              modelCount: modelsData.data?.length || 0,
              syncedAt: new Date().toISOString(),
            });
            console.log('[Sync] Models synced:', modelsData.data?.length || 0, 'models');
          }
        }
      } catch (err: any) {
        console.warn('[Sync] Models sync failed:', err.message);
      }

      // 4. Sync billing/plan info from local config
      // Note: billing details are managed via izziapi.com/dashboard (web)
      this.state.progress = 80;
      try {
        const localConfig = this.readLocalConfig();
        this.db.cacheUserData('billing', 'billing', {
          plan: localConfig?.apiKey ? 'pro' : 'free',
          apiKey: localConfig?.apiKey ? `${localConfig.apiKey.substring(0, 16)}...` : null,
          baseUrl: localConfig?.baseUrl || IZZI_API_BASE,
          defaultModel: localConfig?.defaultModel || 'izzi/auto',
          syncedAt: new Date().toISOString(),
        });
        console.log('[Sync] Billing/plan info synced from local config');
      } catch (err: any) {
        console.warn('[Sync] Billing sync failed:', err.message);
      }

      // 5. Refresh user profile in AuthManager
      this.state.progress = 95;
      await this.auth.refreshProfile();

      this.state = {
        status: 'success',
        lastSynced: new Date().toISOString(),
        error: null,
        progress: 100,
      };
      this.db.setSetting('last_synced', this.state.lastSynced || '');
      console.log('[Sync] Completed successfully');
    } catch (err: any) {
      this.state = {
        status: 'error',
        lastSynced: this.state.lastSynced,
        error: err.message,
        progress: 0,
      };
      console.error('[Sync] Failed:', err.message);
    }

    return this.state;
  }

  getStatus(): SyncState {
    return { ...this.state };
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}
