/**
 * Gateway Bridge
 *
 * Connects Hermes Gateway (multi-platform messaging) to the Electron app.
 * Manages platform connections (Facebook, Telegram, Zalo, etc.) and
 * routes incoming messages to the correct agent runtime.
 *
 * Architecture:
 *   External Platform → Hermes Gateway → GatewayBridge → AgentManager → HermesRuntime
 *                                                         ↓
 *                                                    Electron UI (notifications)
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ──

export type PlatformName = 'facebook' | 'telegram' | 'zalo' | 'discord'
  | 'whatsapp' | 'slack' | 'email' | 'messenger' | 'instagram' | 'webhook';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'rate_limited';

export interface PlatformConnection {
  platform: PlatformName;
  agentName: string;
  status: ConnectionStatus;
  connectedAt?: string;
  lastMessageAt?: string;
  errorMessage?: string;
  config: Record<string, any>;
  stats: {
    messagesReceived: number;
    messagesSent: number;
    errors: number;
  };
}

export interface IncomingMessage {
  platform: PlatformName;
  agentName: string;
  sender: {
    id: string;
    name?: string;
    avatar?: string;
  };
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface OutgoingMessage {
  platform: PlatformName;
  recipientId: string;
  content: string;
  attachments?: Array<{
    type: 'image' | 'file' | 'link';
    url: string;
    name?: string;
  }>;
}

// ── Gateway Bridge ──

export class GatewayBridge extends EventEmitter {
  private connections = new Map<string, PlatformConnection>();
  private agentsDir: string;

  constructor(agentsDir: string) {
    super();
    this.agentsDir = agentsDir;
  }

  /**
   * Connect a platform for a specific agent.
   */
  async connectPlatform(
    agentName: string,
    platform: PlatformName,
    config: Record<string, any>,
  ): Promise<PlatformConnection> {
    const key = this.connectionKey(agentName, platform);

    // Check if already connected
    if (this.connections.has(key)) {
      const existing = this.connections.get(key)!;
      if (existing.status === 'connected') return existing;
    }

    const connection: PlatformConnection = {
      platform,
      agentName,
      status: 'connecting',
      config,
      stats: { messagesReceived: 0, messagesSent: 0, errors: 0 },
    };

    this.connections.set(key, connection);
    this.emit('connecting', { agent: agentName, platform });

    try {
      // Validate platform credentials
      await this.validatePlatformCredentials(platform, config);

      connection.status = 'connected';
      connection.connectedAt = new Date().toISOString();

      // Persist connection state
      this.persistConnectionState(agentName);

      this.emit('connected', { agent: agentName, platform });
      return connection;

    } catch (err: any) {
      connection.status = 'error';
      connection.errorMessage = err.message;
      this.emit('connectionError', { agent: agentName, platform, error: err.message });
      return connection;
    }
  }

  /**
   * Disconnect a platform.
   */
  async disconnectPlatform(agentName: string, platform: PlatformName): Promise<void> {
    const key = this.connectionKey(agentName, platform);
    const connection = this.connections.get(key);

    if (connection) {
      connection.status = 'disconnected';
      this.connections.delete(key);
      this.persistConnectionState(agentName);
      this.emit('disconnected', { agent: agentName, platform });
    }
  }

  /**
   * Get all connections for an agent.
   */
  getAgentConnections(agentName: string): PlatformConnection[] {
    return Array.from(this.connections.values())
      .filter(c => c.agentName === agentName);
  }

  /**
   * Get all active connections.
   */
  getAllConnections(): PlatformConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Handle incoming message from a platform.
   * Routes to the correct agent.
   */
  async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    const key = this.connectionKey(message.agentName, message.platform);
    const connection = this.connections.get(key);

    if (!connection || connection.status !== 'connected') {
      this.emit('messageDropped', { reason: 'not connected', message });
      return;
    }

    // Update stats
    connection.stats.messagesReceived++;
    connection.lastMessageAt = message.timestamp;

    // Forward to agent (via event — AgentManager listens)
    this.emit('incomingMessage', message);
  }

  /**
   * Send a message to a platform.
   */
  async sendPlatformMessage(
    agentName: string,
    platform: PlatformName,
    message: OutgoingMessage,
  ): Promise<void> {
    const key = this.connectionKey(agentName, platform);
    const connection = this.connections.get(key);

    if (!connection || connection.status !== 'connected') {
      throw new Error(`Not connected to ${platform} for agent ${agentName}`);
    }

    // Platform-specific sending logic would go here
    // For now, emit event for the gateway process to handle
    this.emit('outgoingMessage', { agent: agentName, platform, message });
    connection.stats.messagesSent++;
  }

  /**
   * Test a platform connection.
   */
  async testConnection(platform: PlatformName, config: Record<string, any>): Promise<{
    success: boolean;
    message: string;
    details?: Record<string, any>;
  }> {
    try {
      await this.validatePlatformCredentials(platform, config);
      return { success: true, message: `Successfully connected to ${platform}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Disconnect all platforms for an agent (for uninstall).
   */
  async disconnectAll(agentName: string): Promise<void> {
    const connections = this.getAgentConnections(agentName);
    for (const conn of connections) {
      await this.disconnectPlatform(agentName, conn.platform);
    }
  }

  /**
   * Shutdown all connections.
   */
  async shutdown(): Promise<void> {
    for (const [, connection] of this.connections) {
      connection.status = 'disconnected';
    }
    this.connections.clear();
    this.emit('shutdown');
  }

  // ── Private Helpers ──

  private connectionKey(agentName: string, platform: PlatformName): string {
    return `${agentName}:${platform}`;
  }

  private async validatePlatformCredentials(platform: PlatformName, config: Record<string, any>): Promise<void> {
    switch (platform) {
      case 'facebook':
      case 'messenger':
        if (!config.pageAccessToken) {
          throw new Error('Facebook Page Access Token is required');
        }
        // In production: validate token against Graph API
        break;

      case 'telegram':
        if (!config.botToken) {
          throw new Error('Telegram Bot Token is required');
        }
        // In production: validate via getMe API call
        break;

      case 'zalo':
        if (!config.oaAccessToken) {
          throw new Error('Zalo OA Access Token is required');
        }
        break;

      case 'discord':
        if (!config.botToken) {
          throw new Error('Discord Bot Token is required');
        }
        break;

      case 'slack':
        if (!config.botToken && !config.appToken) {
          throw new Error('Slack Bot Token or App Token is required');
        }
        break;

      case 'email':
        if (!config.smtpHost || !config.smtpUser) {
          throw new Error('SMTP configuration is required');
        }
        break;

      case 'whatsapp':
        if (!config.phoneNumberId || !config.accessToken) {
          throw new Error('WhatsApp Business API credentials are required');
        }
        break;

      case 'webhook':
        // Webhooks don't need validation
        break;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private persistConnectionState(agentName: string): void {
    const connections = this.getAgentConnections(agentName);
    const stateFile = path.join(this.agentsDir, agentName, '.gateway-state.json');

    try {
      const state = connections.map(c => ({
        platform: c.platform,
        status: c.status,
        connectedAt: c.connectedAt,
        stats: c.stats,
      }));
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch { /* ignore */ }
  }
}
