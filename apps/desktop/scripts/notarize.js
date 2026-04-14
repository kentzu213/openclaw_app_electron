#!/usr/bin/env node

// ── macOS Notarization Script ──
// Called by electron-builder via "afterSign" hook.
// Requires: APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID env vars.

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('⏭️  Skipping notarization (not macOS)');
    return;
  }

  const appId = 'com.izziapi.openclaw';
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // Check for required env vars
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
    console.log('⚠️  Skipping notarization: APPLE_ID or APPLE_ID_PASSWORD not set');
    return;
  }

  console.log(`🔏 Notarizing ${appId}...`);

  try {
    await notarize({
      tool: 'notarytool',
      appBundleId: appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
    console.log('✅ Notarization complete');
  } catch (error) {
    console.error('❌ Notarization failed:', error);
    throw error;
  }
};
