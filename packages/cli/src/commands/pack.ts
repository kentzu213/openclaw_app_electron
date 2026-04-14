/**
 * openclaw pack — Package dist/ + manifest.json → .ocx file
 *
 * .ocx format: ZIP containing:
 *   manifest.json
 *   dist/           (compiled JS + declarations)
 *   assets/         (icons, etc. if present)
 *
 * Output: {name}-{version}.ocx
 */

import chalk from 'chalk';
import ora from 'ora';
import archiver from 'archiver';
import { createWriteStream, existsSync, readFileSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';

interface PackOptions {
  output?: string;
  verify: boolean;
}

interface ManifestError {
  field: string;
  message: string;
}

export async function packCommand(options: PackOptions): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.bold.cyan('\n📦 OpenClaw Extension Packager\n'));

  // 1. Read and validate manifest
  const manifestPath = join(cwd, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(chalk.red('❌ manifest.json not found in current directory.'));
    console.log(chalk.gray('  Run "openclaw init" to create an extension project first.'));
    process.exit(1);
  }

  let manifest: any;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    console.error(chalk.red('❌ manifest.json is invalid JSON.'));
    process.exit(1);
  }

  // Validate manifest
  if (options.verify !== false) {
    const errors = validateManifest(manifest, cwd);
    if (errors.length > 0) {
      console.error(chalk.red('❌ Manifest validation failed:\n'));
      errors.forEach(e => {
        console.error(chalk.red(`  • ${e.field}: ${e.message}`));
      });
      process.exit(1);
    }
    console.log(chalk.green('  ✓ Manifest validated'));
  }

  // 2. Check dist/ exists
  const distDir = join(cwd, 'dist');
  if (!existsSync(distDir)) {
    console.error(chalk.red('❌ dist/ directory not found. Run "openclaw build" first.'));
    process.exit(1);
  }

  // 3. Check entry file exists
  const entryFile = join(cwd, manifest.main || 'dist/index.js');
  if (!existsSync(entryFile)) {
    console.error(chalk.red(`❌ Entry file not found: ${manifest.main || 'dist/index.js'}`));
    console.log(chalk.gray('  Run "openclaw build" first.'));
    process.exit(1);
  }
  console.log(chalk.green(`  ✓ Entry: ${manifest.main || 'dist/index.js'}`));

  // 4. Create .ocx (ZIP)
  const ocxName = `${manifest.name}-${manifest.version}.ocx`;
  const outputPath = options.output ? resolve(options.output) : join(cwd, ocxName);
  const spinner = ora(`Packaging → ${basename(outputPath)}`).start();

  try {
    await createOcx(cwd, outputPath, manifest);
    const size = statSync(outputPath).size;
    const sizeStr = size > 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${(size / 1024).toFixed(1)} KB`;

    spinner.succeed(chalk.green(`Packaged → ${chalk.bold(basename(outputPath))} (${sizeStr})`));

    console.log(`
${chalk.bold('Next steps:')}
  ${chalk.cyan('openclaw dev')}                ${chalk.gray('# Test with hot-reload')}
  ${chalk.cyan(`Upload ${ocxName}`)}   ${chalk.gray('# Via OpenClaw Marketplace')}
`);
  } catch (err: any) {
    spinner.fail(chalk.red(`Packaging failed: ${err.message}`));
    process.exit(1);
  }
}

function validateManifest(manifest: any, cwd: string): ManifestError[] {
  const errors: ManifestError[] = [];

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push({ field: 'name', message: 'Required (string, kebab-case)' });
  } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    errors.push({ field: 'name', message: 'Must be kebab-case (e.g. my-extension)' });
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push({ field: 'version', message: 'Required (semver string)' });
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push({ field: 'version', message: 'Must be valid semver (e.g. 1.0.0)' });
  }

  if (!manifest.displayName || typeof manifest.displayName !== 'string') {
    errors.push({ field: 'displayName', message: 'Required (string)' });
  }

  if (!manifest.main || typeof manifest.main !== 'string') {
    errors.push({ field: 'main', message: 'Required — entry file (e.g. dist/index.js)' });
  }

  if (manifest.permissions && !Array.isArray(manifest.permissions)) {
    errors.push({ field: 'permissions', message: 'Must be an array of strings' });
  }

  return errors;
}

function createOcx(cwd: string, outputPath: string, manifest: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err: Error) => reject(err));

    archive.pipe(output);

    // Add manifest
    archive.file(join(cwd, 'manifest.json'), { name: 'manifest.json' });

    // Add dist/
    archive.directory(join(cwd, 'dist'), 'dist');

    // Add assets/ if exists
    const assetsDir = join(cwd, 'assets');
    if (existsSync(assetsDir)) {
      archive.directory(assetsDir, 'assets');
    }

    // Add icon if specified
    if (manifest.icon && existsSync(join(cwd, manifest.icon))) {
      archive.file(join(cwd, manifest.icon), { name: manifest.icon });
    }

    archive.finalize();
  });
}
