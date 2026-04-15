/**
 * Agent System — barrel exports
 *
 * Central index for the OpenClaw Agent system:
 * - HermesRuntime: individual agent process management
 * - AgentManager: multi-agent coordination
 * - GatewayBridge: platform connections
 */

export { HermesRuntime } from './hermes-runtime';
export type { HermesRuntimeConfig, HermesRuntimeStatus, HermesMessage, ToolCallResult } from './hermes-runtime';

export { AgentManager } from './agent-manager';
export type { AgentInfo, AgentManagerConfig } from './agent-manager';

export { GatewayBridge } from './gateway-bridge';
export type {
  PlatformName,
  ConnectionStatus,
  PlatformConnection,
  IncomingMessage,
  OutgoingMessage,
} from './gateway-bridge';

export { registerAgentIpcHandlers, shutdownAgents } from './agent-ipc-handlers';
