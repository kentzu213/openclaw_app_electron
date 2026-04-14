# Errors

Command failures and integration errors.

---

## [ERR-20260331-001] electron-start-missing-binary

**Logged**: 2026-03-31T15:48:00+07:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Electron app build passes, but `pnpm --filter @openclaw/desktop start` fails because Electron binary is not installed correctly in node_modules.

### Error
`electron .` -> `Electron failed to install correctly, please delete node_modules/electron and try installing again`.

### Context
- Repo: `F:\Ai Tools\Tool Starizzi - B2C - Openclaw`
- `pnpm build:all` passes
- `pnpm dev:marketplace` starts renderer on 5173
- Native Electron launch is blocked by missing/broken Electron postinstall artifact

### Suggested Fix
Reinstall Electron package artifacts (or refresh node_modules for desktop app) before native smoke testing.

### Metadata
- Reproducible: yes
- Related Files: apps/desktop/package.json

---
