#!/usr/bin/env node

/**
 * openclaw CLI — Build, package, and manage OpenClaw/OpenClaw extensions.
 *
 * Usage:
 *   openclaw init          — Scaffold a new extension project
 *   openclaw build         — Compile TypeScript extension → dist/
 *   openclaw pack          — Package dist/ + manifest.json → .ocx
 *   openclaw bundle        — Package Agent Bundle directory → .oab
 *   openclaw dev           — Watch mode with hot-reload via IPC
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initCommand } from '../commands/init.js';
import { buildCommand } from '../commands/build.js';
import { packCommand } from '../commands/pack.js';
import { bundleCommand } from '../commands/bundle.js';
import { devCommand } from '../commands/dev.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('openclaw')
  .description('CLI for building OpenClaw extensions (.ocx) and Agent Bundles (.oab)')
  .version(pkg.version);

program
  .command('init')
  .description('Scaffold a new extension project')
  .option('-n, --name <name>', 'Extension name')
  .option('-i, --id <id>', 'Extension ID (kebab-case)')
  .option('-d, --dir <directory>', 'Target directory', '.')
  .option('--no-interactive', 'Skip interactive prompts')
  .action(initCommand);

program
  .command('build')
  .description('Compile TypeScript extension → dist/')
  .option('-w, --watch', 'Watch mode')
  .option('--tsconfig <path>', 'Custom tsconfig path', 'tsconfig.json')
  .action(buildCommand);

program
  .command('pack')
  .description('Package dist/ + manifest.json → .ocx file')
  .option('-o, --output <path>', 'Output .ocx file path')
  .option('--no-verify', 'Skip manifest validation')
  .action(packCommand);

program
  .command('bundle')
  .description('Package Agent Bundle directory → .oab file')
  .option('-o, --output <path>', 'Output .oab file path')
  .option('--no-verify', 'Skip manifest validation')
  .option('--sign <key>', 'Sign with developer certificate')
  .action(bundleCommand);

program
  .command('dev')
  .description('Dev mode — watch + hot-reload via IPC')
  .option('-p, --port <port>', 'IPC port for OpenClaw app', '19876')
  .action(devCommand);

program.parse();
