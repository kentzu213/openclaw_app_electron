/**
 * openclaw dev — Watch mode with hot-reload via IPC
 *
 * Watches for file changes, re-compiles, and sends
 * reload signal to the running OpenClaw app via IPC.
 */

import chalk from 'chalk';
import { watch } from 'chokidar';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { createConnection } from 'net';

interface DevOptions {
  port: string;
}

export async function devCommand(options: DevOptions): Promise<void> {
  const cwd = process.cwd();
  const port = parseInt(options.port, 10);

  console.log(chalk.bold.cyan('\n🔄 OpenClaw Dev Mode\n'));

  // Verify manifest exists
  const manifestPath = join(cwd, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(chalk.red('❌ manifest.json not found. Run "openclaw init" first.'));
    process.exit(1);
  }

  let manifest: any;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    console.error(chalk.red('❌ Invalid manifest.json'));
    process.exit(1);
  }

  console.log(chalk.gray(`  Extension: ${manifest.displayName || manifest.name}`));
  console.log(chalk.gray(`  Version:   ${manifest.version}`));
  console.log(chalk.gray(`  IPC Port:  ${port}`));
  console.log();

  // Initial build
  console.log(chalk.yellow('⚡ Initial build...'));
  try {
    runBuild(cwd);
    console.log(chalk.green('  ✓ Build successful\n'));
  } catch (err: any) {
    console.error(chalk.red('  ✗ Build failed'));
    console.error(chalk.gray(err.message));
  }

  // Watch for changes
  const srcDir = join(cwd, 'src');
  const watcher = watch(existsSync(srcDir) ? srcDir : cwd, {
    ignored: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.ocx',
      '**/.*',
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  let buildTimeout: ReturnType<typeof setTimeout> | null = null;
  let buildCount = 0;

  watcher.on('change', (filePath: string) => {
    // Debounce rapid changes
    if (buildTimeout) clearTimeout(buildTimeout);
    buildTimeout = setTimeout(() => {
      buildCount++;
      const relPath = filePath.replace(cwd, '.').replace(/\\/g, '/');
      console.log(chalk.gray(`[${new Date().toLocaleTimeString()}]`) + chalk.yellow(` Changed: ${relPath}`));

      try {
        runBuild(cwd);
        console.log(chalk.green(`  ✓ Rebuild #${buildCount} complete`));

        // Try to notify running OpenClaw app
        notifyReload(port, manifest.name);
      } catch (err: any) {
        console.error(chalk.red(`  ✗ Build #${buildCount} failed`));
        // Don't show full error stack, just the message
        const lines = (err.message || '').split('\n').slice(0, 5);
        lines.forEach((l: string) => console.error(chalk.gray(`    ${l}`)));
      }
    }, 300);
  });

  watcher.on('add', (filePath: string) => {
    const relPath = filePath.replace(cwd, '.').replace(/\\/g, '/');
    console.log(chalk.gray(`[${new Date().toLocaleTimeString()}]`) + chalk.blue(` Added: ${relPath}`));
  });

  console.log(chalk.cyan('👀 Watching for changes... (Ctrl+C to stop)\n'));

  // Keep process alive
  process.on('SIGINT', () => {
    watcher.close();
    console.log(chalk.gray('\n👋 Dev mode stopped.'));
    process.exit(0);
  });
}

function runBuild(cwd: string): void {
  const tsconfigPath = join(cwd, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    throw new Error('tsconfig.json not found');
  }

  execSync(`npx tsc --project "${tsconfigPath}"`, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
}

function notifyReload(port: number, extensionName: string): void {
  try {
    const client = createConnection({ port }, () => {
      const message = JSON.stringify({
        type: 'extension.reload',
        extensionName,
        timestamp: Date.now(),
      });
      client.write(message + '\n');
      client.end();
      console.log(chalk.green('  ↻ Hot-reload signal sent'));
    });

    client.on('error', () => {
      // App not running or IPC not listening — silently ignore
      console.log(chalk.gray('  ↻ Hot-reload: app not connected'));
    });

    // Don't wait forever
    client.setTimeout(1000, () => {
      client.destroy();
    });
  } catch {
    // Ignore connection errors
  }
}
