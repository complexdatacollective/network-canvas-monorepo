#!/usr/bin/env node
// Ensures a package script runs with its workspace dependencies satisfied via
// turbo. turbo injects TURBO_HASH into every task process; when this script is run
// directly (e.g. `pnpm dev`) that variable is absent, so we re-dispatch through
// turbo and turbo then re-enters this same script with TURBO_HASH set, at which
// point we run the real command. The env check breaks the otherwise-infinite
// recursion.
//
// Leading flag selects how dependencies are handled:
//   (none)        one-shot tasks (build, build-storybook, electron:build):
//                 `turbo run <task> --filter=<pkg>` — deps built once via ^build.
//   --with-deps   non-electron dev servers (dev):
//                 `turbo run dev --filter=...<pkg>` — server + every dep's dev
//                 watcher in one turbo process.
//   --watch-deps  storybook and every electron dev server:
//                 build the dep closure once, run deps' dev watchers in the
//                 background, run the server in the foreground, stop watchers on
//                 exit. (Used where `...` would mis-fan the task onto deps.)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Pure: map (mode, task, pkg) to the turbo invocation(s) needed. Exported for tests.
export function buildPlan(mode, task, pkg) {
  if (mode === 'watch-deps') {
    return {
      kind: 'watch',
      build: ['run', 'build', `--filter=${pkg}^...`],
      watch: ['run', 'dev', `--filter=${pkg}^...`, '--ui=stream'],
    };
  }
  const filter =
    mode === 'with-deps' ? `--filter=...${pkg}` : `--filter=${pkg}`;
  return { kind: 'redispatch', run: ['run', task, filter] };
}

function resolveTurbo() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const local = join(repoRoot, 'node_modules', '.bin', 'turbo');
  return existsSync(local) ? local : 'turbo';
}

function runReal(realCommand) {
  const [cmd, ...args] = realCommand;
  // On Windows the real command is a node_modules/.bin shim (e.g. vite.CMD);
  // Node won't resolve/execute the extensionless name without a shell.
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

function main() {
  const argv = process.argv.slice(2);
  let mode = 'default';
  let rest = argv;
  if (argv[0] === '--with-deps') {
    mode = 'with-deps';
    rest = argv.slice(1);
  } else if (argv[0] === '--watch-deps') {
    mode = 'watch-deps';
    rest = argv.slice(1);
  }
  const realCommand = rest;
  const task = process.env.npm_lifecycle_event;
  const pkg = process.env.npm_package_name;

  // Inside turbo already (or missing context): run the real command.
  if (process.env.TURBO_HASH || !task || !pkg) {
    runReal(realCommand);
    return;
  }

  const turbo = resolveTurbo();
  const plan = buildPlan(mode, task, pkg);

  if (plan.kind === 'redispatch') {
    console.error(
      `[with-turbo] "${task}" run directly; routing through turbo: turbo ${plan.run.join(' ')} ` +
        `(run that yourself to skip this notice).`,
    );
    const result = spawnSync(turbo, plan.run, { stdio: 'inherit' });
    if (result.error) {
      console.error(
        `[with-turbo] failed to launch turbo: ${result.error.message}`,
      );
      process.exit(1);
    }
    process.exit(result.status ?? 1);
  }

  // watch-deps: build deps once (no cold-start race), watch them in the
  // background, run the server in the foreground, stop watchers on exit.
  console.error(
    `[with-turbo] "${task}" run directly; building "${pkg}" dependencies then watching ` +
      `them while the server runs.`,
  );
  const built = spawnSync(turbo, plan.build, { stdio: 'inherit' });
  if (built.error) {
    console.error(
      `[with-turbo] failed to launch turbo: ${built.error.message}`,
    );
    process.exit(1);
  }
  if (built.status) process.exit(built.status);

  const watchers = spawn(turbo, plan.watch, { stdio: 'inherit' });
  const [cmd, ...args] = realCommand;
  const server = spawnSync(cmd, args, { stdio: 'inherit' });
  watchers.kill('SIGTERM');
  process.exit(server.status ?? 1);
}

// Run main only when invoked as the entry script, so tests can import buildPlan.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
