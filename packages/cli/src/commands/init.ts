/**
 * openclaw init — Scaffold a new extension project
 *
 * Creates:
 * ├── manifest.json
 * ├── src/index.ts
 * ├── tsconfig.json
 * ├── package.json
 * └── .gitignore
 */

import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

interface InitOptions {
  name?: string;
  id?: string;
  dir: string;
  interactive: boolean;
}

const DEFAULT_PERMISSIONS = ['storage.local', 'ui.notification'];

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 OpenClaw Extension Scaffolder\n'));

  let name = options.name;
  let id = options.id;
  let permissions = [...DEFAULT_PERMISSIONS];
  let description = '';

  // Interactive mode
  if (options.interactive !== false && (!name || !id)) {
    const answers = await prompts([
      {
        type: 'text',
        name: 'name',
        message: 'Extension display name:',
        initial: name || 'My Extension',
        validate: (v: string) => v.trim().length > 0 || 'Name is required',
      },
      {
        type: 'text',
        name: 'id',
        message: 'Extension ID (kebab-case):',
        initial: (prev: string) => prev.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        validate: (v: string) => /^[a-z][a-z0-9-]*$/.test(v) || 'ID must be kebab-case (e.g. my-extension)',
      },
      {
        type: 'text',
        name: 'description',
        message: 'Short description:',
        initial: 'A OpenClaw extension',
      },
      {
        type: 'multiselect',
        name: 'permissions',
        message: 'Select permissions:',
        choices: [
          { title: '💾 storage.local', value: 'storage.local', selected: true },
          { title: '🔔 ui.notification', value: 'ui.notification', selected: true },
          { title: '🖼️ ui.panel', value: 'ui.panel' },
          { title: '🌐 net.http', value: 'net.http' },
          { title: '📋 clipboard.read', value: 'clipboard.read' },
          { title: '📝 clipboard.write', value: 'clipboard.write' },
          { title: '📖 fs.read', value: 'fs.read' },
          { title: '✏️ fs.write', value: 'fs.write' },
        ],
      },
    ]);

    if (!answers.name) {
      console.log(chalk.yellow('\n⚠️  Cancelled.\n'));
      process.exit(0);
    }

    name = answers.name;
    id = answers.id;
    description = answers.description || '';
    permissions = answers.permissions || DEFAULT_PERMISSIONS;
  }

  if (!name) name = 'My Extension';
  if (!id) id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const targetDir = resolve(options.dir);
  const spinner = ora('Creating extension project...').start();

  try {
    // Create directories
    const srcDir = join(targetDir, 'src');
    if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });

    // manifest.json
    const manifest = {
      name: id,
      version: '1.0.0',
      displayName: name,
      description: description || `${name} — a OpenClaw extension`,
      main: 'dist/index.js',
      engine: '>=0.1.0',
      author: { name: 'Developer', email: '' },
      permissions,
      activationEvents: ['onStartup'],
      contributes: {
        commands: [
          { id: `${id}.hello`, title: `${name}: Hello World` },
        ],
      },
      categories: ['Other'],
      pricing: { model: 'free' as const },
    };
    writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    // src/index.ts
    writeFileSync(join(srcDir, 'index.ts'), `import { defineExtension } from '@OpenClaw/extension-sdk';

export default defineExtension({
  activate(ctx) {
    ctx.log.info('✅ ${name} activated!');
    ctx.ui.showNotification('${name} is ready!', 'success');
  },

  deactivate() {
    console.log('${name} deactivated');
  },

  commands: {
    '${id}.hello': () => {
      return 'Hello from ${name}!';
    },
  },
});
`);

    // package.json
    const pkg = {
      name: `@openclaw-ext/${id}`,
      version: '1.0.0',
      private: true,
      scripts: {
        build: 'openclaw build',
        pack: 'openclaw pack',
        dev: 'openclaw dev',
      },
      dependencies: {
        '@OpenClaw/extension-sdk': '^0.2.0',
      },
      devDependencies: {
        typescript: '^5.4.0',
      },
    };
    writeFileSync(join(targetDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

    // tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: 'dist',
        rootDir: 'src',
        declaration: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    };
    writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');

    // .gitignore
    writeFileSync(join(targetDir, '.gitignore'), `node_modules/
dist/
*.ocx
.DS_Store
`);

    spinner.succeed(chalk.green(`Extension scaffolded at ${chalk.bold(targetDir)}`));

    console.log(`
${chalk.bold('Next steps:')}
  ${chalk.cyan('cd')} ${targetDir === process.cwd() ? '.' : targetDir}
  ${chalk.cyan('npm install')}
  ${chalk.cyan('openclaw build')}     ${chalk.gray('# Compile TypeScript')}
  ${chalk.cyan('openclaw pack')}      ${chalk.gray('# Create .ocx package')}
  ${chalk.cyan('openclaw dev')}       ${chalk.gray('# Dev mode + hot-reload')}
`);
  } catch (err: any) {
    spinner.fail(chalk.red(`Failed: ${err.message}`));
    process.exit(1);
  }
}
