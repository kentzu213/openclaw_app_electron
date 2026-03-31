/**
 * Starizzi API Client — Renderer-side HTTP client
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

  // ── IzziAPI Backend (port 8787) ──

  async getProfile() {
    return this.fetch(IZZI_API, '/api/auth/me');
  }

  async getApiKeys() {
    return this.fetch(IZZI_API, '/api/keys');
  }

  async getUsage() {
    return this.fetch(IZZI_API, '/api/usage');
  }

  async getBilling() {
    return this.fetch(IZZI_API, '/api/billing');
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
