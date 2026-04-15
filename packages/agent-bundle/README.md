# @openclaw/agent-bundle

Pre-configured AI Agent packages for OpenClaw. Build, validate, and install complete AI agent bundles.

## What is an Agent Bundle (.oab)?

Unlike `.ocx` extensions (single tool), an `.oab` bundles a **complete AI agent** with:

- **SOUL.md** — Agent persona/personality
- **Skills** — Hermes-compatible skill files
- **Automation** — Cron jobs, workflows, triggers
- **Connections** — Platform integrations (Facebook, Telegram, etc.)
- **Setup Wizard** — Guided configuration for end users

## Quick Start

```typescript
import {
  validateAgentManifest,
  AgentBundleBuilder,
  AgentBundleInstaller,
} from '@openclaw/agent-bundle';

// Validate a manifest
const result = validateAgentManifest(manifestJson);
if (!result.valid) {
  console.error(result.errors);
}

// Build a bundle
const builder = new AgentBundleBuilder();
const buildResult = await builder.build({
  sourceDir: './my-agent',
  outputDir: './dist',
});

// Install a bundle
const installer = new AgentBundleInstaller();
const installResult = await installer.install({
  source: './extracted-agent',
  agentsDir: '~/.openclaw/agents',
  secrets: { FACEBOOK_TOKEN: 'xxx' },
});
```

## Agent Bundle Structure

```
my-agent/
├── manifest.json       # Agent metadata + configuration
├── soul.md             # Agent persona
├── memory.md           # Initial knowledge (optional)
├── skills/             # Hermes-compatible skills
│   ├── skill-one/
│   │   ├── SKILL.md
│   │   └── scripts/
│   └── skill-two/
│       └── SKILL.md
├── workflows/          # Automation definitions
├── assets/             # Icons, screenshots
└── README.md           # Full description
```

## License

MIT
