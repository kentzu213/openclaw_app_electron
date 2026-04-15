/**
 * Agent IPC Handlers
 * Registers Electron IPC handlers for the Agent Bundle system.
 * Bridges renderer requests to AgentManager operations.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { AgentManager } from './agent-manager';
import path from 'path';
import { app } from 'electron';

let agentManager: AgentManager | null = null;

function getAgentManager(): AgentManager {
  if (!agentManager) {
    agentManager = new AgentManager({
      agentsDir: path.join(app.getPath('userData'), 'agents'),
      pythonPath: 'python',
    });
  }
  return agentManager;
}

/**
 * Register all agent-related IPC handlers.
 * Called once during app initialization.
 */
export function registerAgentIpcHandlers(mainWindow: BrowserWindow): void {
  const manager = getAgentManager();

  // Forward agent events to the renderer
  manager.on('agentStatusChange', (data) => {
    mainWindow.webContents.send('agents:event', { type: 'status', ...data });
  });

  manager.on('agentError', (data) => {
    mainWindow.webContents.send('agents:event', { type: 'error', ...data });
  });

  manager.on('agentNotification', (data) => {
    mainWindow.webContents.send('agents:event', { type: 'notification', ...data });
  });

  // ── List installed agents ──
  ipcMain.handle('agents:list', async () => {
    try {
      return manager.listAgents();
    } catch (error: any) {
      console.error('[agent-ipc] list error:', error);
      return [];
    }
  });

  // ── Install agent from bundle ──
  // NOTE: For MVP, installation copies a pre-built bundle directory
  // into the agents dir. Full .oab support comes in next iteration.
  ipcMain.handle('agents:install', async (_event, params: {
    bundleId: string;
    secrets: Record<string, string>;
    config: Record<string, any>;
  }) => {
    try {
      // For now, we treat bundleId as agent name for pre-built bundles
      // and configure it with the provided secrets
      await manager.configureAgent(params.bundleId, params.secrets, params.config);
      return { success: true, agentId: params.bundleId };
    } catch (error: any) {
      console.error('[agent-ipc] install error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Uninstall agent ──
  ipcMain.handle('agents:uninstall', async (_event, agentId: string) => {
    try {
      await manager.uninstallAgent(agentId);
      return { success: true };
    } catch (error: any) {
      console.error('[agent-ipc] uninstall error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Start agent ──
  ipcMain.handle('agents:start', async (_event, agentId: string) => {
    try {
      await manager.startAgent(agentId);
      return { success: true };
    } catch (error: any) {
      console.error('[agent-ipc] start error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Stop agent ──
  ipcMain.handle('agents:stop', async (_event, agentId: string) => {
    try {
      await manager.stopAgent(agentId);
      return { success: true };
    } catch (error: any) {
      console.error('[agent-ipc] stop error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Get agent status ──
  ipcMain.handle('agents:getStatus', async (_event, agentId: string) => {
    try {
      const info = manager.getAgentInfo(agentId);
      return info || { status: 'not_found' };
    } catch (error: any) {
      console.error('[agent-ipc] getStatus error:', error);
      return { status: 'error', error: error.message };
    }
  });

  // ── Configure agent ──
  ipcMain.handle('agents:configure', async (_event, agentId: string, config: Record<string, any>) => {
    try {
      await manager.configureAgent(agentId, config.secrets || {}, config);
      return { success: true };
    } catch (error: any) {
      console.error('[agent-ipc] configure error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Send message to agent ──
  ipcMain.handle('agents:sendMessage', async (_event, agentId: string, message: string) => {
    try {
      const response = await manager.sendMessage(agentId, message);
      return { success: true, response };
    } catch (error: any) {
      console.error('[agent-ipc] sendMessage error:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Cleanup agent resources on app quit.
 */
export async function shutdownAgents(): Promise<void> {
  if (agentManager) {
    await agentManager.shutdown();
    agentManager = null;
  }
}
