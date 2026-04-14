# Starizzi Desktop Release Checklist

## Required secrets

- `GH_TOKEN`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

## Internal RC flow

1. Run `pnpm build:all`.
2. Run `pnpm --filter @openclaw/desktop test`.
3. Set mock envs when validating locally:
   - `STARIZZI_MOCK_AGENT_MODE=true`
   - `STARIZZI_MOCK_INTEGRATIONS=true`
   - `STARIZZI_MOCK_UPDATER=true`
4. Validate login, onboarding, chat stream, task creation, memory persistence, updater banner, and restart behavior.
5. Create tag `vX.Y.Z-rc.N` and confirm draft artifacts upload from GitHub Actions.

## Stable release gate

- Windows NSIS installs, launches, upgrades, and uninstalls cleanly.
- macOS DMG opens, app copies to Applications, and Gatekeeper accepts the notarized build.
- Chat remains the default landing page after login.
- Tasks, Memory, Status, Overview, Marketplace, Extensions, and Settings all render.
- Integration status refreshes after returning from browser flows.
- Auto-update can progress from `available` to `downloaded` and present restart CTA.

## Notes

- Windows signing is optional in this phase. If no certificate is configured, the NSIS installer is still published unsigned.
- macOS production release is blocked until Apple credentials and signing material are available in GitHub Actions.
