/**
 * OpenClaw Agent Bundle (.oab) Manifest Schema
 *
 * .oab = OpenClaw Agent Bundle — pre-configured AI agent packages.
 * Unlike .ocx extensions (single tool/UI), an .oab bundles:
 *   - SOUL.md (persona/personality)
 *   - Skills (Hermes-compatible SKILL.md files)
 *   - Automation (cron jobs, workflows, triggers)
 *   - Connections (platform integrations)
 *   - Setup wizard (guided configuration)
 *
 * Structure of a .oab file (tar.gz):
 *   manifest.json     — agent metadata + configuration
 *   soul.md           — agent persona/personality
 *   memory.md         — initial memory/knowledge
 *   skills/           — bundled Hermes skills
 *     skill-name/
 *       SKILL.md
 *       scripts/
 *       references/
 *   workflows/        — automation workflow definitions
 *   assets/           — icons, screenshots, static files
 *   README.md         — full description
 */

// ── Agent Categories ──

export type AgentCategory =
  | 'social-media'
  | 'sales'
  | 'productivity'
  | 'content'
  | 'customer-support'
  | 'analytics'
  | 'marketing'
  | 'finance'
  | 'hr'
  | 'development'
  | 'custom';

// ── Main Manifest Interface ──

export interface AgentBundleManifest {
  // ── Identity ──
  /** Kebab-case identifier (e.g., "auto-facebook") */
  name: string;
  /** Semver version (e.g., "1.0.0") */
  version: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description (max 200 chars) */
  description: string;
  /** Long description / marketing copy */
  longDescription?: string;
  /** Emoji or relative path to icon file */
  icon: string;
  /** Agent category for marketplace discovery */
  category: AgentCategory;
  /** Tags for search */
  tags?: string[];

  // ── Author ──
  author: {
    name: string;
    email?: string;
    url?: string;
    verified?: boolean;
  };

  // ── Agent Core Configuration ──
  agent: AgentCoreConfig;

  // ── Automation ──
  automation: AgentAutomationConfig;

  // ── Connections ──
  connections: AgentConnectionsConfig;

  // ── Setup Wizard ──
  setup: AgentSetupConfig;

  // ── Marketplace Metadata ──
  marketplace: AgentMarketplaceConfig;

  // ── Requirements ──
  requirements: AgentRequirements;

  // ── Privacy & Security ──
  privacy?: {
    dataCollection: string[];
    dataStorage: 'local' | 'cloud' | 'hybrid';
    thirdPartySharing: boolean;
    gdprCompliant?: boolean;
  };
}

// ── Agent Core ──

export interface AgentCoreConfig {
  /** Relative path to SOUL.md persona file */
  soul: string;
  /** Relative path to initial MEMORY.md */
  memory?: string;
  /** Bundled skill directory names */
  skills: string[];
  /** Required Hermes toolsets */
  tools: string[];
  /** LLM provider configuration */
  provider: {
    /** Default provider: "izziapi" routes through IzziAPI Smart Router */
    default: 'izziapi' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
    /** Recommended model */
    model: string;
    /** Fallback provider if primary fails */
    fallback?: string;
    /** Minimum context window required (tokens) */
    minContextWindow?: number;
  };
  /** Maximum concurrent conversations */
  maxConcurrentSessions?: number;
  /** Session timeout in minutes */
  sessionTimeoutMinutes?: number;
}

// ── Automation ──

export interface AgentAutomationConfig {
  /** Scheduled cron jobs */
  cronJobs: CronJobDef[];
  /** Multi-step automation workflows */
  workflows: WorkflowDef[];
  /** Event-driven triggers */
  triggers: TriggerDef[];
}

export interface CronJobDef {
  /** Unique job name */
  name: string;
  /** Cron schedule expression or natural language */
  schedule: string;
  /** Skills to attach for this job */
  skills: string[];
  /** Prompt/instruction for the agent */
  prompt: string;
  /** Platform to deliver results */
  deliverTo?: string;
  /** Whether this job is enabled by default */
  enabled: boolean;
  /** Timezone (default: user's local) */
  timezone?: string;
}

export interface WorkflowDef {
  /** Unique workflow ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Workflow steps (executed sequentially) */
  steps: WorkflowStep[];
  /** Trigger condition */
  trigger?: 'manual' | 'on_message' | 'on_schedule' | 'on_event';
}

export interface WorkflowStep {
  /** Step name */
  name: string;
  /** Skills to use */
  skills: string[];
  /** Prompt template (supports {{variables}}) */
  prompt: string;
  /** Condition to execute (optional) */
  condition?: string;
  /** Output variable name */
  outputVar?: string;
}

export interface TriggerDef {
  /** Trigger name */
  name: string;
  /** Event type */
  event: 'message_received' | 'keyword_match' | 'schedule' | 'webhook' | 'api_call';
  /** Event configuration */
  config: Record<string, any>;
  /** Action to execute */
  action: {
    type: 'run_workflow' | 'send_message' | 'execute_skill';
    target: string;
    params?: Record<string, any>;
  };
}

// ── Connections ──

export interface AgentConnectionsConfig {
  /** Messaging platform configurations */
  platforms: PlatformConfig[];
  /** External API requirements */
  apis: ApiConfig[];
  /** Incoming webhook endpoints */
  webhooks: WebhookConfig[];
}

export interface PlatformConfig {
  /** Platform identifier */
  platform: 'facebook' | 'telegram' | 'zalo' | 'discord' | 'whatsapp'
    | 'slack' | 'email' | 'messenger' | 'instagram' | 'webhook';
  /** Whether this platform is required */
  required: boolean;
  /** Human-readable description of what this connection does */
  description: string;
  /** Required permissions/scopes */
  scopes?: string[];
}

export interface ApiConfig {
  /** API name */
  name: string;
  /** Base URL pattern */
  baseUrl?: string;
  /** Required for agent to function */
  required: boolean;
  /** Description */
  description: string;
  /** Documentation URL */
  docsUrl?: string;
}

export interface WebhookConfig {
  /** Webhook name */
  name: string;
  /** URL path pattern */
  path: string;
  /** HTTP methods accepted */
  methods: ('GET' | 'POST' | 'PUT')[];
  /** Description */
  description: string;
}

// ── Setup Wizard ──

export interface AgentSetupConfig {
  /** Ordered setup steps */
  steps: SetupStep[];
  /** Secrets the user must provide */
  requiredSecrets: SecretDef[];
  /** Optional configuration */
  optionalConfig: ConfigDef[];
  /** Estimated setup time in minutes */
  estimatedSetupMinutes?: number;
}

export interface SetupStep {
  /** Step ID */
  id: string;
  /** Step title */
  title: string;
  /** Step description/instructions */
  description: string;
  /** Step type */
  type: 'info' | 'secret_input' | 'oauth_connect' | 'config_form' | 'test_connection';
  /** Related secrets or configs */
  fields?: string[];
  /** Help/documentation URL */
  helpUrl?: string;
  /** Whether this step can be skipped */
  skippable?: boolean;
}

export interface SecretDef {
  /** Secret key name (e.g., "FACEBOOK_PAGE_TOKEN") */
  key: string;
  /** Human-readable label */
  label: string;
  /** Description / help text */
  description: string;
  /** URL for obtaining this secret */
  helpUrl?: string;
  /** Validation regex pattern */
  pattern?: string;
  /** Placeholder text */
  placeholder?: string;
}

export interface ConfigDef {
  /** Config key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Description */
  description?: string;
  /** Config value type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  /** Default value */
  default?: any;
  /** Options for select/multiselect */
  options?: { label: string; value: string }[];
}

// ── Marketplace ──

export interface AgentMarketplaceConfig {
  /** Pricing model */
  pricing: 'free' | 'paid' | 'freemium';
  /** Price (for paid/freemium) */
  price?: {
    monthly: number;
    yearly: number;
    currency: string;
  };
  /** Free trial days */
  trialDays?: number;
  /** Screenshot paths (relative to assets/) */
  screenshots: string[];
  /** Demo video URL */
  demoVideo?: string;
  /** Changelog (markdown) */
  changelog?: string;
  /** Featured flag (set by marketplace admin) */
  featured?: boolean;
}

// ── Requirements ──

export interface AgentRequirements {
  /** Minimum OpenClaw version */
  openclawVersion: string;
  /** Minimum Hermes Agent version */
  hermesVersion: string;
  /** Python version requirement (for Hermes runtime) */
  pythonVersion?: string;
  /** Node.js version */
  nodeVersion?: string;
  /** Minimum disk space required */
  diskSpace?: string;
  /** Supported operating systems */
  platforms?: ('windows' | 'macos' | 'linux')[];
}

// ── Agent Status (Runtime) ──

export type AgentStatus = 'installing' | 'configuring' | 'active' | 'paused' | 'error' | 'updating' | 'uninstalling';

export interface InstalledAgent {
  /** Agent bundle name */
  name: string;
  /** Installed version */
  version: string;
  /** Display name */
  displayName: string;
  /** Current status */
  status: AgentStatus;
  /** Install timestamp */
  installedAt: string;
  /** Last active timestamp */
  lastActiveAt?: string;
  /** Install path */
  installPath: string;
  /** Configuration (user-provided secrets/config) */
  config: Record<string, any>;
  /** Connected platforms */
  connectedPlatforms: string[];
  /** Active cron jobs count */
  activeCronJobs: number;
  /** Error message (if status is 'error') */
  errorMessage?: string;
  /** Usage statistics */
  stats?: {
    totalMessages: number;
    totalWorkflowRuns: number;
    totalCronRuns: number;
    lastError?: string;
  };
}
