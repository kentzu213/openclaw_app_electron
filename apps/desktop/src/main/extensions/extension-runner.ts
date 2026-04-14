/**
 * OpenClaw Extension Runner
 *
 * This script runs inside a forked child_process.
 * It loads the extension code and provides the sandboxed API surface.
 * The main process communicates with this runner via IPC messages.
 *
 * IMPORTANT: This file runs in an isolated process with no access to
 * Electron APIs, BrowserWindow, or the main process globals.
 */

import type {
  HostToExtMessage,
  ExtToHostMessage,
  OpenClawExtension,
  OpenClawExtensionContext,
} from './extension-api';

const extensionId = process.env.OPENCLAW_EXT_ID || 'unknown';
const extensionPath = process.env.OPENCLAW_EXT_PATH || '.';

let extension: OpenClawExtension | null = null;
let context: OpenClawExtensionContext | null = null;
const subscriptions: Array<{ dispose: () => void }> = [];

// ── Send message to host ──
function sendToHost(msg: ExtToHostMessage): void {
  if (process.send) {
    process.send(msg);
  }
}

// ── Request/Response tracking ──
let requestIdCounter = 0;
const pendingRequests = new Map<string, {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
}>();

function nextRequestId(): string {
  return `req_${++requestIdCounter}`;
}

function requestFromHost(msg: Omit<ExtToHostMessage, 'requestId'> & { requestId?: string }): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = msg.requestId || nextRequestId();
    (msg as any).requestId = requestId;
    pendingRequests.set(requestId, { resolve, reject });
    sendToHost(msg as ExtToHostMessage);

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timed out'));
      }
    }, 30_000);
  });
}

// ── Build sandboxed context ──
function buildContext(extId: string, extPath: string): OpenClawExtensionContext {
  return {
    extensionId: extId,
    extensionPath: extPath,
    subscriptions,

    storage: {
      async get(key: string) {
        return requestFromHost({
          type: 'storageRequest',
          action: 'get',
          key,
        } as any);
      },
      async set(key: string, value: any) {
        await requestFromHost({
          type: 'storageRequest',
          action: 'set',
          key,
          value,
        } as any);
      },
      async delete(key: string) {
        await requestFromHost({
          type: 'storageRequest',
          action: 'delete',
          key,
        } as any);
      },
      async keys() {
        return requestFromHost({
          type: 'storageRequest',
          action: 'keys',
        } as any);
      },
    },

    ui: {
      async showNotification(message: string, type: string = 'info') {
        await requestFromHost({
          type: 'uiRequest',
          action: 'showNotification',
          args: [message, type],
        } as any);
      },
      async showConfirm(title: string, message: string) {
        const result = await requestFromHost({
          type: 'uiRequest',
          action: 'showConfirm',
          args: [title, message],
        } as any);
        return result?.confirmed ?? false;
      },
      async registerPanel(panelId: string, html: string) {
        await requestFromHost({
          type: 'uiRequest',
          action: 'registerPanel',
          args: [panelId, html],
        } as any);
      },
      async updatePanel(panelId: string, html: string) {
        await requestFromHost({
          type: 'uiRequest',
          action: 'updatePanel',
          args: [panelId, html],
        } as any);
      },
      async showProgress(message: string) {
        await requestFromHost({
          type: 'uiRequest',
          action: 'showProgress',
          args: [message],
        } as any);
        return {
          done: () => {
            sendToHost({
              type: 'uiRequest',
              action: 'hideProgress',
              args: [],
            } as any);
          },
        };
      },
    },

    net: {
      async fetch(url: string, options?: any) {
        return requestFromHost({
          type: 'netRequest',
          url,
          options,
        } as any);
      },
    },

    log: {
      info(message: string, ...args: any[]) {
        sendToHost({ type: 'log', level: 'info', message, args });
      },
      warn(message: string, ...args: any[]) {
        sendToHost({ type: 'log', level: 'warn', message, args });
      },
      error(message: string, ...args: any[]) {
        sendToHost({ type: 'log', level: 'error', message, args });
      },
      debug(message: string, ...args: any[]) {
        sendToHost({ type: 'log', level: 'debug', message, args });
      },
    },
  };
}

// ── Handle messages from host ──
process.on('message', async (msg: HostToExtMessage) => {
  try {
    switch (msg.type) {
      case 'activate': {
        try {
          // Load the extension module
          const mainPath = require('path').resolve(extensionPath, 'dist', 'index.js');
          const mod = require(mainPath);
          extension = mod.default || mod;

          if (!extension || typeof extension.activate !== 'function') {
            sendToHost({
              type: 'activated',
              success: false,
              error: 'Extension must export an object with an activate() function',
            });
            return;
          }

          // Build context and activate
          context = buildContext(msg.extensionId, msg.extensionPath);
          await extension.activate(context);

          sendToHost({ type: 'activated', success: true });
        } catch (err: any) {
          sendToHost({
            type: 'activated',
            success: false,
            error: err.message || 'Activation failed',
          });
        }
        break;
      }

      case 'deactivate': {
        try {
          if (extension?.deactivate) {
            await extension.deactivate();
          }
          // Dispose all subscriptions
          for (const sub of subscriptions) {
            try { sub.dispose(); } catch { /* ignore */ }
          }
          subscriptions.length = 0;
        } catch { /* ignore */ }
        sendToHost({ type: 'deactivated' });
        // Give a moment then exit
        setTimeout(() => process.exit(0), 200);
        break;
      }

      case 'executeCommand': {
        try {
          const handler = extension?.commands?.[msg.commandId];
          if (!handler) {
            sendToHost({
              type: 'commandResult',
              commandId: msg.commandId,
              result: null,
              error: `Unknown command: ${msg.commandId}`,
            });
            return;
          }

          const result = await handler(...msg.args);
          sendToHost({
            type: 'commandResult',
            commandId: msg.commandId,
            result,
          });
        } catch (err: any) {
          sendToHost({
            type: 'commandResult',
            commandId: msg.commandId,
            result: null,
            error: err.message,
          });
        }
        break;
      }

      // Responses from host for our requests
      case 'storageResponse':
      case 'netResponse':
      case 'uiResponse': {
        const requestId = (msg as any).requestId;
        const pending = pendingRequests.get(requestId);
        if (pending) {
          pendingRequests.delete(requestId);
          if ((msg as any).error) {
            pending.reject(new Error((msg as any).error));
          } else {
            pending.resolve((msg as any).data);
          }
        }
        break;
      }
    }
  } catch (err: any) {
    sendToHost({ type: 'error', message: err.message, stack: err.stack });
  }
});

// ── Unhandled errors ──
process.on('uncaughtException', (err) => {
  sendToHost({ type: 'error', message: `Uncaught: ${err.message}`, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  sendToHost({ type: 'error', message: `Unhandled rejection: ${reason?.message || reason}` });
});

// ── Signal ready ──
sendToHost({ type: 'ready' });
