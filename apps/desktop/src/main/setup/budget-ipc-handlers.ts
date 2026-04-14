// ── Budget IPC Handlers ──
// Connects the main-process BudgetManager, CostGate, and SmartRouter
// to the renderer process via Electron IPC.

import { ipcMain, type BrowserWindow } from 'electron';
import { BudgetManager } from './budget-manager';
import { CostGateService } from './cost-gate';
import { SmartRouter, type TaskType } from './smart-router';

let budgetManager: BudgetManager;
let costGate: CostGateService;
let smartRouter: SmartRouter;

/**
 * Initialize and register all budget-related IPC handlers.
 * Call this from the main process startup after BrowserWindow is created.
 */
export function registerBudgetHandlers(mainWindow: BrowserWindow): void {
  // ── Initialize services ──
  budgetManager = new BudgetManager();
  costGate = new CostGateService(budgetManager);
  smartRouter = new SmartRouter(budgetManager);

  // Forward alerts to renderer
  budgetManager.onAlert((alert) => {
    try {
      mainWindow.webContents.send('budget:alert', alert);
    } catch {
      // Window may be destroyed
    }
  });

  // ── Budget handlers ──

  ipcMain.handle('budget:getStatus', () => {
    return budgetManager.getStatus();
  });

  ipcMain.handle('budget:getLimits', () => {
    return budgetManager.getLimits();
  });

  ipcMain.handle('budget:setLimits', (_event, limits) => {
    budgetManager.setLimits(limits);
    return budgetManager.getLimits();
  });

  ipcMain.handle('budget:getAlerts', (_event, since?: number) => {
    return budgetManager.getAlerts(since);
  });

  ipcMain.handle('budget:getAdvice', () => {
    return budgetManager.getSubscriptionAdvice();
  });

  ipcMain.handle('budget:purge', (_event, keepDays?: number) => {
    const removed = budgetManager.purgeOldRecords(keepDays);
    return { removed };
  });

  // ── Cost Gate handlers ──

  ipcMain.handle('costGate:evaluate', (_event, request) => {
    return costGate.evaluate(request);
  });

  ipcMain.handle('costGate:getConfig', () => {
    return costGate.getConfig();
  });

  ipcMain.handle('costGate:setAutoDowngrade', (_event, enabled: boolean) => {
    costGate.setAutoDowngrade(enabled);
    return costGate.getConfig();
  });

  ipcMain.handle('costGate:setMaxCostPerRequest', (_event, usd: number) => {
    costGate.setMaxCostPerRequest(usd);
    return costGate.getConfig();
  });

  // ── Smart Router handlers ──

  ipcMain.handle('smartRouter:route', (_event, taskType: string, inputText: string, isVietnamese?: boolean) => {
    return smartRouter.route(taskType as TaskType, inputText, isVietnamese ?? true);
  });

  ipcMain.handle('smartRouter:getPreferences', () => {
    return smartRouter.getPreferences();
  });

  ipcMain.handle('smartRouter:setPreferences', (_event, prefs) => {
    smartRouter.setPreferences(prefs);
    return smartRouter.getPreferences();
  });
}

/**
 * Get the budget manager instance (for use in other main-process services).
 */
export function getBudgetManager(): BudgetManager {
  return budgetManager;
}

/**
 * Get the cost gate instance (for use in other main-process services).
 */
export function getCostGate(): CostGateService {
  return costGate;
}

/**
 * Get the smart router instance (for use in other main-process services).
 */
export function getSmartRouter(): SmartRouter {
  return smartRouter;
}
