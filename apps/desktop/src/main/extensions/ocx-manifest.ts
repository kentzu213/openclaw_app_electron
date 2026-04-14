/**
 * OpenClaw .ocx Extension Manifest Schema & Validation
 *
 * .ocx = OpenClaw eXtension — custom package format for OpenClaw extensions.
 * Similar to .vsix for VS Code, .crx for Chrome.
 *
 * Structure of a .ocx file (tar.gz):
 *   manifest.json    — metadata + permissions + entry points
 *   icon.png         — 128x128 extension icon (optional)
 *   dist/            — compiled JS bundle (single entry point)
 *     index.js
 *   assets/          — static assets (optional)
 *   README.md        — description (optional)
 */

export interface OcxManifest {
  // Required fields
  name: string;           // kebab-case identifier (e.g., "smart-seo-scanner")
  version: string;        // semver (e.g., "1.2.0")
  displayName: string;    // Human-readable name
  description: string;    // Short description
  main: string;           // Entry point relative to package root (e.g., "dist/index.js")
  engine: string;         // Required OpenClaw version (e.g., ">=0.1.0")

  // Author info
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  // Permissions
  permissions: string[];  // e.g., ["net.http", "ui.panel", "storage.local"]

  // Extension capabilities
  activationEvents: string[]; // When to activate: "onCommand:*", "onStartup", "onPanel:*"
  contributes: {
    commands?: OcxCommand[];
    panels?: OcxPanel[];
    settings?: OcxSetting[];
  };

  // Marketplace
  categories?: string[];  // e.g., ["SEO", "Marketing"]
  tags?: string[];
  repository?: string;
  homepage?: string;
  license?: string;

  // Pricing
  pricing?: {
    model: 'free' | 'paid' | 'freemium';
    price?: {
      monthly?: number;
      yearly?: number;
      currency?: string;  // Default: USD
    };
  };

  // Icon
  icon?: string;          // Relative path to icon file (e.g., "icon.png")

  // Optional
  private?: boolean;      // If true, not listed on marketplace
}

export interface OcxCommand {
  id: string;             // e.g., "smart-seo-scanner.runScan"
  title: string;          // e.g., "Quét SEO"
  category?: string;      // e.g., "SEO"
  icon?: string;          // Emoji or icon path
}

export interface OcxPanel {
  id: string;             // e.g., "smart-seo-scanner.dashboard"
  title: string;          // e.g., "SEO Dashboard"
  entry: string;          // HTML file or component entry
}

export interface OcxSetting {
  id: string;
  title: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: any;
  options?: { label: string; value: string }[]; // For 'select' type
}

// ── Validation ──

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

export function validateManifest(manifest: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('`name` is required and must be a string');
  } else if (!NAME_REGEX.test(manifest.name)) {
    errors.push('`name` must be kebab-case (e.g., "my-extension")');
  } else if (manifest.name.length < 3 || manifest.name.length > 64) {
    errors.push('`name` must be 3-64 characters');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('`version` is required and must be a string');
  } else if (!SEMVER_REGEX.test(manifest.version)) {
    errors.push('`version` must follow semver (e.g., "1.0.0")');
  }

  if (!manifest.displayName || typeof manifest.displayName !== 'string') {
    errors.push('`displayName` is required and must be a string');
  } else if (manifest.displayName.length > 128) {
    errors.push('`displayName` must be ≤128 characters');
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('`description` is required');
  } else if (manifest.description.length > 500) {
    warnings.push('`description` is very long (>500 chars), consider shortening');
  }

  if (!manifest.main || typeof manifest.main !== 'string') {
    errors.push('`main` entry point is required');
  } else if (manifest.main.includes('..')) {
    errors.push('`main` must not contain path traversal (..)');
  }

  if (!manifest.engine || typeof manifest.engine !== 'string') {
    errors.push('`engine` (required OpenClaw version) is required');
  }

  // Author
  if (!manifest.author || typeof manifest.author !== 'object') {
    errors.push('`author` is required and must be an object with `name`');
  } else if (!manifest.author.name) {
    errors.push('`author.name` is required');
  }

  // Permissions
  if (!Array.isArray(manifest.permissions)) {
    errors.push('`permissions` must be an array');
  }

  // Activation events
  if (!Array.isArray(manifest.activationEvents)) {
    errors.push('`activationEvents` must be an array');
  }

  // Contributes
  if (!manifest.contributes || typeof manifest.contributes !== 'object') {
    errors.push('`contributes` is required');
  } else {
    if (manifest.contributes.commands && !Array.isArray(manifest.contributes.commands)) {
      errors.push('`contributes.commands` must be an array');
    }
    if (manifest.contributes.panels && !Array.isArray(manifest.contributes.panels)) {
      errors.push('`contributes.panels` must be an array');
    }
  }

  // Pricing validation
  if (manifest.pricing) {
    if (!['free', 'paid', 'freemium'].includes(manifest.pricing.model)) {
      errors.push('`pricing.model` must be "free", "paid", or "freemium"');
    }
    if (manifest.pricing.model !== 'free' && !manifest.pricing.price?.monthly) {
      warnings.push('Paid extension should specify `pricing.price.monthly`');
    }
  }

  // Warnings for recommended fields
  if (!manifest.categories || manifest.categories.length === 0) {
    warnings.push('No `categories` specified — will be harder to discover on Marketplace');
  }
  if (!manifest.icon) {
    warnings.push('No `icon` specified — default icon will be used');
  }
  if (!manifest.repository) {
    warnings.push('No `repository` — recommended for trust');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate a minimal manifest template for extension authors.
 */
export function generateManifestTemplate(name: string): OcxManifest {
  return {
    name,
    version: '0.1.0',
    displayName: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: 'My OpenClaw extension',
    main: 'dist/index.js',
    engine: '>=0.1.0',
    author: { name: 'Your Name' },
    permissions: ['storage.local'],
    activationEvents: ['onCommand:*'],
    contributes: {
      commands: [
        {
          id: `${name}.hello`,
          title: 'Hello World',
          category: 'General',
        },
      ],
    },
    categories: ['Utilities'],
    pricing: { model: 'free' },
  };
}
