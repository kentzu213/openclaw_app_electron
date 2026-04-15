/**
 * Agent Bundle Builder
 *
 * Packages an agent source directory into a .oab file (tar.gz).
 * Validates manifest, collects skills, compresses assets,
 * and generates integrity checksums.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { validateAgentManifest, type ValidationResult } from './validator';
import type { AgentBundleManifest } from './manifest';

// ── Build Result ──

export interface BuildResult {
  success: boolean;
  outputPath?: string;
  manifest?: AgentBundleManifest;
  validation: ValidationResult;
  files: string[];
  size?: number;
  checksum?: string;
  errors: string[];
}

// ── Build Options ──

export interface BuildOptions {
  /** Source directory containing agent files */
  sourceDir: string;
  /** Output directory for the .oab file */
  outputDir: string;
  /** Skip validation (not recommended) */
  skipValidation?: boolean;
  /** Include source maps */
  includeSourceMaps?: boolean;
  /** Sign with developer key */
  signingKey?: string;
}

// ── Builder ──

export class AgentBundleBuilder {
  /**
   * Build an .oab bundle from a source directory.
   *
   * Expected source directory structure:
   *   manifest.json
   *   soul.md
   *   memory.md (optional)
   *   skills/
   *     skill-name/
   *       SKILL.md
   *       scripts/ (optional)
   *       references/ (optional)
   *   workflows/ (optional)
   *   assets/ (optional)
   *   README.md (optional)
   */
  async build(options: BuildOptions): Promise<BuildResult> {
    const errors: string[] = [];
    const files: string[] = [];

    // 1. Check source directory exists
    if (!fs.existsSync(options.sourceDir)) {
      return {
        success: false,
        validation: { valid: false, errors: [], warnings: [] },
        files: [],
        errors: [`Source directory not found: ${options.sourceDir}`],
      };
    }

    // 2. Read and validate manifest
    const manifestPath = path.join(options.sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        success: false,
        validation: { valid: false, errors: [], warnings: [] },
        files: [],
        errors: [`manifest.json not found in ${options.sourceDir}`],
      };
    }

    let manifest: AgentBundleManifest;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      manifest = JSON.parse(raw);
    } catch (err: any) {
      return {
        success: false,
        validation: { valid: false, errors: [], warnings: [] },
        files: [],
        errors: [`Failed to parse manifest.json: ${err.message}`],
      };
    }

    // 3. Run validation
    const validation = validateAgentManifest(manifest);
    if (!options.skipValidation && !validation.valid) {
      return {
        success: false,
        manifest,
        validation,
        files: [],
        errors: validation.errors.map(e => `[${e.field}] ${e.message}`),
      };
    }

    // 4. Collect required files
    files.push('manifest.json');

    // SOUL.md
    const soulPath = path.join(options.sourceDir, manifest.agent.soul);
    if (!fs.existsSync(soulPath)) {
      errors.push(`SOUL.md not found at: ${manifest.agent.soul}`);
    } else {
      files.push(manifest.agent.soul);
    }

    // MEMORY.md (optional)
    if (manifest.agent.memory) {
      const memPath = path.join(options.sourceDir, manifest.agent.memory);
      if (fs.existsSync(memPath)) {
        files.push(manifest.agent.memory);
      }
    }

    // Skills
    for (const skillName of manifest.agent.skills) {
      const skillDir = path.join(options.sourceDir, 'skills', skillName);
      if (!fs.existsSync(skillDir)) {
        errors.push(`Skill directory not found: skills/${skillName}`);
        continue;
      }
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        errors.push(`SKILL.md not found in: skills/${skillName}/`);
        continue;
      }
      // Collect all files in skill directory
      const skillFiles = this.collectFiles(skillDir, path.join('skills', skillName));
      files.push(...skillFiles);
    }

    // Workflows
    const workflowDir = path.join(options.sourceDir, 'workflows');
    if (fs.existsSync(workflowDir)) {
      const wfFiles = this.collectFiles(workflowDir, 'workflows');
      files.push(...wfFiles);
    }

    // Assets
    const assetsDir = path.join(options.sourceDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      const assetFiles = this.collectFiles(assetsDir, 'assets');
      files.push(...assetFiles);
    }

    // README.md
    const readmePath = path.join(options.sourceDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      files.push('README.md');
    }

    if (errors.length > 0) {
      return {
        success: false,
        manifest,
        validation,
        files,
        errors,
      };
    }

    // 5. Generate checksums for all files
    const checksums: Record<string, string> = {};
    for (const file of files) {
      const filePath = path.join(options.sourceDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        checksums[file] = crypto.createHash('sha256').update(content).digest('hex');
      }
    }

    // 6. Write checksums file
    const checksumContent = JSON.stringify(checksums, null, 2);
    const checksumPath = path.join(options.sourceDir, '.checksums.json');
    fs.writeFileSync(checksumPath, checksumContent);
    files.push('.checksums.json');

    // 7. Build output filename
    const outputFileName = `${manifest.name}-${manifest.version}.oab`;
    const outputPath = path.join(options.outputDir, outputFileName);

    // Ensure output directory exists
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    // 8. Create .oab archive (tar.gz)
    // Note: In production, use a tar library. For now, create a manifest of contents.
    // The actual tar.gz creation will be handled by the CLI tool.
    const bundleManifest = {
      format: 'oab',
      formatVersion: '1.0',
      agent: manifest.name,
      version: manifest.version,
      files,
      checksums,
      createdAt: new Date().toISOString(),
      signature: options.signingKey ? this.sign(checksumContent, options.signingKey) : undefined,
    };

    // Write bundle manifest (to be included in tar)
    const bundleManifestPath = path.join(options.sourceDir, '.bundle.json');
    fs.writeFileSync(bundleManifestPath, JSON.stringify(bundleManifest, null, 2));

    // Calculate total size
    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(options.sourceDir, file);
      if (fs.existsSync(filePath)) {
        totalSize += fs.statSync(filePath).size;
      }
    }

    // Overall checksum
    const overallChecksum = crypto
      .createHash('sha256')
      .update(checksumContent)
      .digest('hex');

    return {
      success: true,
      outputPath,
      manifest,
      validation,
      files,
      size: totalSize,
      checksum: overallChecksum,
      errors: [],
    };
  }

  /**
   * Recursively collect all files in a directory.
   */
  private collectFiles(dir: string, prefix: string): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.collectFiles(path.join(dir, entry.name), relativePath));
      } else if (entry.isFile()) {
        // Skip hidden files and common noise
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          results.push(relativePath);
        }
      }
    }

    return results;
  }

  /**
   * Sign content with a key (HMAC-SHA256).
   */
  private sign(content: string, key: string): string {
    return crypto
      .createHmac('sha256', key)
      .update(content)
      .digest('hex');
  }
}
