/**
 * OpenClaw API Client — Renderer-side HTTP client
 * Used in browser dev mode (no Electron) to call APIs directly
 * In Electron mode, IPC is preferred via window.electronAPI
 */

const MARKETPLACE_API = 'http://localhost:8788';
const IZZI_API = 'http://localhost:8787';

class StorizziApiClient {
  private accessToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async fetch(baseUrl: string, path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // ── Marketplace API (port 8788) ──

  async getMarketplaceExtensions(params?: {
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('q', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.sort) query.set('sort', params.sort);
    const qs = query.toString();
    return this.fetch(MARKETPLACE_API, `/api/extensions${qs ? `?${qs}` : ''}`);
  }

  async getExtensionDetail(id: string) {
    return this.fetch(MARKETPLACE_API, `/api/extensions/${id}`);
  }

  async getCategories() {
    return this.fetch(MARKETPLACE_API, '/api/extensions/categories');
  }

  async installExtension(id: string) {
    return this.fetch(MARKETPLACE_API, `/api/extensions/${id}/install`, { method: 'POST' });
  }

  async getExtensionReviews(id: string) {
    return this.fetch(MARKETPLACE_API, `/api/extensions/${id}/reviews`);
  }

  async submitReview(extensionId: string, rating: number, comment: string) {
    return this.fetch(MARKETPLACE_API, `/api/extensions/${extensionId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    });
  }

  // ── Developer APIs ──

  async registerDeveloper(data: { company_name: string; website?: string; bio?: string }) {
    return this.fetch(MARKETPLACE_API, '/api/developers/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDeveloperDashboard() {
    return this.fetch(MARKETPLACE_API, '/api/developers/me');
  }

  async publishExtension(data: {
    name: string;
    display_name: string;
    description: string;
    version: string;
    category: string;
    icon_url?: string;
    price_monthly?: number;
    price_yearly?: number;
  }) {
    return this.fetch(MARKETPLACE_API, '/api/extensions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ── IzziAPI Data (via IPC) ──
  // Note: izziapi.com does NOT have /api/* REST endpoints.
  // Profile/keys/usage/billing are provided via:
  //   - Supabase auth (user identity) → electronAPI.auth.getUser()
  //   - Local ~/.openclaw/openclaw.json (API key, config) → electronAPI.auth.getApiKey()
  //   - SyncEngine caches data from /v1/models, /v1/key-info → electronAPI.sync.status()
  // In Electron mode, use window.electronAPI IPC calls.

  async getProfile() {
    // In Electron mode, profile comes from IPC (backed by Supabase auth)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.auth?.getUser) {
      return (window as any).electronAPI.auth.getUser();
    }
    // Fallback: return null (no standalone /api/auth/me endpoint)
    return null;
  }

  async getApiKeys() {
    // API key is read from local OpenClaw config by the main process
    if (typeof window !== 'undefined' && (window as any).electronAPI?.auth?.getApiKey) {
      const apiKey = await (window as any).electronAPI.auth.getApiKey();
      return { keys: apiKey ? [{ key: apiKey, status: 'active' }] : [] };
    }
    return { keys: [] };
  }

  async getUsage() {
    // Usage data synced via SyncEngine — trigger sync to refresh
    if (typeof window !== 'undefined' && (window as any).electronAPI?.sync?.status) {
      const status = await (window as any).electronAPI.sync.status();
      return { syncStatus: status, models: [] };
    }
    return { models: [] };
  }

  async getBilling() {
    // Billing info from local config (manage billing at izziapi.com/dashboard)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.auth?.getUser) {
      const user = await (window as any).electronAPI.auth.getUser();
      return { plan: user?.plan || 'free' };
    }
    return { plan: 'free' };
  }

  // ── Health check ──

  async checkMarketplaceHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${MARKETPLACE_API}/`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const apiClient = new StorizziApiClient();
