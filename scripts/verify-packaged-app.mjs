#!/usr/bin/env node
// Verifies a packaged classic Electron app before its artifacts are released.
//
// Two checks, run against every runnable packaged build found under the app's
// release-builds directory:
//
//   1. Resolution sweep — scripts/verify-packaged-app-sweep.cjs runs inside
//      the packaged binary (ELECTRON_RUN_AS_NODE) and verifies that every
//      statically-written require()/import specifier in the asar resolves
//      within the packed tree. Laziness-proof: catches modules that
//      electron-builder `files` exclusions stripped even when the require
//      only executes deep inside a feature path. Also asserts the asar's
//      version matches the app's package.json.
//
//   2. Boot smoke (macOS/Linux) — launches the packaged app and requires
//      POSITIVE evidence of a healthy boot: a descendant Electron helper
//      process running with --type=renderer. "The process is still alive" is
//      deliberately not trusted: a main-process uncaught-exception dialog
//      keeps the process alive while looking exactly like a healthy app.
//
// Both 6.6.0 classic launch crashes (missing readable-stream/passthrough in
// Architect, missing lodash/defaults in Interviewer) fail check 1 instantly
// and check 2 within its timeout.
//
// Usage: node scripts/verify-packaged-app.mjs --app apps/architect-classic
//        [--no-smoke]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const SWEEP_WORKER = join(import.meta.dirname, 'verify-packaged-app-sweep.cjs');
const SMOKE_TIMEOUT_MS = 45_000;
const SMOKE_POLL_MS = 1_000;

// Helper binaries in linux-unpacked roots that are executable but are not the
// app itself.
const LINUX_NON_APP_BINARIES = new Set([
  'chrome-sandbox',
  'chrome_crashpad_handler',
]);

function fail(message) {
  console.error(`verify-packaged-app: ${message}`);
  process.exit(1);
}

// Find every packaged build (asar + launchable binary) under root.
// mac:       <dir>/<Product>.app/Contents/Resources/app.asar
// win/linux: <arch>-unpacked/resources/app.asar
function discoverTargets(root, relative = '') {
  const targets = [];
  for (const entry of readdirSync(join(root, relative), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const relPath = relative ? `${relative}/${entry.name}` : entry.name;
    const absPath = join(root, relPath);
    if (entry.name.endsWith('.app')) {
      const asar = join(absPath, 'Contents/Resources/app.asar');
      if (!existsSync(asar)) continue;
      const macosDir = join(absPath, 'Contents/MacOS');
      const [executable] = readdirSync(macosDir);
      targets.push({
        label: relPath,
        asar,
        binary: join(macosDir, executable),
        platform: 'mac',
      });
    } else if (
      entry.name.endsWith('-unpacked') ||
      entry.name === 'win-unpacked'
    ) {
      const asar = join(absPath, 'resources/app.asar');
      if (!existsSync(asar)) continue;
      const rootEntries = readdirSync(absPath, { withFileTypes: true });
      const exe = rootEntries.find(
        (e) => e.isFile() && e.name.endsWith('.exe'),
      );
      if (exe) {
        targets.push({
          label: relPath,
          asar,
          binary: join(absPath, exe.name),
          platform: 'win',
        });
        continue;
      }
      const linuxBinary = rootEntries.find(
        (e) =>
          e.isFile() &&
          !LINUX_NON_APP_BINARIES.has(e.name) &&
          !e.name.includes('.') &&
          statSync(join(absPath, e.name)).mode & 0o111,
      );
      if (linuxBinary) {
        targets.push({
          label: relPath,
          asar,
          binary: join(absPath, linuxBinary.name),
          platform: 'linux',
        });
      }
    } else {
      targets.push(...discoverTargets(root, relPath));
    }
  }
  return targets;
}

// A packaged build for a foreign CPU architecture cannot execute on this
// runner (e.g. the linux-arm64 build on the x64 CI runner). Its asar JS
// content is identical to the host-arch build's — the same electron-builder
// config and dependency collection produce both — so skipping it loses no
// sweep coverage as long as at least one target verifies.
function isRunnable(binary) {
  const probe = spawnSync(binary, ['-e', 'process.exit(0)'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30_000,
  });
  return probe.status === 0;
}

function formatFailure(f) {
  return `${f.file} -> ${f.specifier ?? '(read error)'}: ${f.message}`;
}

function runSweep(target, expectedVersion) {
  const result = spawnSync(target.binary, [SWEEP_WORKER, target.asar], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  if (result.error || result.stdout === '') {
    return {
      ok: false,
      summary: `sweep failed to run: ${result.error?.message ?? result.stderr}`,
    };
  }
  const report = JSON.parse(result.stdout);
  const problems = report.errors.map(formatFailure);
  if (report.version !== expectedVersion) {
    problems.push(
      `asar version ${report.version} does not match package.json version ${expectedVersion}`,
    );
  }
  return {
    ok: problems.length === 0,
    summary:
      `scanned ${report.scannedFiles} files ` +
      `(${report.reachableFiles} reachable from ${report.entryFiles.join(', ')}), ` +
      `checked ${report.checkedSpecifiers} specifiers, ` +
      `${report.errors.length} reachable failures, ` +
      `${report.warnings.length} unreachable-file warnings`,
    problems,
    warnings: report.warnings.map(formatFailure),
  };
}

function listDescendantsWithRendererType(rootPid) {
  const psOutput = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const children = new Map();
  const argsByPid = new Map();
  for (const line of psOutput.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, ppid, args] = match;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
    argsByPid.set(pid, args);
  }
  const renderers = [];
  const queue = [String(rootPid)];
  while (queue.length > 0) {
    const pid = queue.shift();
    for (const child of children.get(pid) ?? []) {
      queue.push(child);
      if (argsByPid.get(child)?.includes('--type=renderer')) {
        renderers.push(child);
      }
    }
  }
  return renderers;
}

async function runBootSmoke(target) {
  const args = target.platform === 'linux' ? ['--no-sandbox'] : [];
  let output = '';
  const child = spawn(target.binary, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  let exited = null;
  child.on('exit', (code, signal) => (exited = { code, signal }));

  let verdict = null;
  const deadline = Date.now() + SMOKE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SMOKE_POLL_MS));
    if (exited !== null) {
      verdict = {
        ok: false,
        summary: `app exited during startup (${JSON.stringify(exited)})`,
      };
      break;
    }
    if (listDescendantsWithRendererType(child.pid).length > 0) {
      verdict = { ok: true, summary: 'renderer process observed' };
      break;
    }
  }
  if (verdict === null) {
    verdict = {
      ok: false,
      summary:
        'no renderer process appeared before timeout — the main process is ' +
        'likely stalled at an uncaught-exception dialog',
    };
  }
  if (exited === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
  if (!verdict.ok && output.trim() !== '') {
    verdict.summary += `\n--- app output ---\n${output.slice(0, 4000)}`;
  }
  return verdict;
}

const { values } = parseArgs({
  options: {
    'app': { type: 'string' },
    'no-smoke': { type: 'boolean', default: false },
  },
});

if (!values.app) fail('missing required --app <path-to-app-directory>');
const appDir = resolve(values.app);
const releaseBuilds = join(appDir, 'release-builds');
if (!existsSync(releaseBuilds)) {
  fail(`${releaseBuilds} does not exist — run electron-builder first`);
}
const expectedVersion = JSON.parse(
  readFileSync(join(appDir, 'package.json'), 'utf8'),
).version;

const targets = discoverTargets(releaseBuilds);
if (targets.length === 0) fail(`no packaged builds found in ${releaseBuilds}`);

const smokeEnabled = !values['no-smoke'] && process.platform !== 'win32';
let verifiedCount = 0;
let failed = false;

for (const target of targets) {
  console.log(`\n=== ${target.label}`);
  if (!isRunnable(target.binary)) {
    console.log('skipped: binary is not runnable on this host (foreign arch)');
    continue;
  }
  verifiedCount += 1;

  const sweepResult = runSweep(target, expectedVersion);
  console.log(`sweep: ${sweepResult.summary}`);
  if (!sweepResult.ok) {
    failed = true;
    for (const problem of sweepResult.problems ?? []) {
      console.log(`  FAIL ${problem}`);
    }
  }
  for (const warning of sweepResult.warnings ?? []) {
    console.log(`  warn ${warning}`);
  }

  if (smokeEnabled) {
    const smokeResult = await runBootSmoke(target);
    console.log(
      `boot smoke: ${smokeResult.ok ? 'ok' : 'FAIL'} — ${smokeResult.summary}`,
    );
    if (!smokeResult.ok) failed = true;
  }
}

if (verifiedCount === 0) {
  fail('no packaged build was runnable on this host — nothing was verified');
}
if (failed) fail('verification failed');
console.log(`\nverified ${verifiedCount} packaged build(s) OK`);
