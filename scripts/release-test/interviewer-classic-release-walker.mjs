#!/usr/bin/env node
// Release-test walker for Interviewer Classic (/interviewer-classic-release-test).
//
// Drives a locally built release candidate through the journeys a researcher
// depends on, on one platform per run:
//
//   desktop  the packaged Electron app (release-builds/), native dialogs
//            stubbed so file import and export run unattended
//   android  the debug APK in a running emulator, through Playwright's
//            Android WebView support; the system file picker is driven by
//            UI Automator selectors, the export is read from the app's cache
//   ios      the simulator build, through the WebKit inspector
//            (ios_webkit_debug_proxy). The Files picker and the share sheet
//            are native UI no script can reach: those steps are emitted as
//            `manual` entries for the agent running the skill, and
//            `--phase verify-imports` checks the agent's imports afterwards.
//
// One journey runs everywhere: install the sample protocol (URL download),
// conduct an interview through the sample protocol's consent, ego form, quick
// add, sociogram placement and edge creation stages to the finish screen,
// export the session and check the zip's contents, then import a protocol file
// of every supported schema version (7 to 4 — the older ones are migrated) and
// confirm a schema 8 file is refused with an explanation.
// Persisted state (localStorage `persist:networkCanvas6`) is the oracle for
// installs and sessions, so the checks do not depend on transient toasts.
//
// Every bug the 6.6.2 release smoke test found by hand fails a check here:
// the validator chunk missing from the bundle (sample install), the minified
// CSS custom property that stopped mobile interviews rendering (first stage),
// sociogram nodes that stayed invisible after placement, the empty
// APP_VERSION in exports, mobile file imports resolving the picked file
// inside the app's storage, and unsynced native version stamps.
//
// Usage (from the repo root):
//   node scripts/release-test/interviewer-classic-release-walker.mjs \
//     --platform desktop|android|ios --artifacts <dir> \
//     [--app-dir apps/interviewer-classic] [--expect-version <semver>] \
//     [--binary <packaged electron binary>]          (desktop)
//     [--app-path <App.app|app-debug.apk>] [--device <udid|serial>]  (mobile)
//     [--phase verify-imports]                          (ios, after manual imports)
//     [--timeout-ms 900000]
import { execFile as execFileCb, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify, parseArgs } from 'node:util';

import {
  checkNativeVersions,
  closeElectron,
  mainWindow,
  createRun,
  findPackagedBinary,
  inspectInterviewerExport,
  launchElectron,
  PAGE_HELPERS,
  playwrightDriver,
  queueDialog,
  readAppVersion,
  repoRoot,
  SetupError,
  trackPageErrors,
  waitFor,
} from './classic-release-lib.mjs';

const execFile = promisify(execFileCb);

const { values: args } = parseArgs({
  options: {
    'platform': { type: 'string', default: 'desktop' },
    'artifacts': { type: 'string' },
    'app-dir': { type: 'string', default: 'apps/interviewer-classic' },
    'expect-version': { type: 'string' },
    'binary': { type: 'string' },
    'app-path': { type: 'string' },
    'device': { type: 'string' },
    'phase': { type: 'string', default: 'journey' },
    'case-id': { type: 'string', default: 'release-test' },
    'timeout-ms': { type: 'string', default: '900000' },
  },
});

if (!args.artifacts) {
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
const artifactsDir = path.resolve(args.artifacts);
const appDir = path.resolve(repoRoot, args['app-dir']);
const platform = args.platform;
const caseId = args['case-id'];
const expectedVersion = args['expect-version'] ?? readAppVersion(appDir);

const run = createRun({
  artifactsDir,
  timeoutMs: Number(args['timeout-ms']),
  meta: {
    app: 'interviewer-classic',
    platform,
    phase: args.phase,
    expectedVersion,
    caseId,
  },
});

// --- fixtures ---------------------------------------------------------------

// Protocol files imported through each platform's file picker. Copied to
// short names (rt7.netcanvas …): the installed protocol takes its name from
// the file, and the iOS Files grid truncates longer names past telling apart.
const DOCS_PROTOCOLS = 'packages/protocols/documentation/protocols';
// One file per schema version the app supports (config.js
// APP_SUPPORTED_SCHEMA_VERSIONS: 4–7; older ones are migrated on import), plus
// a schema 8 file — what current Architect writes, so the likeliest file a
// researcher hands a classic install — which the app must refuse with an
// explanation rather than fail on.
const IMPORT_FIXTURES = [
  {
    source: `${DOCS_PROTOCOLS}/HBH-PS-v21(9-15-22).netcanvas`,
    name: 'rt7',
    schemaVersion: 7,
  },
  {
    source: `${DOCS_PROTOCOLS}/Sample Protocol v3.netcanvas`,
    name: 'rt6',
    schemaVersion: 6,
  },
  {
    source: `${DOCS_PROTOCOLS}/SB21_workshop_protocol_1.netcanvas`,
    name: 'rt5',
    schemaVersion: 5,
  },
  {
    source: `${DOCS_PROTOCOLS}/Public Health Demo Protocol.netcanvas`,
    name: 'rt4',
    schemaVersion: 4,
  },
  {
    source: 'packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas',
    name: 'rt8',
    schemaVersion: 8,
    refused: 'not compatible with this version',
  },
];
function stageFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return IMPORT_FIXTURES.map((f) => {
    const file = path.join(dir, `${f.name}.netcanvas`);
    fs.copyFileSync(path.join(repoRoot, f.source), file);
    return { ...f, file };
  });
}

// The sample protocol ("Sample Protocol v4", schema 7) installed from the
// start screen. Stage indices are the protocol's; the finish screen is the
// index after the last stage.
const SAMPLE = {
  name: 'Sample Protocol v4',
  schemaVersion: 7,
  firstStageText: 'Welcome to the Sample Protocol',
  stages: {
    consent: 3,
    egoForm: 4,
    quickAdd: 6,
    sociogram: 16,
    edges: 19,
    finish: 30,
  },
  nodeType: 'Person',
  nodeNames: ['Alice', 'Bob', 'Carol'],
  layoutVariable: 'sociogram_layout',
  edgeType: 'know',
};

// --- persisted-state oracle ---------------------------------------------------

// Desktop persists to localStorage; Capacitor builds persist through
// localforage to IndexedDB (database networkCanvas6, store redux_store).
const STATE = `(async () => {
  let raw = localStorage.getItem('persist:networkCanvas6');
  if (!raw && window.indexedDB) {
    raw = await new Promise((resolve) => {
      const open = indexedDB.open('networkCanvas6');
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('redux_store')) { db.close(); resolve(null); return; }
        const req = db.transaction('redux_store').objectStore('redux_store').get('persist:networkCanvas6');
        req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
        req.onerror = () => { db.close(); resolve(null); };
      };
    });
  }
  if (!raw) return null;
  const root = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const slice = (key) => { try { return typeof root[key] === 'string' ? JSON.parse(root[key]) : root[key]; } catch { return null; } };
  return {
    protocols: Object.values(slice('installedProtocols') || {}).map((p) => ({ name: p.name, schemaVersion: p.schemaVersion })),
    sessions: Object.values(slice('sessions') || {}).map((s) => ({
      caseId: s.caseId,
      finishedAt: s.finishedAt ?? null,
      exportedAt: s.exportedAt ?? null,
      nodes: s.network?.nodes?.length ?? 0,
      edges: s.network?.edges?.length ?? 0,
    })),
  };
})()`;

const stageIndex = `(() => { const m = location.hash.match(/\\/session\\/[^/]+\\/(\\d+)/); return m ? Number(m[1]) : null; })()`;

// --- platforms --------------------------------------------------------------

async function desktopPlatform() {
  const binary = args.binary
    ? path.resolve(args.binary)
    : findPackagedBinary(appDir);
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'interviewer-classic-rt-'),
  );
  run.note(`binary: ${binary}`);
  const app = await launchElectron({ executablePath: binary, userDataDir });
  const pageErrors = trackPageErrors(app);
  const page = await mainWindow(app);
  await page.waitForLoadState('domcontentloaded');
  const driver = playwrightDriver(page, { artifactsDir });
  return {
    driver,
    async importFile(fixture) {
      await queueDialog(app, 'open', fixture.file);
      await driver.eval(`__rt.click(__rt.byText('Import From File'))`);
      return true;
    },
    async exportZip(trigger) {
      const out = path.join(artifactsDir, 'export.zip');
      fs.rmSync(out, { force: true });
      await queueDialog(app, 'save', out);
      await trigger();
      await waitForLocal(
        () => fs.existsSync(out) && fs.statSync(out).size > 0,
        60_000,
        'export zip written',
      );
      await new Promise((r) => setTimeout(r, 500));
      return { zip: fs.readFileSync(out), afterExport: async () => {} };
    },
    finalChecks: () => [
      {
        check: 'no uncaught renderer exceptions',
        ok: pageErrors.length === 0,
        note: pageErrors.slice(0, 5).join(' | ') || undefined,
      },
    ],
    close: () => closeElectron(app),
  };
}

async function androidPlatform() {
  const { _android } = await import('playwright');
  const devices = await _android.devices();
  const device = args.device
    ? devices.find((d) => d.serial() === args.device)
    : devices[0];
  if (!device)
    throw new SetupError(
      'no Android device or emulator connected (adb devices)',
    );
  const gradle = fs.readFileSync(
    path.join(appDir, 'android/app/build.gradle'),
    'utf8',
  );
  const pkg = gradle.match(/applicationId\s+["']([^"']+)["']/)?.[1];
  if (args['app-path']) {
    run.note(`installing ${args['app-path']}`);
    await device.installApk(fs.readFileSync(path.resolve(args['app-path'])));
  }
  const installed = (await device.shell(`pm list packages ${pkg}`)).toString();
  if (!installed.includes(pkg))
    throw new SetupError(`${pkg} is not installed on ${device.serial()}`);
  await device.shell(`pm clear ${pkg}`);
  await device.shell(`am start -W -n ${pkg}/.MainActivity`);
  // Native UI (the system file picker, Android's own tips) is driven through
  // adb: a UI Automator dump locates the target, `input tap` presses it. This
  // keeps the run to adb alone (Playwright's selector API needs an extra
  // driver APK on the device).
  const uiNodes = async () => {
    await device.shell('uiautomator dump /sdcard/rt-ui.xml');
    const xml = (await device.shell('cat /sdcard/rt-ui.xml')).toString();
    return [...xml.matchAll(/<node [^>]*>/g)].map(([node]) => {
      const attr = (name) =>
        node.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
      const [x1, y1, x2, y2] = (
        attr('bounds').match(/\d+/g) ?? [0, 0, 0, 0]
      ).map(Number);
      return {
        text: attr('text'),
        desc: attr('content-desc'),
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
      };
    });
  };
  // Waits for the screen to settle before reading it and after tapping:
  // coordinates read mid-animation (the picker's drawer slides in) land on
  // whatever slides under them.
  const uiTap = async (predicate, label, timeout = 15_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_000));
      const node = (await uiNodes()).find(predicate);
      if (node) {
        await device.shell(
          `input tap ${Math.round(node.x)} ${Math.round(node.y)}`,
        );
        await new Promise((r) => setTimeout(r, 1_000));
        return node;
      }
    }
    throw new Error(`${label} not found on screen`);
  };
  // Android shows an immersive-mode tip over the app on first launch.
  await uiTap((n) => n.text === 'Got it', 'immersive-mode tip', 6_000).catch(
    () => {},
  );
  const webview = await device.webView({ pkg }, { timeout: 30_000 });
  const page = await webview.page();
  const driver = playwrightDriver(page, { artifactsDir });
  driver.screenshot = async (name) => {
    const png = await device.screenshot().catch(() => null);
    if (png) fs.writeFileSync(path.join(artifactsDir, `${name}.png`), png);
  };
  const cacheZips = async () =>
    (await device.shell(`run-as ${pkg} ls cache`))
      .toString()
      .split(/\s+/)
      .filter((f) => /^networkCanvasExport-.*\.zip$/.test(f));
  return {
    driver,
    async importFile(fixture) {
      const remote = `/sdcard/Download/${fixture.name}.netcanvas`;
      await device.push(fs.readFileSync(fixture.file), remote);
      await device.shell(
        `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${remote}`,
      );
      await driver.eval(`__rt.click(__rt.byText('Import From File'))`);
      // The picker reopens wherever it was last left, so find the file with
      // its search (which covers every location) rather than by navigating.
      try {
        await uiTap((n) => n.desc === 'Search', 'the file picker');
        await device.shell(`input text ${fixture.name}`);
        await device.shell('input keyevent 66');
        await uiTap(
          (n) => n.text === `${fixture.name}.netcanvas`,
          `${fixture.name}.netcanvas in the search results`,
        );
      } catch (error) {
        // Leave the picker so the next import starts from the app.
        await driver.screenshot(`android-picker-${fixture.name}`);
        await device.shell('input keyevent 4');
        await device.shell('input keyevent 4');
        throw error;
      }
      return true;
    },
    async exportZip(trigger) {
      const before = new Set(await cacheZips());
      await trigger();
      let name;
      await waitForLocal(
        async () => {
          name = (await cacheZips()).find((f) => !before.has(f));
          return Boolean(name);
        },
        60_000,
        'export zip written to the app cache',
      );
      await new Promise((r) => setTimeout(r, 1_000));
      const zip = await device.shell(`run-as ${pkg} cat cache/${name}`);
      fs.writeFileSync(path.join(artifactsDir, 'export.zip'), zip);
      return {
        zip,
        // The share sheet is open over the app; back dismisses it, which the
        // app treats as a completed export (the file is already written).
        afterExport: async () => {
          await driver.screenshot('android-share-sheet');
          await device.shell('input keyevent 4');
        },
      };
    },
    finalChecks: () => [],
    close: async () => {
      await device.close().catch(() => {});
    },
  };
}

// Minimal WebKit inspector client over ios_webkit_debug_proxy. The simulator
// wraps each page in a Target, so every command goes through
// Target.sendMessageToTarget; Runtime.evaluate cannot await, so a promise is
// resolved with Runtime.awaitPromise.
async function connectWebKit(port, urlPrefix) {
  const deadline = Date.now() + 30_000;
  let page;
  while (!page && Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://localhost:${port}/json`)).json();
      page = pages.find((p) => p.url?.startsWith(urlPrefix));
    } catch {
      // proxy still starting
    }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page)
    throw new SetupError(
      `no ${urlPrefix} page on the WebKit inspector (port ${port})`,
    );
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let target;
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve) => {
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      // Embedded frames are announced as targets too (and destroyed when the
      // stage changes); commands must go to the page.
      if (
        msg.method === 'Target.targetCreated' &&
        msg.params.targetInfo.type === 'page' &&
        !msg.params.targetInfo.isProvisional
      ) {
        target = msg.params.targetInfo.targetId;
        resolve();
      }
      if (msg.method === 'Target.didCommitProvisionalTarget') {
        target = msg.params.newTargetId;
      }
      if (msg.method === 'Target.dispatchMessageFromTarget') {
        const inner = JSON.parse(msg.params.message);
        if (inner.id && pending.has(inner.id)) {
          pending.get(inner.id)(inner);
          pending.delete(inner.id);
        }
      }
    });
  });
  await new Promise((r, j) => {
    ws.addEventListener('open', r, { once: true });
    ws.addEventListener('error', j, { once: true });
  });
  await Promise.race([
    ready,
    new Promise((_, j) =>
      setTimeout(
        () => j(new SetupError('WebKit target never announced')),
        10_000,
      ),
    ),
  ]);
  // A reply can be lost when the simulator re-announces the page's target
  // (later commands go to the new one), so every command has a deadline: a
  // lost reply fails its step instead of hanging the run.
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      const messageId = id;
      const timer = setTimeout(() => {
        pending.delete(messageId);
        reject(
          new Error(`WebKit inspector did not answer ${method} within 20s`),
        );
      }, 20_000);
      pending.set(messageId, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      ws.send(
        JSON.stringify({
          id: 100_000 + id,
          method: 'Target.sendMessageToTarget',
          params: {
            targetId: target,
            message: JSON.stringify({ id: messageId, method, params }),
          },
        }),
      );
    });
  // A function call with data goes through Runtime.callFunctionOn, so the
  // value arrives as an argument rather than as part of the evaluated code.
  const callWithArg = async (source, arg) => {
    const win = await send('Runtime.evaluate', { expression: 'window' });
    if (win.error) throw new Error(win.error.message);
    return send('Runtime.callFunctionOn', {
      objectId: win.result.result.objectId,
      functionDeclaration: `function (source, value) { ${PAGE_HELPERS}; return Promise.resolve((0, eval)('(' + source + ')')(value)).then((v) => JSON.stringify(v === undefined ? null : v)); }`,
      arguments: [{ value: source }, { value: arg }],
      emulateUserGesture: true,
    });
  };
  const evaluate = async (expression, arg) => {
    const first =
      arg === undefined
        ? await send('Runtime.evaluate', {
            expression: `Promise.resolve((() => { ${PAGE_HELPERS}; return (${expression}); })()).then((v) => JSON.stringify(v === undefined ? null : v))`,
            emulateUserGesture: true,
          })
        : await callWithArg(expression, arg);
    if (first.error) throw new Error(first.error.message);
    if (first.result.wasThrown)
      throw new Error(first.result.result.description);
    const settled = await send('Runtime.awaitPromise', {
      promiseObjectId: first.result.result.objectId,
      returnByValue: true,
    });
    if (settled.error) throw new Error(settled.error.message);
    if (settled.result.wasThrown)
      throw new Error(settled.result.result.description ?? 'evaluation threw');
    return JSON.parse(settled.result.result.value);
  };
  return { evaluate, close: () => ws.close() };
}

async function iosPlatform() {
  const simctl = async (...a) =>
    (await execFile('xcrun', ['simctl', ...a], { maxBuffer: 64 * 1024 * 1024 }))
      .stdout;
  const booted = JSON.parse(await simctl('list', 'devices', 'booted', '-j'));
  const udid = args.device ?? Object.values(booted.devices).flat()[0]?.udid;
  if (!udid)
    throw new SetupError('no booted iOS simulator (xcrun simctl boot <udid>)');
  // The iOS bundle id is the Xcode project's own (it differs from Android's
  // applicationId); read it from the built app, or the project when attaching.
  const pbx = fs.readFileSync(
    path.join(appDir, 'ios/App/App.xcodeproj/project.pbxproj'),
    'utf8',
  );
  let bundleId = pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/)?.[1];
  if (args.phase === 'journey') {
    if (!args['app-path']) {
      throw new SetupError(
        '--app-path <App.app> is required for the iOS journey',
      );
    }
    const appPath = path.resolve(args['app-path']);
    bundleId = (
      await execFile('plutil', [
        '-extract',
        'CFBundleIdentifier',
        'raw',
        path.join(appPath, 'Info.plist'),
      ])
    ).stdout.trim();
    await simctl('terminate', udid, bundleId).catch(() => {});
    await simctl('uninstall', udid, bundleId).catch(() => {});
    await simctl('install', udid, appPath);
    await simctl('launch', udid, bundleId);
  }

  // Each booted simulator has its own launchd_sim (its command line names the
  // device directory) holding that simulator's Web Inspector socket; take the
  // socket of the simulator under test, not the first one on the host.
  const launchdPid = (
    await execFile('pgrep', ['-f', `launchd_sim .*/Devices/${udid}/`]).catch(
      () => ({ stdout: '' }),
    )
  ).stdout
    .trim()
    .split('\n')[0];
  const socket = launchdPid
    ? (
        await execFile('lsof', ['-a', '-U', '-p', launchdPid]).catch(() => ({
          stdout: '',
        }))
      ).stdout.match(/(\/\S*com\.apple\.webinspectord_sim\.socket)/)?.[1]
    : undefined;
  if (!socket)
    throw new SetupError(
      `Web Inspector socket for simulator ${udid} not found (is it booted?)`,
    );
  const proxy = spawn(
    'ios_webkit_debug_proxy',
    ['-s', `unix:${socket}`, '-c', 'null:9221,:9222-9232'],
    { stdio: 'ignore' },
  );
  proxy.on('error', () => {});
  const webkit = await connectWebKit(9222, 'capacitor://');
  const driver = {
    eval: (expression, arg) => webkit.evaluate(expression, arg),
    async screenshot(name) {
      await simctl(
        'io',
        udid,
        'screenshot',
        path.join(artifactsDir, `${name}.png`),
      ).catch(() => {});
    },
  };
  const dataContainer = (
    await simctl('get_app_container', udid, bundleId, 'data')
  ).trim();
  const cacheDir = path.join(dataContainer, 'Library', 'Caches');
  const cacheZips = () =>
    fs.existsSync(cacheDir)
      ? fs
          .readdirSync(cacheDir)
          .filter((f) => /^networkCanvasExport-.*\.zip$/.test(f))
      : [];
  // Files' "On My iPad" storage — exists once the Files app has run.
  const appGroups = path.join(
    os.homedir(),
    'Library/Developer/CoreSimulator/Devices',
    udid,
    'data/Containers/Shared/AppGroup',
  );
  const onMyDevice = fs.existsSync(appGroups)
    ? fs
        .readdirSync(appGroups)
        .map((g) => path.join(appGroups, g, 'File Provider Storage'))
        .find((p) => fs.existsSync(p))
    : undefined;
  return {
    driver,
    udid,
    onMyDevice,
    importFile: null,
    async exportZip(trigger) {
      const before = new Set(cacheZips());
      await trigger();
      let name;
      await waitForLocal(
        () => {
          name = cacheZips().find((f) => !before.has(f));
          return Boolean(name);
        },
        60_000,
        'export zip written to the app cache',
      );
      await new Promise((r) => setTimeout(r, 1_000));
      const zip = fs.readFileSync(path.join(cacheDir, name));
      fs.writeFileSync(path.join(artifactsDir, 'export.zip'), zip);
      return {
        zip,
        afterExport: async () => {
          await driver.screenshot('ios-share-sheet');
          run.manual(
            'ios-save-to-files',
            'The share sheet is open. Tap "Save to Files", choose On My iPad, and tap Save; then confirm the zip appears in the Files storage folder and the session card shows an export time instead of "Not yet exported".',
          );
        },
      };
    },
    finalChecks: () => [],
    close: async () => {
      webkit.close();
      proxy.kill();
    },
  };
}

async function waitForLocal(predicate, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label}: not within ${timeout}ms`);
}

// --- journey ----------------------------------------------------------------

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function journey(p) {
  const { driver } = p;
  const check = async (name, body) => {
    const value = await run.step(name, body);
    if (value === undefined) await driver.screenshot(`fail-${slug(name)}`);
    return value;
  };
  const errorsOrNull = `(() => { const e = __rt.errors(); return e.length ? e : null; })()`;
  // Fails fast with the visible error when the app reports one while waiting.
  const waitOrError = (expression, options) =>
    waitFor(
      driver,
      options?.arg === undefined
        ? `(() => { const e = __rt.errors(); if (e.length) return { error: e.join(' | ') }; return (${expression}) ? { ok: true } : null; })()`
        : `(arg) => { const e = __rt.errors(); if (e.length) return { error: e.join(' | ') }; return (${expression})(arg) ? { ok: true } : null; }`,
      options,
    ).then((r) => {
      if (r.error) throw new Error(`app reported: ${r.error}`);
      return r;
    });
  const state = () => driver.eval(STATE);

  const booted = await check('app boots to the start screen', async () => {
    await waitFor(driver, `Boolean(__rt.byText('Install sample protocol'))`, {
      timeout: 60_000,
      label: 'start screen',
    });
  });
  if (!booted) return;

  await check('start screen shows the expected version', async () => {
    const shown = await driver.eval(
      `[...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /^\\d+\\.\\d+\\.\\d+/.test(e.textContent.trim())).map((e) => e.textContent.trim())[0] ?? null`,
    );
    return {
      ok: shown === expectedVersion,
      note: `shown ${shown}, expected ${expectedVersion}`,
    };
  });

  if (platform !== 'desktop') {
    for (const c of checkNativeVersions(appDir, expectedVersion))
      run.record(c.check, c.ok, c.note);
  }

  const installed = await check(
    'install the sample protocol (URL download + validation)',
    async () => {
      await driver.eval(`__rt.click(__rt.byText('Install sample protocol'))`);
      await waitOrError(
        `document.body.textContent.includes('Protocol installed successfully')`,
        { timeout: 90_000, label: 'install success toast' },
      );
      const s = await waitFor(
        driver,
        `async (name) => { const s = await ${STATE}; return s?.protocols.some((p) => p.name === name) ? s : null; }`,
        { label: 'sample protocol persisted', arg: SAMPLE.name },
      );
      const sample = s.protocols.find((x) => x.name === SAMPLE.name);
      return {
        ok: sample.schemaVersion === SAMPLE.schemaVersion,
        note: `schemaVersion ${sample.schemaVersion}`,
      };
    },
  );

  // A journey that fails part-way can leave the app inside a session or an
  // overlay; the next journey starts from the start screen regardless, so one
  // failure does not hide the others.
  const toStartScreen = async () => {
    await driver
      .eval(
        `(() => { if (!location.hash.startsWith('#/start')) location.hash = '#/start'; return true; })()`,
      )
      .catch(() => {});
    await waitFor(driver, `Boolean(__rt.byText('Install sample protocol'))`, {
      timeout: 15_000,
      label: 'start screen',
    }).catch(() => run.note('could not return to the start screen'));
  };

  if (installed) {
    await conductInterview(driver, check, waitOrError);
    await toStartScreen();
    await exportSession(p, check, waitOrError);
  } else {
    run.note(
      'interview and export skipped: the sample protocol did not install',
    );
  }

  await toStartScreen();
  await importProtocols(p, check, waitOrError, state);

  for (const c of p.finalChecks()) run.record(c.check, c.ok, c.note);
  const leftover = await driver.eval(errorsOrNull).catch(() => null);
  if (leftover)
    run.note(
      `error surfaces visible at the end of the run: ${leftover.join(' | ')}`,
    );
}

async function conductInterview(driver, check, waitOrError) {
  const started = await check(
    'start an interview and render its first stage',
    async () => {
      await driver.eval(
        `__rt.click(document.querySelector('.protocol-card--clickable'))`,
      );
      await waitFor(
        driver,
        `Boolean(document.querySelector('input[name=case_id]'))`,
        { label: 'case ID prompt' },
      );
      await driver.eval(
        `(id) => __rt.typeInto(document.querySelector('input[name=case_id]'), id)`,
        caseId,
      );
      await driver.eval(`__rt.click(__rt.byText('Start interview'))`);
      // A stage that never paints (6.6.2's minified CSS variables broke every
      // transition in the mobile build) times out here.
      await waitOrError(
        `(text) => document.querySelector('.stage')?.textContent.includes(text)`,
        {
          timeout: 20_000,
          label: 'first stage rendered',
          arg: SAMPLE.firstStageText,
        },
      );
    },
  );
  if (!started) return;

  // Clicks next until the session reaches `target`, one prompt or stage at a
  // time. A click that changes neither the stage nor its prompt is retried
  // once; a second miss is a stuck stage.
  const signature = `location.hash + '|' + (document.querySelector('.stage')?.textContent.slice(0, 300) ?? '')`;
  const advanceTo = async (target) => {
    for (let clicks = 0; clicks < 60; clicks += 1) {
      const index = await driver.eval(stageIndex);
      if (index === target) return;
      if (index > target)
        throw new Error(`stage ${target} was skipped (now at ${index})`);
      let changed = false;
      for (let attempt = 0; attempt < 2 && !changed; attempt += 1) {
        const before = await driver.eval(signature);
        await driver.eval(
          `__rt.click(document.querySelector('.session-navigation__button--next'))`,
        );
        changed = await waitFor(
          driver,
          `(before) => (${signature}) !== before`,
          { timeout: 4_000, label: 'stage change', arg: before },
        ).catch(() => false);
      }
      if (!changed) {
        const errs = await driver.eval(`__rt.errors()`);
        throw new Error(
          `stuck at stage ${index}${errs.length ? `: ${errs.join(' | ')}` : ''}`,
        );
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    throw new Error(`did not reach stage ${target} within 60 clicks`);
  };

  const { stages } = SAMPLE;
  await check('consent form accepts an answer', async () => {
    await advanceTo(stages.consent);
    await driver.eval(
      `__rt.click(document.querySelector('.boolean-option:not(.boolean-option--negative)'))`,
    );
  });
  await check('ego form accepts text answers', async () => {
    await advanceTo(stages.egoForm);
    await driver.eval(
      `(async () => { const t = [...document.querySelectorAll('.stage input[type=text]')]; await __rt.typeInto(t[0], 'Release'); t[0].blur(); await __rt.typeInto(t[1], 'Tester'); t[1].blur(); return true; })()`,
    );
  });
  const quickAdded = await check('quick add creates nodes', async () => {
    await advanceTo(stages.quickAdd);
    await driver.eval(
      `__rt.click(document.querySelector('.action-button--clickable'))`,
    );
    await waitFor(
      driver,
      `Boolean(document.querySelector('input.label-input'))`,
      { label: 'quick add input' },
    );
    for (const name of SAMPLE.nodeNames) {
      await driver.eval(
        `async (name) => { const i = document.querySelector('input.label-input'); await __rt.typeInto(i, name); i.closest('form').requestSubmit(); return true; }`,
        name,
      );
      await waitFor(
        driver,
        `(name) => [...document.querySelectorAll('.name-generator-interface__nodes .node__label-text')].some((e) => e.textContent === name)`,
        { label: `${name} in the node list`, arg: name },
      );
    }
  });
  if (!quickAdded) return;

  await check(
    'nodes placed on the sociogram appear on the canvas',
    async () => {
      await advanceTo(stages.sociogram);
      const inView = await waitFor(
        driver,
        `(() => { const r = document.querySelector('.node-layout')?.getBoundingClientRect(); return r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; })()`,
        { timeout: 5_000, label: 'sociogram canvas within the viewport' },
      ).catch(() => false);
      if (!inView) {
        const scrolled = await driver.eval(
          `[...document.querySelectorAll('*')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => (e.id ? '#' + e.id : e.className.toString().split(' ')[0] || e.tagName) + ' ' + e.scrollLeft + ',' + e.scrollTop)`,
        );
        throw new Error(
          `sociogram canvas is outside the viewport; scrolled: ${scrolled.join('; ') || 'nothing'}`,
        );
      }
      const spots = [
        [0.35, 0.4],
        [0.6, 0.4],
        [0.48, 0.62],
      ];
      for (const [fx, fy] of spots) {
        const label = await driver.eval(`(async () => {
        const node = document.querySelector('.node-bucket .node');
        if (!node) return null;
        const label = node.querySelector('.node__label-text')?.textContent;
        const r = document.querySelector('.node-layout').getBoundingClientRect();
        await __rt.drag(node, r.x + r.width * ${fx}, r.y + r.height * ${fy});
        return label;
      })()`);
        if (!label) throw new Error('node bucket emptied early');
        // 6.6.2's NodeLayout regression left placed nodes unrendered until the
        // stage remounted.
        await waitFor(
          driver,
          `(label) => [...document.querySelectorAll('.node-layout .node__label-text')].some((e) => e.textContent === label && __rt.visible(e))`,
          {
            timeout: 5_000,
            label: `${label} visible on the canvas`,
            arg: label,
          },
        );
      }
      // The last node leaves the bucket through an exit animation.
      await waitFor(
        driver,
        `document.querySelectorAll('.node-bucket .node').length === 0`,
        {
          timeout: 5_000,
          label: 'node bucket empty',
        },
      );
    },
  );

  await check('clicking two nodes creates an edge', async () => {
    await advanceTo(stages.edges);
    const node = `(name) => [...document.querySelectorAll('.node-layout .node')].find((el) => el.querySelector('.node__label-text')?.textContent === name)`;
    await driver.eval(`(name) => __rt.click((${node})(name))`, 'Alice');
    await waitFor(
      driver,
      `(name) => (${node})(name)?.classList.contains('node--linking')`,
      {
        timeout: 5_000,
        label: 'Alice selected as the edge origin',
        arg: 'Alice',
      },
    );
    await driver.eval(`(name) => __rt.click((${node})(name))`, 'Bob');
    await waitFor(
      driver,
      `document.querySelectorAll('.edge-layout line').length >= 1`,
      {
        timeout: 5_000,
        label: 'edge drawn',
      },
    );
    await waitFor(
      driver,
      `async (id) => { const s = await ${STATE}; return (s?.sessions.find((x) => x.caseId === id)?.edges ?? 0) >= 1; }`,
      { timeout: 10_000, label: 'edge persisted', arg: caseId },
    );
  });

  await check('finish the interview', async () => {
    await advanceTo(stages.finish);
    await driver.eval(`__rt.click(__rt.byText('Finish'))`);
    await waitFor(driver, `location.hash.startsWith('#/start')`, {
      timeout: 15_000,
      label: 'back on the start screen',
    });
    const s = await waitFor(
      driver,
      `async (id) => { const s = await ${STATE}; const x = s?.sessions.find((y) => y.caseId === id); return x?.finishedAt ? x : null; }`,
      { label: 'session persisted as finished', arg: caseId },
    );
    const ok = s.nodes === SAMPLE.nodeNames.length && s.edges === 1;
    return { ok, note: `persisted ${s.nodes} node(s), ${s.edges} edge(s)` };
  });
}

async function exportSession(p, check, waitOrError) {
  const { driver } = p;
  let exported;
  await check('export the session to a zip', async () => {
    await driver.eval(`__rt.click(__rt.byText('Sessions'))`);
    await waitFor(
      driver,
      `(id) => [...document.querySelectorAll('.session-card')].filter(__rt.visible).some((c) => c.textContent.includes(id))`,
      { label: 'session list', arg: caseId },
    );
    // The start screen's "resume" card is also a .session-card; the
    // management overlay's copy is the last one in the document.
    await driver.eval(
      `(id) => __rt.click([...document.querySelectorAll('.session-card')].filter((c) => __rt.visible(c) && c.textContent.includes(id)).pop())`,
      caseId,
    );
    await driver.eval(`__rt.click(__rt.byText('Export Selected To File'))`);
    await waitFor(driver, `Boolean(__rt.byText('Start Export Process'))`, {
      label: 'export options',
    });
    exported = await p.exportZip(() =>
      driver.eval(`__rt.click(__rt.byText('Start Export Process'))`),
    );
    return `${exported.zip.length} bytes`;
  });
  if (!exported) return;

  const checks = await inspectInterviewerExport(exported.zip, {
    caseId,
    appVersion: expectedVersion,
    nodeType: SAMPLE.nodeType,
    nodeNames: SAMPLE.nodeNames,
    layoutVariable: SAMPLE.layoutVariable,
    edgeType: SAMPLE.edgeType,
    edgeCount: 1,
    edgeBetween: ['Alice', 'Bob'],
  });
  for (const c of checks) run.record(`export: ${c.check}`, c.ok, c.note);

  await exported.afterExport();
  if (platform !== 'ios') {
    await check('session is marked exported', async () => {
      await waitOrError(
        `document.body.textContent.includes('Export Complete')`,
        { timeout: 30_000, label: 'export complete toast' },
      );
      await waitFor(
        driver,
        `async (id) => { const s = await ${STATE}; return s?.sessions.find((x) => x.caseId === id)?.exportedAt; }`,
        { label: 'exportedAt persisted', arg: caseId },
      );
    });
  }
  // Leave the management overlay so the start screen's import buttons are
  // reachable.
  await driver
    .eval(
      `(() => { const close = document.querySelector('.overlay__close, [class*="close-button"]'); if (close && __rt.visible(close)) __rt.click(close); return true; })()`,
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
}

async function importProtocols(p, check, waitOrError, state) {
  const { driver } = p;
  const fixtures = stageFixtures(path.join(artifactsDir, 'fixtures'));
  if (!p.importFile) {
    if (args.phase === 'verify-imports') {
      const s = await state();
      for (const f of fixtures) {
        const got = s?.protocols.find((x) => x.name === f.name);
        if (f.refused) {
          run.record(
            `schema ${f.schemaVersion} protocol is refused with an explanation`,
            !got,
            got
              ? 'the refused protocol was installed'
              : 'not installed (the agent confirms the explanation was shown)',
          );
          continue;
        }
        run.record(
          `import schema ${f.schemaVersion} protocol from file`,
          Boolean(got),
          got
            ? `installed as ${got.name}`
            : `not installed; installed: ${s?.protocols.map((x) => x.name).join(', ')}`,
        );
      }
      return;
    }
    if (p.onMyDevice) {
      for (const f of fixtures)
        fs.copyFileSync(f.file, path.join(p.onMyDevice, path.basename(f.file)));
      run.note(
        `staged ${fixtures.map((f) => path.basename(f.file)).join(', ')} in Files > On My iPad`,
      );
    }
    run.manual(
      'ios-import-from-files',
      `${p.onMyDevice ? '' : 'Open the Files app once so its On My iPad storage exists, then copy the files from ' + path.join(artifactsDir, 'fixtures') + ' into it. '}For each of ${fixtures.map((f) => path.basename(f.file)).join(', ')}: tap "Import From File", open On My iPad in the Files picker and pick the file. ${fixtures
        .filter((f) => !f.refused)
        .map((f) => path.basename(f.file))
        .join(
          ', ',
        )} must each show "Protocol installed successfully"; ${fixtures
        .filter((f) => f.refused)
        .map((f) => path.basename(f.file))
        .join(
          ', ',
        )} must be refused with an error explaining the schema version is not compatible (dismiss it). Then run this walker with --platform ios --phase verify-imports --artifacts <a new dir>.`,
    );
    return;
  }
  for (const f of fixtures) {
    const before = (await state())?.protocols.length ?? 0;
    if (f.refused) {
      await check(
        `schema ${f.schemaVersion} protocol is refused with an explanation`,
        async () => {
          await p.importFile(f);
          await waitFor(
            driver,
            `(text) => __rt.errors().some((e) => e.includes(text))`,
            {
              timeout: 60_000,
              label: 'refusal explained',
              arg: f.refused,
            },
          );
          // Dismiss the error dialog so the run can continue.
          await driver.eval(
            `(() => { const b = [...document.querySelectorAll('.dialog button')].filter(__rt.visible).pop(); if (b) __rt.click(b); return true; })()`,
          );
          const after = (await state())?.protocols.length ?? 0;
          return {
            ok: after === before,
            note:
              after === before
                ? undefined
                : 'the refused protocol was installed anyway',
          };
        },
      );
      continue;
    }
    await check(
      `import schema ${f.schemaVersion} protocol from file`,
      async () => {
        await p.importFile(f);
        await waitOrError(
          `document.body.textContent.includes('Protocol installed successfully')`,
          {
            timeout: 60_000,
            label: 'install success toast',
          },
        );
        const s = await waitFor(
          driver,
          `(async () => { const s = await ${STATE}; return s && s.protocols.length > ${before} ? s : null; })()`,
          {
            label: 'protocol persisted',
          },
        );
        const added =
          s.protocols.find((x) => x.name === f.name) ?? s.protocols.at(-1);
        return `installed as ${added.name}`;
      },
    );
    // Let the success toast clear so the next import's toast is its own.
    await waitFor(
      driver,
      `!document.body.textContent.includes('Protocol installed successfully')`,
      {
        timeout: 20_000,
      },
    ).catch(() => {});
  }
}

// --- main -------------------------------------------------------------------

let platformHandle;
try {
  const factory = {
    desktop: desktopPlatform,
    android: androidPlatform,
    ios: iosPlatform,
  }[platform];
  if (!factory) throw new SetupError(`unknown --platform ${platform}`);
  platformHandle = await factory();
  run.onCleanup(() => platformHandle.close());
  if (args.phase === 'verify-imports') {
    await importProtocols(platformHandle, run.step, null, () =>
      platformHandle.driver.eval(STATE),
    );
  } else {
    await journey(platformHandle);
  }
} catch (error) {
  await platformHandle?.close();
  if (error instanceof SetupError) run.setupFailure(error.message);
  run.record(
    'walker',
    false,
    error instanceof Error ? error.stack : String(error),
  );
  run.finish();
}
await platformHandle?.close();
run.finish();
