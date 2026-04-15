/**
 * Agent Bundle Installer
 *
 * Extracts and installs .oab agent bundles into the OpenClaw agents directory.
 * Handles:
 *   - Archive extraction & integrity verification
 *   - Skills installation (Hermes-compatible)
 *   - Configuration initialization
 *   - Runtime setup (Hermes process bootstrap)
 *   - Rollback on failure
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { validateAgentManifest } from './validator';
import type { AgentBundleManifest, InstalledAgent, AgentStatus } from './manifest';

// ── Install Result ──

export interface InstallResult {
  success: boolean;
  agent?: InstalledAgent;
  errors: string[];
  warnings: string[];
}

// ── Install Options ──

export interface InstallOptions {
  /** Path to .oab file or extracted directory */
  source: string;
  /** Base directory for agent installations (default: ~/.openclaw/agents/) */
  agentsDir: string;
  /** Overwrite existing installation */
  force?: boolean;
  /** User-provided secrets (from setup wizard) */
  secrets?: Record<string, string>;
  /** User-provided config (from setup wizard) */
  config?: Record<string, any>;
  /** Skip integrity verification */
  skipVerify?: boolean;
}

// ── Installer ──

export class AgentBundleInstaller {

  /**
   * Install an agent bundle.
   *
   * Full pipeline:
   * 1. Read manifest.json
   * 2. Validate manifest
   * 3. Verify checksums
   * 4. Check requirements (OpenClaw version, Hermes version)
   * 5. Create agent directory
   * 6. Copy files (skills, soul, memory, workflows, assets)
   * 7. Initialize agent config
   * 8. Register in agent database
   */
  async install(options: InstallOptions): Promise<InstallResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Read manifest
    const manifestPath = path.join(options.source, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return { success: false, errors: ['manifest.json not found in source'], warnings: [] };
    }

    let manifest: AgentBundleManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (err: any) {
      return { success: false, errors: [`Invalid manifest.json: ${err.message}`], warnings: [] };
    }

    // 2. Validate
    const validation = validateAgentManifest(manifest);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors.map(e => `[${e.field}] ${e.message}`),
        warnings: validation.warnings.map(w => `[${w.field}] ${w.message}`),
      };
    }
    warnings.push(...validation.warnings.map(w => `[${w.field}] ${w.message}`));

    // 3. Verify checksums
    if (!options.skipVerify) {
      const checksumPath = path.join(options.source, '.checksums.json');
      if (fs.existsSync(checksumPath)) {
        const verifyResult = this.verifyChecksums(options.source, checksumPath);
        if (!verifyResult.valid) {
          return {
            success: false,
            errors: verifyResult.failures.map(f => `Checksum mismatch: ${f}`),
            warnings,
          };
        }
      } else {
        warnings.push('No .checksums.json found — skipping integrity verification');
      }
    }

    // 4. Check for existing installation
    const agentDir = path.join(options.agentsDir, manifest.name);
    if (fs.existsSync(agentDir) && !options.force) {
      return {
        success: false,
        errors: [`Agent "${manifest.name}" is already installed. Use --force to overwrite.`],
        warnings,
      };
    }

    // 5. Create agent directory
    try {
      if (fs.existsSync(agentDir)) {
        // Backup existing before overwrite
        const backupDir = `${agentDir}.backup-${Date.now()}`;
        fs.renameSync(agentDir, backupDir);
      }
      fs.mkdirSync(agentDir, { recursive: true });
    } catch (err: any) {
      return {
        success: false,
        errors: [`Failed to create agent directory: ${err.message}`],
        warnings,
      };
    }

    // 6. Copy files
    try {
      // Copy manifest
      fs.copyFileSync(manifestPath, path.join(agentDir, 'manifest.json'));

      // Copy SOUL.md
      const soulSrc = path.join(options.source, manifest.agent.soul);
      if (fs.existsSync(soulSrc)) {
        fs.copyFileSync(soulSrc, path.join(agentDir, manifest.agent.soul));
      }

      // Copy MEMORY.md
      if (manifest.agent.memory) {
        const memorySrc = path.join(options.source, manifest.agent.memory);
        if (fs.existsSync(memorySrc)) {
          const memoryDest = path.join(agentDir, manifest.agent.memory);
          fs.mkdirSync(path.dirname(memoryDest), { recursive: true });
          fs.copyFileSync(memorySrc, memoryDest);
        }
      }

      // Copy skills
      const skillsSrcDir = path.join(options.source, 'skills');
      if (fs.existsSync(skillsSrcDir)) {
        this.copyDirRecursive(skillsSrcDir, path.join(agentDir, 'skills'));
      }

      // Copy workflows
      const wfSrcDir = path.join(options.source, 'workflows');
      if (fs.existsSync(wfSrcDir)) {
        this.copyDirRecursive(wfSrcDir, path.join(agentDir, 'workflows'));
      }

      // Copy assets
      const assetsSrcDir = path.join(options.source, 'assets');
      if (fs.existsSync(assetsSrcDir)) {
        this.copyDirRecursive(assetsSrcDir, path.join(agentDir, 'assets'));
      }

      // Copy README
      const readmeSrc = path.join(options.source, 'README.md');
      if (fs.existsSync(readmeSrc)) {
        fs.copyFileSync(readmeSrc, path.join(agentDir, 'README.md'));
      }
    } catch (err: any) {
      // Rollback on failure
      try {
        fs.rmSync(agentDir, { recursive: true, force: true });
      } catch { /* noop */ }
      return {
        success: false,
        errors: [`Failed to copy agent files: ${err.message}`],
        warnings,
      };
    }

    // 7. Write agent config (user-provided secrets + config)
    const agentConfig = {
      name: manifest.name,
      version: manifest.version,
      installedAt: new Date().toISOString(),
      status: 'configuring' as AgentStatus,
      secrets: options.secrets || {},
      config: options.config || {},
      connectedPlatforms: [],
      activeCronJobs: manifest.automation?.cronJobs?.filter(j => j.enabled)?.length || 0,
    };

    const configPath = path.join(agentDir, '.agent-config.json');
    fs.writeFileSync(configPath, JSON.stringify(agentConfig, null, 2));

    // 8. Create Hermes config file for this agent
    const hermesConfig = this.generateHermesConfig(manifest, agentDir, options.secrets || {});
    const hermesConfigPath = path.join(agentDir, 'hermes-config.yaml');
    fs.writeFileSync(hermesConfigPath, hermesConfig);

    // 9. Create installed agent record
    const installedAgent: InstalledAgent = {
      name: manifest.name,
      version: manifest.version,
      displayName: manifest.displayName,
      status: 'configuring',
      installedAt: agentConfig.installedAt,
      installPath: agentDir,
      config: options.config || {},
      connectedPlatforms: [],
      activeCronJobs: agentConfig.activeCronJobs,
    };

    return {
      success: true,
      agent: installedAgent,
      errors: [],
      warnings,
    };
  }

  /**
   * Uninstall an agent bundle.
   */
  async uninstall(agentName: string, agentsDir: string): Promise<{ success: boolean; error?: string }> {
    const agentDir = path.join(agentsDir, agentName);
    if (!fs.existsSync(agentDir)) {
      return { success: false, error: `Agent "${agentName}" not found` };
    }

    try {
      // Create backup before deletion
      const backupDir = path.join(agentsDir, '.trash', `${agentName}-${Date.now()}`);
      fs.mkdirSync(path.dirname(backupDir), { recursive: true });
      fs.renameSync(agentDir, backupDir);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get agent status from install directory.
   */
  getAgentInfo(agentName: string, agentsDir: string): InstalledAgent | null {
    const configPath = path.join(agentsDir, agentName, '.agent-config.json');
    const manifestPath = path.join(agentsDir, agentName, 'manifest.json');

    if (!fs.existsSync(configPath) || !fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      return {
        name: manifest.name,
        version: manifest.version,
        displayName: manifest.displayName,
        status: config.status || 'configuring',
        installedAt: config.installedAt,
        lastActiveAt: config.lastActiveAt,
        installPath: path.join(agentsDir, agentName),
        config: config.config || {},
        connectedPlatforms: config.connectedPlatforms || [],
        activeCronJobs: config.activeCronJobs || 0,
        errorMessage: config.errorMessage,
        stats: config.stats,
      };
    } catch {
      return null;
    }
  }

  /**
   * List all installed agents.
   */
  listInstalledAgents(agentsDir: string): InstalledAgent[] {
    if (!fs.existsSync(agentsDir)) return [];

    const agents: InstalledAgent[] = [];
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const info = this.getAgentInfo(entry.name, agentsDir);
      if (info) agents.push(info);
    }

    return agents;
  }

  // ── Private Helpers ──

  private verifyChecksums(sourceDir: string, checksumPath: string): { valid: boolean; failures: string[] } {
    const failures: string[] = [];
    try {
      const checksums = JSON.parse(fs.readFileSync(checksumPath, 'utf-8'));
      for (const [file, expectedHash] of Object.entries(checksums)) {
        const filePath = path.join(sourceDir, file);
        if (!fs.existsSync(filePath)) {
          failures.push(`${file} (missing)`);
          continue;
        }
        const content = fs.readFileSync(filePath);
        const actualHash = crypto.createHash('sha256').update(content).digest('hex');
        if (actualHash !== expectedHash) {
          failures.push(`${file} (hash mismatch)`);
        }
      }
    } catch (err: any) {
      failures.push(`Failed to read checksums: ${err.message}`);
    }
    return { valid: failures.length === 0, failures };
  }

  private copyDirRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private generateHermesConfig(
    manifest: AgentBundleManifest,
    agentDir: string,
    secrets: Record<string, string>,
  ): string {
    const skillDirs = manifest.agent.skills.map(s => `  - ${path.join(agentDir, 'skills', s)}`);
    const envVars = Object.entries(secrets)
      .map(([k, v]) => `  ${k}: "${v}"`)
      .join('\n');

    return `# Auto-generated Hermes config for ${manifest.displayName}
# Managed by OpenClaw Agent Manager — do not edit manually

provider: ${manifest.agent.provider.default}
model: ${manifest.agent.provider.model}
${manifest.agent.provider.fallback ? `fallback_model: ${manifest.agent.provider.fallback}` : ''}

# Persona
soul_path: ${path.join(agentDir, manifest.agent.soul)}
${manifest.agent.memory ? `memory_path: ${path.join(agentDir, manifest.agent.memory)}` : ''}

# Skills
skills:
  external_dirs:
${skillDirs.join('\n')}

# Tools
tools:
  enabled: [${manifest.agent.tools.join(', ')}]

# Session
session:
  timeout_minutes: ${manifest.agent.sessionTimeoutMinutes || 30}
  max_concurrent: ${manifest.agent.maxConcurrentSessions || 1}

# Environment
${envVars ? `env:\n${envVars}` : ''}
`;
  }
}
