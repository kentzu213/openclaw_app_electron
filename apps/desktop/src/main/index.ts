import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { AuthManager } from './auth/auth-manager';
import { DatabaseManager } from './db/database';
import { SyncEngine } from './sync/sync-engine';
import { ExtensionManager } from './extensions/manager';

let mainWindow: BrowserWindow | null = null;
let authManager: AuthManager;
let dbManager: DatabaseManager;
let syncEngine: SyncEngine;
let extensionManager: ExtensionManager;

const isDev = !app.isPackaged;

// Register custom protocol for OAuth callback
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('starizzi', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('starizzi');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIPC() {
  // ── Window controls ──
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

  // ── Auth (Supabase) ──
  ipcMain.handle('auth:login', async (_event, credentials: { email: string; password: string }) => {
    return authManager.login(credentials.email, credentials.password);
  });
  ipcMain.handle('auth:loginWithGoogle', async () => {
    return authManager.loginWithGoogle();
  });
  ipcMain.handle('auth:signup', async (_event, data: { email: string; password: string; name: string }) => {
    return authManager.signup(data.email, data.password, data.name);
  });
  ipcMain.handle('auth:logout', async () => {
    return authManager.logout();
  });
  ipcMain.handle('auth:getUser', async () => {
    return authManager.getCurrentUser();
  });
  ipcMain.handle('auth:isAuthenticated', async () => {
    return authManager.isAuthenticated();
  });
  ipcMain.handle('auth:getApiKey', async () => {
    return authManager.getApiKey();
  });
  ipcMain.handle('auth:refreshProfile', async () => {
    return authManager.refreshProfile();
  });

  // ── Sync ──
  ipcMain.handle('sync:start', async () => {
    return syncEngine.startSync();
  });
  ipcMain.handle('sync:status', async () => {
    return syncEngine.getStatus();
  });

  // ── Extensions ──
  ipcMain.handle('extensions:list', async () => {
    return extensionManager.getInstalled();
  });
  ipcMain.handle('extensions:install', async (_event, extensionId: string) => {
    return extensionManager.install(extensionId);
  });
  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    return extensionManager.uninstall(extensionId);
  });
  ipcMain.handle('extensions:marketplace', async (_event, query?: string) => {
    return extensionManager.searchMarketplace(query);
  });

  // ── Shell ──
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    return shell.openExternal(url);
  });
}

async function initServices() {
  dbManager = new DatabaseManager();
  dbManager.initialize();

  authManager = new AuthManager(dbManager);
  syncEngine = new SyncEngine(authManager, dbManager);
  extensionManager = new ExtensionManager(dbManager);

  console.log('[Starizzi] Services initialized');
}

// Handle OAuth callback from custom protocol
function handleOAuthCallback(url: string) {
  if (url.startsWith('starizzi://auth/callback')) {
    authManager.handleOAuthCallback(url).then((result) => {
      if (result.success && mainWindow) {
        mainWindow.webContents.send('auth:oauthSuccess', result.user);
      }
    });
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Handle protocol URL on Windows
    const url = commandLine.find(arg => arg.startsWith('starizzi://'));
    if (url) handleOAuthCallback(url);

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  await initServices();
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Handle protocol URL on macOS
  app.on('open-url', (_event, url) => {
    handleOAuthCallback(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
