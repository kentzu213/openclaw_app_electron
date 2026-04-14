/**
 * OpenClaw Extension API
 *
 * Safe API surface exposed to extensions running inside the sandbox.
 * Extensions interact with the host through message passing — they never
 * get direct access to Node.js APIs, Electron, or the filesystem.
 *
 * Modeled after VS Code Extension API pattern.
 */

export interface OpenClawExtensionContext {
  /** Unique extension ID */
  extensionId: string;

  /** Extension install path (read-only) */
  extensionPath: string;

  /** Storage API (scoped to this extension) */
  storage: ExtensionStorageAPI;

  /** UI API */
  ui: ExtensionUIAPI;

  /** Network API (permission-gated) */
  net: ExtensionNetAPI;

  /** Logging */
  log: ExtensionLogAPI;

  /** Register disposables for cleanup */
  subscriptions: Disposable[];
}

export interface Disposable {
  dispose: () => void;
}

// ── Storage API ──
export interface ExtensionStorageAPI {
  /** Get a value from extension-scoped storage */
  get(key: string): Promise<any>;
  /** Set a value in extension-scoped storage */
  set(key: string, value: any): Promise<void>;
  /** Delete a key from storage */
  delete(key: string): Promise<void>;
  /** Get all keys */
  keys(): Promise<string[]>;
}

// ── UI API ──
export interface ExtensionUIAPI {
  /** Show an info notification */
  showNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): Promise<void>;
  /** Show a confirmation dialog */
  showConfirm(title: string, message: string): Promise<boolean>;
  /** Register a panel contribution */
  registerPanel(panelId: string, html: string): Promise<void>;
  /** Update panel content */
  updatePanel(panelId: string, html: string): Promise<void>;
  /** Show progress indicator */
  showProgress(message: string): Promise<{ done: () => void }>;
}

// ── Network API ──
export interface ExtensionNetAPI {
  /** Make an HTTP request (permission: net.http) */
  fetch(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;  // Max 30s
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>;
}

// ── Logging API ──
export interface ExtensionLogAPI {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

// ── Extension Entry Point Interface ──

/**
 * Every OpenClaw extension must export an object implementing this interface.
 *
 * Example:
 * ```ts
 * import type { OpenClawExtension } from '@openclaw/extension-sdk';
 *
 * const extension: OpenClawExtension = {
 *   activate(context) {
 *     context.log.info('Hello from my extension!');
 *     context.ui.showNotification('Extension activated!');
 *   },
 *   deactivate() {
 *     // Cleanup
 *   }
 * };
 *
 * export default extension;
 * ```
 */
export interface OpenClawExtension {
  /** Called when the extension is activated */
  activate(context: OpenClawExtensionContext): void | Promise<void>;

  /** Called when the extension is deactivated (cleanup) */
  deactivate?(): void | Promise<void>;

  /** Command handlers registered by this extension */
  commands?: Record<string, (...args: any[]) => any>;
}

// ── Host ↔ Extension Message Protocol ──

export type HostToExtMessage =
  | { type: 'activate'; extensionId: string; extensionPath: string }
  | { type: 'deactivate' }
  | { type: 'executeCommand'; commandId: string; args: any[] }
  | { type: 'storageResponse'; requestId: string; data: any; error?: string }
  | { type: 'netResponse'; requestId: string; data: any; error?: string }
  | { type: 'uiResponse'; requestId: string; data: any; error?: string };

export type ExtToHostMessage =
  | { type: 'ready' }
  | { type: 'activated'; success: boolean; error?: string }
  | { type: 'deactivated' }
  | { type: 'commandResult'; commandId: string; result: any; error?: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error' | 'debug'; message: string; args: any[] }
  | { type: 'storageRequest'; requestId: string; action: 'get' | 'set' | 'delete' | 'keys'; key?: string; value?: any }
  | { type: 'netRequest'; requestId: string; url: string; options?: any }
  | { type: 'uiRequest'; requestId: string; action: string; args: any[] }
  | { type: 'error'; message: string; stack?: string };
