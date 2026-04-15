/**
 * Agent Bundle Manifest Validator
 *
 * Validates .oab manifest.json files against the schema.
 * Two-tier validation: errors (must fix) and warnings (should fix).
 */

import type { AgentBundleManifest, AgentCategory } from './manifest';

// ── Validation Result ──

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}

// ── Regex Patterns ──

const NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

const VALID_CATEGORIES: AgentCategory[] = [
  'social-media', 'sales', 'productivity', 'content',
  'customer-support', 'analytics', 'marketing', 'finance',
  'hr', 'development', 'custom',
];

const VALID_PROVIDERS = ['izziapi', 'openai', 'anthropic', 'openrouter', 'custom'];
const VALID_PLATFORMS = [
  'facebook', 'telegram', 'zalo', 'discord', 'whatsapp',
  'slack', 'email', 'messenger', 'instagram', 'webhook',
];

// ── Main Validator ──

export function validateAgentManifest(manifest: any): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Helper
  function addError(field: string, message: string, code: string) {
    errors.push({ field, message, code });
  }
  function addWarning(field: string, message: string, code: string) {
    warnings.push({ field, message, code });
  }

  // ── Identity ──

  if (!manifest.name || typeof manifest.name !== 'string') {
    addError('name', '`name` is required and must be a string', 'MISSING_NAME');
  } else if (!NAME_REGEX.test(manifest.name)) {
    addError('name', '`name` must be kebab-case (e.g., "auto-facebook")', 'INVALID_NAME');
  } else if (manifest.name.length < 3 || manifest.name.length > 64) {
    addError('name', '`name` must be 3–64 characters', 'NAME_LENGTH');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    addError('version', '`version` is required', 'MISSING_VERSION');
  } else if (!SEMVER_REGEX.test(manifest.version)) {
    addError('version', '`version` must follow semver (e.g., "1.0.0")', 'INVALID_VERSION');
  }

  if (!manifest.displayName || typeof manifest.displayName !== 'string') {
    addError('displayName', '`displayName` is required', 'MISSING_DISPLAY_NAME');
  } else if (manifest.displayName.length > 128) {
    addError('displayName', '`displayName` must be ≤128 characters', 'DISPLAY_NAME_TOO_LONG');
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    addError('description', '`description` is required', 'MISSING_DESCRIPTION');
  } else if (manifest.description.length > 200) {
    addWarning('description', '`description` is long (>200 chars), consider shortening', 'DESCRIPTION_LONG');
  }

  if (!manifest.icon) {
    addWarning('icon', 'No `icon` specified — default icon will be used', 'MISSING_ICON');
  }

  if (!manifest.category) {
    addError('category', '`category` is required', 'MISSING_CATEGORY');
  } else if (!VALID_CATEGORIES.includes(manifest.category)) {
    addError('category', `Invalid category "${manifest.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
  }

  // ── Author ──

  if (!manifest.author || typeof manifest.author !== 'object') {
    addError('author', '`author` is required with `name` field', 'MISSING_AUTHOR');
  } else if (!manifest.author.name) {
    addError('author.name', '`author.name` is required', 'MISSING_AUTHOR_NAME');
  }

  // ── Agent Core ──

  if (!manifest.agent || typeof manifest.agent !== 'object') {
    addError('agent', '`agent` configuration is required', 'MISSING_AGENT');
  } else {
    if (!manifest.agent.soul || typeof manifest.agent.soul !== 'string') {
      addError('agent.soul', '`agent.soul` (path to SOUL.md) is required', 'MISSING_SOUL');
    }

    if (!Array.isArray(manifest.agent.skills) || manifest.agent.skills.length === 0) {
      addError('agent.skills', '`agent.skills` must be a non-empty array', 'MISSING_SKILLS');
    }

    if (!Array.isArray(manifest.agent.tools)) {
      addWarning('agent.tools', '`agent.tools` should be an array of required toolsets', 'MISSING_TOOLS');
    }

    if (!manifest.agent.provider || typeof manifest.agent.provider !== 'object') {
      addError('agent.provider', '`agent.provider` configuration is required', 'MISSING_PROVIDER');
    } else {
      if (!VALID_PROVIDERS.includes(manifest.agent.provider.default)) {
        addError(
          'agent.provider.default',
          `Invalid provider "${manifest.agent.provider.default}". Must be one of: ${VALID_PROVIDERS.join(', ')}`,
          'INVALID_PROVIDER',
        );
      }
      if (!manifest.agent.provider.model) {
        addError('agent.provider.model', '`agent.provider.model` is required', 'MISSING_MODEL');
      }
    }
  }

  // ── Automation ──

  if (manifest.automation && typeof manifest.automation === 'object') {
    if (Array.isArray(manifest.automation.cronJobs)) {
      for (let i = 0; i < manifest.automation.cronJobs.length; i++) {
        const job = manifest.automation.cronJobs[i];
        const prefix = `automation.cronJobs[${i}]`;

        if (!job.name) {
          addError(`${prefix}.name`, 'Cron job `name` is required', 'CRON_MISSING_NAME');
        }
        if (!job.schedule) {
          addError(`${prefix}.schedule`, 'Cron job `schedule` is required', 'CRON_MISSING_SCHEDULE');
        } else if (!CRON_REGEX.test(job.schedule) && !isNaturalLanguageSchedule(job.schedule)) {
          addWarning(`${prefix}.schedule`, `Schedule "${job.schedule}" doesn't look like a cron expression`, 'CRON_QUESTIONABLE_SCHEDULE');
        }
        if (!job.prompt) {
          addError(`${prefix}.prompt`, 'Cron job `prompt` is required', 'CRON_MISSING_PROMPT');
        }
      }
    }

    if (Array.isArray(manifest.automation.workflows)) {
      for (let i = 0; i < manifest.automation.workflows.length; i++) {
        const wf = manifest.automation.workflows[i];
        const prefix = `automation.workflows[${i}]`;

        if (!wf.id) addError(`${prefix}.id`, 'Workflow `id` is required', 'WF_MISSING_ID');
        if (!wf.name) addError(`${prefix}.name`, 'Workflow `name` is required', 'WF_MISSING_NAME');
        if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
          addError(`${prefix}.steps`, 'Workflow must have at least one step', 'WF_NO_STEPS');
        }
      }
    }
  } else {
    addWarning('automation', 'No `automation` config — agent won\'t have scheduled tasks', 'NO_AUTOMATION');
  }

  // ── Connections ──

  if (manifest.connections && typeof manifest.connections === 'object') {
    if (Array.isArray(manifest.connections.platforms)) {
      for (const plat of manifest.connections.platforms) {
        if (!VALID_PLATFORMS.includes(plat.platform)) {
          addWarning(
            `connections.platforms.${plat.platform}`,
            `Unknown platform "${plat.platform}"`,
            'UNKNOWN_PLATFORM',
          );
        }
      }
    }
  }

  // ── Setup ──

  if (!manifest.setup || typeof manifest.setup !== 'object') {
    addWarning('setup', 'No `setup` wizard — users will need to configure manually', 'NO_SETUP');
  } else {
    if (!Array.isArray(manifest.setup.steps) || manifest.setup.steps.length === 0) {
      addWarning('setup.steps', 'Setup has no steps defined', 'NO_SETUP_STEPS');
    }
  }

  // ── Marketplace ──

  if (!manifest.marketplace || typeof manifest.marketplace !== 'object') {
    addWarning('marketplace', 'No `marketplace` config — agent won\'t appear in store', 'NO_MARKETPLACE');
  } else {
    if (!['free', 'paid', 'freemium'].includes(manifest.marketplace.pricing)) {
      addError('marketplace.pricing', '`marketplace.pricing` must be "free", "paid", or "freemium"', 'INVALID_PRICING');
    }
    if (manifest.marketplace.pricing !== 'free' && !manifest.marketplace.price?.monthly) {
      addWarning('marketplace.price', 'Paid agent should specify `marketplace.price.monthly`', 'MISSING_PRICE');
    }
    if (!manifest.marketplace.screenshots || manifest.marketplace.screenshots.length === 0) {
      addWarning('marketplace.screenshots', 'No screenshots — agents with screenshots get 3x more installs', 'NO_SCREENSHOTS');
    }
  }

  // ── Requirements ──

  if (!manifest.requirements || typeof manifest.requirements !== 'object') {
    addError('requirements', '`requirements` is required', 'MISSING_REQUIREMENTS');
  } else {
    if (!manifest.requirements.openclawVersion) {
      addError('requirements.openclawVersion', '`requirements.openclawVersion` is required', 'MISSING_OC_VERSION');
    }
    if (!manifest.requirements.hermesVersion) {
      addError('requirements.hermesVersion', '`requirements.hermesVersion` is required', 'MISSING_HERMES_VERSION');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helpers ──

/** Check if a schedule string is natural language (Hermes supports this) */
function isNaturalLanguageSchedule(schedule: string): boolean {
  const nlPatterns = [
    /^every\s+\d+\s+(minute|hour|day|week|month)/i,
    /^daily\s+at/i,
    /^weekly\s+on/i,
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /^at\s+\d{1,2}:\d{2}/i,
  ];
  return nlPatterns.some(p => p.test(schedule));
}

/**
 * Quick check: is this object likely a valid agent manifest?
 * Useful for distinguishing .oab from .ocx without full validation.
 */
export function isAgentManifest(obj: any): obj is AgentBundleManifest {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.agent === 'object' &&
    typeof obj.agent?.soul === 'string' &&
    Array.isArray(obj.agent?.skills)
  );
}

/**
 * Generate a minimal manifest template for agent bundle authors.
 */
export function generateAgentManifestTemplate(name: string, category: AgentCategory = 'custom'): AgentBundleManifest {
  const displayName = name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return {
    name,
    version: '0.1.0',
    displayName,
    description: `${displayName} — AI agent for OpenClaw`,
    icon: '🤖',
    category,
    author: { name: 'Your Name' },
    agent: {
      soul: 'soul.md',
      memory: 'memory.md',
      skills: [],
      tools: ['terminal', 'web'],
      provider: {
        default: 'izziapi',
        model: 'gpt-4o',
      },
    },
    automation: {
      cronJobs: [],
      workflows: [],
      triggers: [],
    },
    connections: {
      platforms: [],
      apis: [],
      webhooks: [],
    },
    setup: {
      steps: [
        {
          id: 'welcome',
          title: 'Chào mừng',
          description: `Cài đặt ${displayName}. Bắt đầu setup trong 2 phút.`,
          type: 'info',
        },
      ],
      requiredSecrets: [],
      optionalConfig: [],
      estimatedSetupMinutes: 2,
    },
    marketplace: {
      pricing: 'free',
      screenshots: [],
    },
    requirements: {
      openclawVersion: '>=0.2.0',
      hermesVersion: '>=0.9.0',
      platforms: ['windows', 'macos', 'linux'],
    },
  };
}
