#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const OXLINT_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.vue',
]);

const OXFMT_EXTENSIONS = new Set([
  ...OXLINT_EXTENSIONS,
  '.astro',
  '.css',
  '.gql',
  '.graphql',
  '.html',
  '.json',
  '.jsonc',
  '.less',
  '.md',
  '.mdx',
  '.scss',
  '.svelte',
  '.toml',
  '.yaml',
  '.yml',
]);

const OXFMT_CONFIG_NAMES = new Set([
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  'oxfmt.config.mts',
  'oxfmt.config.ts',
]);

const FULL_RUN_FILES = new Set([
  '.editorconfig',
  '.gitignore',
  '.nvmrc',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  '.prettierignore',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'scripts/lint.mjs',
  'turbo.json',
]);

export function requiresFullLint(path) {
  const name = path.split('/').at(-1) ?? path;
  return (
    FULL_RUN_FILES.has(path) ||
    name === '.editorconfig' ||
    name === '.oxlintrc.json' ||
    OXFMT_CONFIG_NAMES.has(name) ||
    name === 'package.json' ||
    /^tsconfig(?:\.[^.]+)?\.json$/.test(name) ||
    path.startsWith('.github/actions/turbo-ci-setup/') ||
    path === '.github/workflows/ci-and-release.yml' ||
    path.startsWith('tooling/oxlint/') ||
    path.startsWith('tooling/tailwind/fresco/')
  );
}

export function planChangedLint(paths, fileExists = existsSync) {
  const fullRunTrigger = paths.find(requiresFullLint);
  if (fullRunTrigger) {
    return {
      full: true,
      reason: `${fullRunTrigger} can change lint or format results repository-wide`,
      oxlintFiles: [],
      oxfmtFiles: [],
    };
  }

  const existing = paths.filter((path) => fileExists(path));
  return {
    full: false,
    reason: '',
    oxlintFiles: existing.filter((path) =>
      OXLINT_EXTENSIONS.has(extname(path).toLowerCase()),
    ),
    oxfmtFiles: existing.filter((path) =>
      OXFMT_EXTENSIONS.has(extname(path).toLowerCase()),
    ),
  };
}

export function changedPaths(base, head = 'HEAD', cwd = process.cwd()) {
  const result = spawnSync(
    'git',
    [
      'diff',
      '--name-only',
      '--no-renames',
      '--diff-filter=ACDMRTUXB',
      '-z',
      base,
      head,
    ],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `Unable to determine changed files for ${base}..${head}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.split('\0').filter(Boolean);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', (error) => {
      console.error(`${command} failed to start: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        console.error(`${command} terminated by ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

export async function runLint(plan) {
  const jobs = [];
  if (plan.full || plan.oxlintFiles.length > 0) {
    const paths = plan.full
      ? []
      : ['--no-error-on-unmatched-pattern', '--', ...plan.oxlintFiles];
    jobs.push(['oxlint', run('pnpm', ['exec', 'oxlint', ...paths])]);
  }
  if (plan.full || plan.oxfmtFiles.length > 0) {
    const paths = plan.full
      ? ['.']
      : ['--no-error-on-unmatched-pattern', '--', ...plan.oxfmtFiles];
    jobs.push(['oxfmt', run('pnpm', ['exec', 'oxfmt', '--check', ...paths])]);
  }
  if (jobs.length === 0) {
    console.log('No changed files require linting or formatting.');
    return 0;
  }

  const results = await Promise.all(
    jobs.map(async ([name, promise]) => [name, await promise]),
  );
  const failures = results.filter(([, status]) => status !== 0);
  for (const [name, status] of failures) {
    console.error(`${name} failed with exit code ${status}`);
  }
  return failures.length === 0 ? 0 : 1;
}

async function main() {
  const changedFromIndex = process.argv.indexOf('--changed-from');
  let plan = {
    full: true,
    reason: 'full lint requested',
    oxlintFiles: [],
    oxfmtFiles: [],
  };

  if (changedFromIndex !== -1) {
    const base = process.argv[changedFromIndex + 1];
    if (!base) {
      console.error('--changed-from requires a Git revision');
      process.exitCode = 1;
      return;
    }
    try {
      const paths = changedPaths(base);
      plan = planChangedLint(paths);
    } catch (error) {
      console.warn(`${error.message}\nFalling back to a full lint run.`);
    }
  }

  console.log(
    plan.full
      ? `Running full lint and format checks: ${plan.reason}.`
      : `Running changed-file checks: ${plan.oxlintFiles.length} lint file(s), ${plan.oxfmtFiles.length} format file(s).`,
  );
  process.exitCode = await runLint(plan);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
