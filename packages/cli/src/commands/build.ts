/**
 * openclaw build — Compile TypeScript extension → dist/
 *
 * Runs `tsc` with the extension's tsconfig.json.
 * In watch mode, re-compiles on file changes.
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { execSync, spawn } from 'child_process';

interface BuildOptions {
  watch?: boolean;
  tsconfig: string;
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  const cwd = process.cwd();
  const tsconfigPath = resolve(cwd, options.tsconfig);

  // Validate
  if (!existsSync(tsconfigPath)) {
    console.error(chalk.red(`❌ tsconfig not found: ${tsconfigPath}`));
    console.log(chalk.gray('  Run "openclaw init" to create an extension project first.'));
    process.exit(1);
  }

  if (!existsSync(join(cwd, 'manifest.json'))) {
    console.warn(chalk.yellow('⚠️  No manifest.json found. This may not be an extension project.'));
  }

  // Find tsc binary
  const tscPath = findTsc(cwd);

  if (options.watch) {
    console.log(chalk.cyan('👀 Watch mode — compiling on changes...\n'));
    const child = spawn(tscPath, ['--project', tsconfigPath, '--watch', '--preserveWatchOutput'], {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (err) => {
      console.error(chalk.red(`❌ tsc error: ${err.message}`));
    });

    // Keep running until Ctrl+C
    process.on('SIGINT', () => {
      child.kill();
      process.exit(0);
    });
  } else {
    const spinner = ora('Compiling TypeScript...').start();

    try {
      execSync(`${tscPath} --project "${tsconfigPath}"`, {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      spinner.succeed(chalk.green('Build complete → dist/'));
    } catch (err: any) {
      spinner.fail(chalk.red('Build failed'));

      // Show TypeScript errors
      if (err.stdout) {
        console.log('\n' + chalk.yellow(err.stdout));
      }
      if (err.stderr) {
        console.error(chalk.red(err.stderr));
      }
      process.exit(1);
    }
  }
}

function findTsc(cwd: string): string {
  // Try local node_modules first
  const localTsc = join(cwd, 'node_modules', '.bin', 'tsc');
  if (existsSync(localTsc) || existsSync(localTsc + '.cmd')) {
    return localTsc;
  }

  // Try to verify global tsc
  try {
    execSync('tsc --version', { stdio: 'pipe' });
    return 'tsc';
  } catch {
    console.error(chalk.red('❌ TypeScript (tsc) not found.'));
    console.log(chalk.gray('  Install: npm install -D typescript'));
    process.exit(1);
  }
}
