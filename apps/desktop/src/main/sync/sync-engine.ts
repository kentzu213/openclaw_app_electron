import { AuthManager } from '../auth/auth-manager';
import { DatabaseManager } from '../db/database';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

interface SyncState {
  status: SyncStatus;
  lastSynced: string | null;
  error: string | null;
  progress: number;
}

// IzziAPI.com backend URL
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

  async startSync(): Promise<SyncState> {
    if (!this.auth.isAuthenticated()) {
      return { ...this.state, status: 'error', error: 'Not authenticated' };
    }

    if (this.state.status === 'syncing') {
      return this.state;
    }

    this.state = { status: 'syncing', lastSynced: this.state.lastSynced, error: null, progress: 0 };

    try {
      const token = await this.auth.getAccessToken();
      if (!token) {
        throw new Error('No access token available');
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // 1. Sync user profile from izzi-backend /api/auth/me
      this.state.progress = 20;
      try {
        const profileRes = await fetch(`${IZZI_API_BASE}/api/auth/me`, { headers });
        if (profileRes.ok) {
          const profileData = await profileRes.json() as any;
          this.db.cacheUserData('profile', 'profile', profileData as object);
          console.log('[Sync] Profile synced:', profileData.email);
        }
      } catch (err: any) {
        console.warn('[Sync] Profile sync failed:', err.message);
      }

      // 2. Sync API keys from izzi-backend /api/keys
      this.state.progress = 40;
      try {
        const keysRes = await fetch(`${IZZI_API_BASE}/api/keys`, { headers });
        if (keysRes.ok) {
          const keysData = await keysRes.json() as any;
          this.db.cacheUserData('api_keys', 'api_keys', keysData as object);
          console.log('[Sync] API keys synced');
        }
      } catch (err: any) {
        console.warn('[Sync] API keys sync failed:', err.message);
      }

      // 3. Sync usage data from izzi-backend /api/usage
      this.state.progress = 60;
      try {
        const usageRes = await fetch(`${IZZI_API_BASE}/api/usage`, { headers });
        if (usageRes.ok) {
          const usageData = await usageRes.json() as any;
          this.db.cacheUserData('usage', 'usage', usageData as object);
          console.log('[Sync] Usage data synced');
        }
      } catch (err: any) {
        console.warn('[Sync] Usage sync failed:', err.message);
      }

      // 4. Sync billing from izzi-backend /api/billing
      this.state.progress = 80;
      try {
        const billingRes = await fetch(`${IZZI_API_BASE}/api/billing`, { headers });
        if (billingRes.ok) {
          const billingData = await billingRes.json() as any;
          this.db.cacheUserData('billing', 'billing', billingData as object);
          console.log('[Sync] Billing data synced');
        }
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
