/**
 * @openclaw/agent-bundle
 *
 * Agent Bundle (.oab) format for OpenClaw — pre-configured AI agent packages.
 * Build, validate, and install complete AI agent bundles that include
 * skills, automation, platform connections, and guided setup.
 */

// ── Manifest Types ──
export type {
  AgentBundleManifest,
  AgentCategory,
  AgentCoreConfig,
  AgentAutomationConfig,
  AgentConnectionsConfig,
  AgentSetupConfig,
  AgentMarketplaceConfig,
  AgentRequirements,
  CronJobDef,
  WorkflowDef,
  WorkflowStep,
  TriggerDef,
  PlatformConfig,
  ApiConfig,
  WebhookConfig,
  SetupStep,
  SecretDef,
  ConfigDef,
  AgentStatus,
  InstalledAgent,
} from './manifest';

// ── Validator ──
export {
  validateAgentManifest,
  isAgentManifest,
  generateAgentManifestTemplate,
} from './validator';

export type {
  ValidationResult,
  ValidationIssue,
} from './validator';

// ── Builder ──
export { AgentBundleBuilder } from './builder';
export type { BuildResult, BuildOptions } from './builder';

// ── Installer ──
export { AgentBundleInstaller } from './installer';
export type { InstallResult, InstallOptions } from './installer';
