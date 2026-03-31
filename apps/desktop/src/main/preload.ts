import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Auth (Supabase-based)
  auth: {
    login: (credentials: { email: string; password: string }) =>
      ipcRenderer.invoke('auth:login', credentials),
    loginWithGoogle: () => ipcRenderer.invoke('auth:loginWithGoogle'),
    signup: (data: { email: string; password: string; name: string }) =>
      ipcRenderer.invoke('auth:signup', data),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    isAuthenticated: () => ipcRenderer.invoke('auth:isAuthenticated'),
    getApiKey: () => ipcRenderer.invoke('auth:getApiKey'),
    refreshProfile: () => ipcRenderer.invoke('auth:refreshProfile'),
  },

  // Sync
  sync: {
    start: () => ipcRenderer.invoke('sync:start'),
    status: () => ipcRenderer.invoke('sync:status'),
  },

  // Extensions
  extensions: {
    list: () => ipcRenderer.invoke('extensions:list'),
    install: (extensionId: string) => ipcRenderer.invoke('extensions:install', extensionId),
    uninstall: (extensionId: string) => ipcRenderer.invoke('extensions:uninstall', extensionId),
    marketplace: (query?: string) => ipcRenderer.invoke('extensions:marketplace', query),
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Platform info
  platform: {
    isElectron: true,
    os: process.platform,
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
