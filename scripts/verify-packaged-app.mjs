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
//   2. Boot smoke (macOS/Linux) — launches the packaged app with
//      --remote-debugging-port and requires POSITIVE evidence of a healthy
//      boot via the DevTools protocol: a window whose navigation committed to
//      real content. "The process is still alive" is deliberately not
//      trusted (a main-process uncaught-exception dialog keeps the process
//      alive), and neither is "a renderer process exists" (renderers spawn
//      before loadFile resolves — a missing or broken renderer entry would
//      still show one; it surfaces as a chrome-error:// URL instead).
//
// The resolution sweep runs for EVERY packaged build found (using any
// host-runnable binary as the sweeper — per-arch asar JS content is
// identical, but each asar is still checked individually); the boot smoke
// runs only for builds the host can execute.
//
// Architect additionally vendors the Interviewer preview's preload and
// renderer OUTSIDE the asar via extraResources; their presence is required
// per app and the preload's requires are checked separately, since no
// node_modules exists beside them at runtime and the boot smoke never opens
// the Preview window.
//
// Both 6.6.0 classic launch crashes (missing readable-stream/passthrough in
// Architect, missing lodash/defaults in Interviewer) fail check 1 instantly
// and check 2 within its timeout.
//
// Usage: node scripts/verify-packaged-app.mjs --app apps/architect-classic
//        [--no-smoke]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const requireCjs = createRequire(import.meta.url);
const { extractSpecifiers, shouldCheckSpecifier } = requireCjs(
  './verify-packaged-app-sweep.cjs',
);

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

function runSweep(sweeperBinary, target, expectedVersion) {
  const result = spawnSync(sweeperBinary, [SWEEP_WORKER, target.asar], {
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
    name: report.name,
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

// Architect vendors the Interviewer preview's renderer and preload OUTSIDE
// the asar via extraResources (resources/interviewer); createPreviewWindow
// loads them at runtime when a user opens Preview, so the ordinary boot
// smoke never exercises them. Per app (keyed by the asar's package name),
// these paths MUST exist in the packaged output — a silently-dropped
// extraResources copy would otherwise ship and only fail when a user opens
// Preview. No node_modules exists beside extraResources, so every require in
// the vendored preload must be a builtin or electron, and relative requires
// must stay inside the vendored tree. The vendored renderer is a
// bundler-produced browser bundle; only its entry html is asserted.
const VENDORED_RESOURCES = {
  '@codaco/architect-classic': {
    preloadDirs: ['interviewer/preload'],
    requiredFiles: ['interviewer/renderer/index.html'],
  },
};

function checkVendoredResources(target, appName) {
  const expectations = VENDORED_RESOURCES[appName];
  if (expectations === undefined) return [];
  const resourcesDir = dirname(target.asar);
  const problems = [];

  for (const relFile of expectations.requiredFiles) {
    if (!existsSync(join(resourcesDir, relFile))) {
      problems.push(
        `${relFile}: required vendored resource is missing from the packaged app`,
      );
    }
  }

  for (const relDir of expectations.preloadDirs) {
    const absDir = join(resourcesDir, relDir);
    if (!existsSync(absDir)) {
      problems.push(
        `${relDir}: required vendored preload directory is missing from the packaged app`,
      );
      continue;
    }
    const preloadFiles = readdirSync(absDir).filter((entry) =>
      ['.js', '.cjs', '.mjs'].includes(extname(entry)),
    );
    if (preloadFiles.length === 0) {
      problems.push(
        `${relDir}: vendored preload directory contains no scripts`,
      );
    }
    for (const entry of preloadFiles) {
      const filePath = join(absDir, entry);
      const label = `${relDir}/${entry}`;
      for (const specifier of extractSpecifiers(
        readFileSync(filePath, 'utf8'),
      )) {
        if (!shouldCheckSpecifier(specifier)) continue;
        if (!specifier.startsWith('.')) {
          problems.push(
            `${label} -> ${specifier}: bare module require in a vendored preload (no node_modules exists beside extraResources at runtime)`,
          );
          continue;
        }
        try {
          const resolved = createRequire(filePath).resolve(specifier);
          if (!resolved.startsWith(resourcesDir + '/')) {
            problems.push(
              `${label} -> ${specifier}: resolves outside the vendored resources tree (${resolved})`,
            );
          }
        } catch (resolveError) {
          problems.push(
            `${label} -> ${specifier}: ${resolveError.message.split('\n')[0]}`,
          );
        }
      }
    }
  }
  return problems;
}

const DEVTOOLS_LISTENING_RE =
  /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//;

// Evaluate one expression in a page over the DevTools protocol.
function evaluateInPage(webSocketDebuggerUrl, expression) {
  return new Promise((resolveEvaluation, rejectEvaluation) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      socket.close();
      rejectEvaluation(new Error('DevTools evaluation timed out'));
    }, 5_000);
    socket.addEventListener('open', () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      ),
    );
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolveEvaluation(message.result?.result?.value);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      rejectEvaluation(new Error('DevTools socket error'));
    });
  });
}

// A committed file:// URL alone does not prove the renderer works — the HTML
// can load while a referenced script asset is missing or its bootstrap
// throws immediately. Both classic renderers mount their app into #root, so
// a populated root element is the evidence that renderer JavaScript actually
// executed.
const RENDERER_MOUNT_EXPRESSION =
  "(document.getElementById('root') ?? document.body).childElementCount";

async function runBootSmoke(target) {
  // Port 0 lets the OS choose; the chosen port is announced on stderr.
  const args = ['--remote-debugging-port=0'];
  if (target.platform === 'linux') {
    // The unpacked chrome-sandbox helper lacks its setuid bit outside a real
    // install, so the packaged binary cannot start sandboxed from
    // release-builds/.
    args.push('--no-sandbox');
  }
  let output = '';
  const child = spawn(target.binary, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  let exited = null;
  child.on('exit', (code, signal) => (exited = { code, signal }));
  const pid = child.pid;
  if (pid === undefined) {
    return { ok: false, summary: 'app process failed to spawn' };
  }

  let verdict = null;
  const deadline = Date.now() + SMOKE_TIMEOUT_MS;
  while (Date.now() < deadline && verdict === null) {
    await new Promise((r) => setTimeout(r, SMOKE_POLL_MS));
    if (exited !== null) {
      verdict = {
        ok: false,
        summary: `app exited during startup (${JSON.stringify(exited)})`,
      };
      break;
    }
    const port = DEVTOOLS_LISTENING_RE.exec(output)?.[1];
    if (port === undefined) continue;
    let pages;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      pages = (await response.json()).filter((t) => t.type === 'page');
    } catch {
      continue; // DevTools endpoint not ready yet
    }
    // A failed window load commits to a chrome-error:// URL; a window still
    // navigating reports about:blank or an empty URL. A window that committed
    // to real content must ALSO show a populated mount point, proving the
    // renderer's JavaScript executed rather than just its HTML parsing.
    const errorPage = pages.find((p) => p.url.startsWith('chrome-error://'));
    if (errorPage) {
      verdict = {
        ok: false,
        summary: `a window failed to load its content (${errorPage.url})`,
      };
      break;
    }
    for (const page of pages) {
      if (page.url === '' || page.url === 'about:blank') continue;
      const mounted = await evaluateInPage(
        page.webSocketDebuggerUrl,
        RENDERER_MOUNT_EXPRESSION,
      ).catch(() => undefined);
      if (typeof mounted === 'number' && mounted > 0) {
        verdict = {
          ok: true,
          summary: `window loaded ${page.url} and mounted ${mounted} root element(s)`,
        };
        break;
      }
    }
  }
  if (verdict === null) {
    verdict = {
      ok: false,
      summary:
        'no window loaded and mounted renderer content before timeout — ' +
        'either the main process is stalled at an uncaught-exception dialog ' +
        'or the renderer failed to bootstrap',
    };
  }
  if (exited === null) {
    try {
      process.kill(-pid, 'SIGKILL');
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

// Any host-runnable binary can sweep any asar (the sweep only reads the
// archive), so every packaged build is swept even when its own binary is for
// a foreign CPU architecture. Only the boot smoke needs the target's binary.
const runnable = new Set(targets.filter((t) => isRunnable(t.binary)));
const sweeper = targets.find((t) => runnable.has(t));
if (sweeper === undefined) {
  fail('no packaged build is runnable on this host — nothing can be verified');
}

const smokeEnabled = !values['no-smoke'] && process.platform !== 'win32';
let failed = false;

for (const target of targets) {
  console.log(`\n=== ${target.label}`);

  const sweepResult = runSweep(sweeper.binary, target, expectedVersion);
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

  const vendoredProblems = checkVendoredResources(target, sweepResult.name);
  if (vendoredProblems.length > 0) {
    failed = true;
    for (const problem of vendoredProblems) {
      console.log(`  FAIL ${problem}`);
    }
  }

  if (smokeEnabled) {
    if (runnable.has(target)) {
      const smokeResult = await runBootSmoke(target);
      console.log(
        `boot smoke: ${smokeResult.ok ? 'ok' : 'FAIL'} — ${smokeResult.summary}`,
      );
      if (!smokeResult.ok) failed = true;
    } else {
      console.log(
        'boot smoke: skipped — binary is not runnable on this host (foreign arch)',
      );
    }
  }
}

if (failed) fail('verification failed');
console.log(`\nverified ${targets.length} packaged build(s) OK`);
