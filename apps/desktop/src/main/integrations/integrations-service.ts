import { shell } from 'electron';
import { AuthManager } from '../auth/auth-manager';
import { DatabaseManager } from '../db/database';
import type { IntegrationConnection, IntegrationProvider } from '../agent/types';

/**
 * IntegrationsService — Local-first integration management.
 * 
 * Integrations (Telegram, Discord, Zalo) are managed locally via the database.
 * No backend /api/integrations endpoint exists on izziapi.com.
 * 
 * Connect URLs point to the izziapi.com dashboard where users can
 * set up their integrations via the web UI.
 */

const INTEGRATIONS_KEY = 'integrations_state';
const IZZI_DASHBOARD = 'https://izziapi.com/dashboard';

function normalizeProvider(provider: unknown): IntegrationProvider | null {
  const value = String(provider ?? '').toLowerCase();
  if (value === 'telegram' || value === 'discord' || value === 'zalo') {
    return value;
  }
  return null;
}

function normalizeStatus(status: unknown): IntegrationConnection['status'] {
  const value = String(status ?? '').toLowerCase();
  if (value === 'connected' || value === 'disconnected' || value === 'pending' || value === 'error') {
    return value;
  }
  return 'disconnected';
}

function normalizeList(payload: unknown): IntegrationConnection[] {
  const rawList = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { integrations?: unknown[] }).integrations)
      ? (payload as { integrations: unknown[] }).integrations
      : [];

  const seen = new Set<IntegrationProvider>();
  const normalized: IntegrationConnection[] = [];

  rawList.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;

    const data = entry as Record<string, unknown>;
    const provider = normalizeProvider(data.provider);
    if (!provider) return;

    seen.add(provider);
    normalized.push({
      provider,
      status: normalizeStatus(data.status),
      accountLabel: typeof data.accountLabel === 'string'
        ? data.accountLabel
        : typeof data.account_label === 'string'
          ? data.account_label
          : undefined,
      connectedAt: typeof data.connectedAt === 'string'
        ? data.connectedAt
        : typeof data.connected_at === 'string'
          ? data.connected_at
          : undefined,
      lastError: typeof data.lastError === 'string'
        ? data.lastError
        : typeof data.error === 'string'
          ? data.error
          : undefined,
    });
  });

  for (const provider of ['telegram', 'discord', 'zalo'] satisfies IntegrationProvider[]) {
    if (!seen.has(provider)) {
      normalized.push({ provider, status: 'disconnected' });
    }
  }

  return normalized.sort((left, right) => left.provider.localeCompare(right.provider));
}

function defaultConnections(): IntegrationConnection[] {
  return (['telegram', 'discord', 'zalo'] satisfies IntegrationProvider[]).map((provider) => ({
    provider,
    status: 'disconnected',
  }));
}

export class IntegrationsService {
  private auth: AuthManager;
  private db: DatabaseManager;

  constructor(auth: AuthManager, db: DatabaseManager) {
    this.auth = auth;
    this.db = db;
  }

  /**
   * List all integrations from local database.
   * No backend API call needed — state is stored locally.
   */
  async list(): Promise<IntegrationConnection[]> {
    return this.readConnections();
  }

  /**
   * Begin connecting an integration provider.
   * Opens izziapi.com dashboard for the user to configure.
   * Updates local state to 'pending'.
   */
  async beginConnect(provider: IntegrationProvider): Promise<{ provider: IntegrationProvider; url: string }> {
    const url = `${IZZI_DASHBOARD}/integrations/${provider}`;

    // Update local state to pending
    const connections = this.readConnections().map((integration) =>
      integration.provider === provider
        ? {
            ...integration,
            status: 'pending' as const,
          }
        : integration,
    );
    this.writeConnections(connections);

    await shell.openExternal(url);
    return { provider, url };
  }

  /**
   * Mark a provider as connected (called after successful setup).
   */
  async markConnected(provider: IntegrationProvider, accountLabel?: string): Promise<IntegrationConnection[]> {
    const connections = this.readConnections().map((integration) =>
      integration.provider === provider
        ? {
            ...integration,
            status: 'connected' as const,
            accountLabel: accountLabel || `${provider} workspace`,
            connectedAt: new Date().toISOString(),
            lastError: undefined,
          }
        : integration,
    );
    this.writeConnections(connections);
    return connections;
  }

  /**
   * Disconnect an integration provider.
   * Updates local state — no backend call needed.
   */
  async disconnect(provider: IntegrationProvider): Promise<IntegrationConnection[]> {
    const connections = this.readConnections().map((integration) =>
      integration.provider === provider
        ? {
            provider,
            status: 'disconnected' as const,
          }
        : integration,
    );
    this.writeConnections(connections);
    return connections;
  }

  private readConnections(): IntegrationConnection[] {
    const raw = this.db.getSetting(INTEGRATIONS_KEY);
    if (!raw) {
      return defaultConnections();
    }

    try {
      return normalizeList(JSON.parse(raw));
    } catch {
      return defaultConnections();
    }
  }

  private writeConnections(connections: IntegrationConnection[]): void {
    this.db.setSetting(INTEGRATIONS_KEY, JSON.stringify(connections));
  }
}
