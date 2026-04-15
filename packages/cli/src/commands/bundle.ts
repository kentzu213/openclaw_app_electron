/**
 * openclaw bundle — Package an Agent Bundle directory → .oab file
 *
 * .oab format: tar.gz containing:
 *   manifest.json       (AgentBundleManifest)
 *   SOUL.md             (Agent persona)
 *   skills/             (Python skill files)
 *   workflows/          (Automation definitions)
 *   assets/             (Icons, screenshots)
 *
 * Output: {name}-{version}.oab
 */

import chalk from 'chalk';
import ora from 'ora';
import archiver from 'archiver';
import { createWriteStream, existsSync, readFileSync, statSync, mkdirSync } from 'fs';
import { resolve, join, basename } from 'path';
import { createHash } from 'crypto';

interface BundleOptions {
  output?: string;
  verify: boolean;
  sign?: string;
}

interface ManifestError {
  field: string;
  message: string;
}

export async function bundleCommand(options: BundleOptions): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.bold.magenta('\n🤖 OpenClaw Agent Bundle Packager\n'));

  // 1. Read and validate manifest
  const manifestPath = join(cwd, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(chalk.red('❌ manifest.json not found in current directory.'));
    console.log(chalk.gray('  Create a manifest.json with the AgentBundleManifest schema.'));
    console.log(chalk.gray('  See: https://docs.openclaw.ai/agents/manifest'));
    process.exit(1);
  }

  let manifest: any;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    console.error(chalk.red('❌ manifest.json is invalid JSON.'));
    process.exit(1);
  }

  // Validate agent bundle manifest
  if (options.verify !== false) {
    const errors = validateAgentManifest(manifest, cwd);
    if (errors.length > 0) {
      console.error(chalk.red('❌ Manifest validation failed:\n'));
      errors.forEach(e => {
        console.error(chalk.red(`  • ${e.field}: ${e.message}`));
      });
      process.exit(1);
    }
    console.log(chalk.green('  ✓ Manifest validated'));
  }

  // 2. Check required files
  const soulPath = join(cwd, manifest.agent?.soul || 'SOUL.md');
  if (!existsSync(soulPath)) {
    console.error(chalk.red('❌ SOUL.md not found. Every agent needs a persona file.'));
    console.log(chalk.gray(`  Expected at: ${soulPath}`));
    process.exit(1);
  }
  console.log(chalk.green('  ✓ SOUL.md found'));

  // Check skills directory
  const skillsDir = join(cwd, 'skills');
  if (existsSync(skillsDir)) {
    const skillFiles = getFilesRecursive(skillsDir, ['.py', '.ts', '.js']);
    console.log(chalk.green(`  ✓ ${skillFiles.length} skill file(s) found`));
  } else {
    console.log(chalk.yellow('  ⚠ No skills/ directory (agent may use built-in skills only)'));
  }

  // 3. Create .oab (tar.gz)
  const oabName = `${manifest.name}-${manifest.version}.oab`;
  const outputPath = options.output ? resolve(options.output) : join(cwd, oabName);
  const spinner = ora(`Packaging → ${basename(outputPath)}`).start();

  try {
    const checksum = await createOab(cwd, outputPath, manifest);
    const size = statSync(outputPath).size;
    const sizeStr = size > 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${(size / 1024).toFixed(1)} KB`;

    spinner.succeed(chalk.green(`Packaged → ${chalk.bold(basename(outputPath))} (${sizeStr})`));

    console.log(chalk.gray(`  SHA-256: ${checksum}`));

    // Write checksum file
    const checksumPath = outputPath + '.sha256';
    const { writeFileSync } = await import('fs');
    writeFileSync(checksumPath, `${checksum}  ${basename(outputPath)}\n`);
    console.log(chalk.green(`  ✓ Checksum → ${basename(checksumPath)}`));

    console.log(`
${chalk.bold('Bundle contents:')}
  ${chalk.cyan('manifest.json')}   Agent configuration
  ${chalk.cyan('SOUL.md')}         Agent persona
  ${chalk.cyan('skills/')}         Skills & automation
  ${chalk.cyan('assets/')}         Icons & media

${chalk.bold('Next steps:')}
  ${chalk.cyan('openclaw dev')}                               ${chalk.gray('# Test locally')}
  ${chalk.cyan(`Upload ${oabName}`)}   ${chalk.gray('# Via Agent Marketplace')}
`);
  } catch (err: any) {
    spinner.fail(chalk.red(`Packaging failed: ${err.message}`));
    process.exit(1);
  }
}

function validateAgentManifest(manifest: any, cwd: string): ManifestError[] {
  const errors: ManifestError[] = [];

  // Required top-level fields
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push({ field: 'name', message: 'Required (string, kebab-case)' });
  } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    errors.push({ field: 'name', message: 'Must be kebab-case (e.g. auto-facebook)' });
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push({ field: 'version', message: 'Required (semver string)' });
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push({ field: 'version', message: 'Must be valid semver (e.g. 1.0.0)' });
  }

  if (!manifest.displayName || typeof manifest.displayName !== 'string') {
    errors.push({ field: 'displayName', message: 'Required (string)' });
  }

  // Agent section
  if (!manifest.agent) {
    errors.push({ field: 'agent', message: 'Required — agent configuration object' });
  } else {
    if (!manifest.agent.soul) {
      errors.push({ field: 'agent.soul', message: 'Required — path to SOUL.md' });
    }
    if (!manifest.agent.skills || !Array.isArray(manifest.agent.skills)) {
      errors.push({ field: 'agent.skills', message: 'Required — array of skill names' });
    }
    if (!manifest.agent.provider) {
      errors.push({ field: 'agent.provider', message: 'Required — LLM provider config' });
    }
  }

  // Category
  const validCategories = ['social-media', 'sales', 'productivity', 'content', 'customer-support', 'analytics', 'other'];
  if (manifest.category && !validCategories.includes(manifest.category)) {
    errors.push({ field: 'category', message: `Must be one of: ${validCategories.join(', ')}` });
  }

  return errors;
}

function createOab(cwd: string, outputPath: string, manifest: any): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
    const hash = createHash('sha256');

    output.on('close', () => {
      // Read file back and compute checksum
      const fileBuffer = readFileSync(outputPath);
      hash.update(fileBuffer);
      resolvePromise(hash.digest('hex'));
    });
    archive.on('error', (err: Error) => reject(err));

    archive.pipe(output);

    // Add manifest
    archive.file(join(cwd, 'manifest.json'), { name: 'manifest.json' });

    // Add SOUL.md
    const soulPath = manifest.agent?.soul || 'SOUL.md';
    if (existsSync(join(cwd, soulPath))) {
      archive.file(join(cwd, soulPath), { name: soulPath });
    }

    // Add MEMORY.md if exists
    const memoryPath = manifest.agent?.memory || 'MEMORY.md';
    if (existsSync(join(cwd, memoryPath))) {
      archive.file(join(cwd, memoryPath), { name: memoryPath });
    }

    // Add skills/
    const skillsDir = join(cwd, 'skills');
    if (existsSync(skillsDir)) {
      archive.directory(skillsDir, 'skills');
    }

    // Add workflows/
    const workflowsDir = join(cwd, 'workflows');
    if (existsSync(workflowsDir)) {
      archive.directory(workflowsDir, 'workflows');
    }

    // Add assets/
    const assetsDir = join(cwd, 'assets');
    if (existsSync(assetsDir)) {
      archive.directory(assetsDir, 'assets');
    }

    // Add config templates
    const configDir = join(cwd, 'config');
    if (existsSync(configDir)) {
      archive.directory(configDir, 'config');
    }

    archive.finalize();
  });
}

function getFilesRecursive(dir: string, extensions: string[]): string[] {
  const { readdirSync, statSync } = require('fs');
  const { join } = require('path');
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getFilesRecursive(fullPath, extensions));
      } else if (extensions.some(ext => entry.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // ignore
  }

  return files;
}
