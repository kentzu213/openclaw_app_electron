# @starizzi/extension-sdk

Official SDK for building **Starizzi / OpenClaw** extensions (`.ocx` format).

## Installation

```bash
npm install @starizzi/extension-sdk
```

## Quick Start

### Basic Extension

```typescript
import { defineExtension, Permissions } from '@starizzi/extension-sdk';

export default defineExtension({
  activate(ctx) {
    ctx.log.info('🚀 My extension activated!');
    ctx.ui.showNotification('Extension loaded!', 'success');
  },

  deactivate() {
    console.log('Extension deactivated');
  },

  commands: {
    'myext.greet': (name: string) => `Hello, ${name}!`,
  },
});
```

### React Panel Extension

```tsx
import { useOpenClaw, useExtensionEvent } from '@starizzi/extension-sdk';

function AnalyticsPanel() {
  const { storage, ui, log } = useOpenClaw();

  useExtensionEvent('data.updated', (payload) => {
    log.info('Analytics data refreshed');
  });

  async function handleExport() {
    await storage.set('lastExport', Date.now());
    await ui.showNotification('Data exported!', 'success');
  }

  return (
    <div>
      <h2>Analytics Dashboard</h2>
      <button onClick={handleExport}>Export Data</button>
    </div>
  );
}
```

## Manifest (`manifest.json`)

Every `.ocx` extension requires a `manifest.json`:

```json
{
  "name": "my-awesome-extension",
  "version": "1.0.0",
  "displayName": "My Awesome Extension",
  "description": "Does awesome things",
  "main": "dist/index.js",
  "engine": ">=0.1.0",
  "author": { "name": "Your Name", "email": "you@example.com" },
  "permissions": ["net.http", "storage.local", "ui.notification"],
  "activationEvents": ["onStartup"],
  "contributes": {
    "commands": [
      { "id": "myext.greet", "title": "Greet User" }
    ],
    "panels": [
      { "id": "analytics", "title": "Analytics", "entry": "panels/analytics.html" }
    ]
  },
  "categories": ["Analytics"],
  "pricing": { "model": "free" }
}
```

## Available Permissions

| Permission | Risk | Description |
|---|---|---|
| `fs.read` | 🟡 Medium | Read files |
| `fs.write` | 🔴 High | Create/modify files |
| `net.http` | 🟡 Medium | HTTP requests |
| `net.websocket` | 🟡 Medium | WebSocket |
| `ui.panel` | 🟢 Low | UI panels |
| `ui.notification` | 🟢 Low | Notifications |
| `ui.dialog` | 🟢 Low | Dialogs |
| `clipboard.read` | 🔴 High | Read clipboard |
| `clipboard.write` | 🟡 Medium | Write clipboard |
| `system.shell` | 🔴 High | Shell commands |
| `system.env` | 🔴 High | Env variables |
| `storage.local` | 🟢 Low | Local storage |
| `storage.secrets` | 🟡 Medium | Secret storage |

## API Reference

### `defineExtension(ext)` — Type-safe extension wrapper
### `useOpenClaw()` — React hook → `{ storage, ui, net, log }`
### `useExtensionEvent(event, handler)` — Event subscription with auto-cleanup
### `Permissions` — Type-safe permission constants

## Building Extensions

```bash
openclaw init        # Scaffold new extension
openclaw build       # Compile TypeScript → JS
openclaw pack        # Package → .ocx
openclaw dev         # Dev mode + hot-reload
```

## License

MIT
