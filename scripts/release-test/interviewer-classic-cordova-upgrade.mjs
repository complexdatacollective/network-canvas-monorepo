#!/usr/bin/env node
// Upgrade test for Interviewer Classic's mobile builds: does an in-place
// upgrade from the last Cordova release (6.5.x) keep the researcher's
// protocols and interviews?
//
// The Cordova builds persisted the redux store in a cordova-sqlite-storage
// database and kept protocol files in cordova.file.dataDirectory; the Capacitor
// builds use IndexedDB and Directory.Data, and before the migration in
// src/utils/legacyCordovaMigration.js an upgrade found an empty app.
//
// One run, on the iOS simulator or the Android emulator:
//   1. install the Cordova build fresh (--legacy-app-path), install the sample
//      protocol and start an interview whose ego form holds known names;
//      read the Cordova store straight from its SQLite file as the baseline;
//   2. optionally (--via-app-path) upgrade to an intermediate Capacitor build
//      first, as researchers who installed 6.6.2 did, and start an interview
//      there too;
//   3. upgrade in place to --app-path (no uninstall, data kept) and check the
//      new build's IndexedDB store, the migration flag, the protocol files'
//      location, the start screen and a resumed interview, then relaunch and
//      check the migration does not run again.
//
// Against 6.6.2 (no migration) step 3 fails: that is the reproduction.
//
// Usage (from the repo root, a simulator booted or an emulator running):
//   node scripts/release-test/interviewer-classic-cordova-upgrade.mjs \
//     --platform ios|android --artifacts <dir> \
//     --legacy-app-path <Cordova App.app | debug APK> \
//     --app-path <Capacitor App.app | debug APK> \
//     [--via-app-path <intermediate App.app | APK>] [--device <udid|serial>]
//
// Result contract as the other classic walkers: <artifacts>/result.json,
// exit 0 pass, 1 a check failed, 2 watchdog, 3 setup error.
import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import {
  attachIosWebKit,
  createRun,
  playwrightDriver,
  SetupError,
  waitFor,
} from './classic-release-lib.mjs';

const execFile = promisify(execFileCb);

const { values: args } = parseArgs({
  options: {
    'platform': { type: 'string' },
    'artifacts': { type: 'string' },
    'legacy-app-path': { type: 'string' },
    'via-app-path': { type: 'string' },
    'app-path': { type: 'string' },
    'device': { type: 'string' },
    'timeout-ms': { type: 'string', default: '900000' },
  },
});

if (!args.artifacts) {
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
const artifactsDir = path.resolve(args.artifacts);
const platform = args.platform;

const run = createRun({
  artifactsDir,
  timeoutMs: Number(args['timeout-ms']),
  meta: {
    app: 'interviewer-classic',
    test: 'cordova-upgrade',
    platform,
    legacyAppPath: args['legacy-app-path'],
    viaAppPath: args['via-app-path'] ?? null,
    appPath: args['app-path'],
  },
});

const PERSIST_KEY = 'persist:networkCanvas6';
const FLAG_KEY = 'legacyCordovaMigration';
const SAMPLE = {
  name: 'Sample Protocol v4',
  firstStageText: 'Welcome to the Sample Protocol',
  consentStage: 3,
  egoFormStage: 4,
};
const LEGACY_CASE = {
  caseId: 'cordova-upgrade',
  names: ['Cordova', 'Legacy'],
};
const VIA_CASE = { caseId: 'after-upgrade', names: ['Capacitor', 'Interim'] };

// --- persisted state --------------------------------------------------------

// redux-persist writes one JSON string whose values are each slice as a JSON
// string.
const parsePersisted = (raw) =>
  raw
    ? Object.fromEntries(
        Object.entries(JSON.parse(raw)).map(([key, value]) => [
          key,
          JSON.parse(value),
        ]),
      )
    : null;

const summarise = (slices) => ({
  protocols: Object.entries(slices?.installedProtocols ?? {}).map(
    ([uid, protocol]) => ({ uid, name: protocol.name }),
  ),
  sessions: Object.entries(slices?.sessions ?? {}).map(([id, session]) => ({
    id,
    caseId: session.caseId,
    protocolUID: session.protocolUID,
    ego: JSON.stringify(session.network?.ego?.attributes ?? {}),
  })),
});

const sqliteValue = async (databaseFile) => {
  const { stdout } = await execFile(
    'sqlite3',
    [
      '-readonly',
      databaseFile,
      `SELECT value FROM redux_store WHERE key = '${PERSIST_KEY}'`,
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return stdout.trim() || null;
};

// The Capacitor build's store and the migration flag, read in the web view.
const NEW_STORE = `(async () => {
  const read = (key) => new Promise((resolve) => {
    const open = indexedDB.open('networkCanvas6');
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('redux_store')) { db.close(); resolve(null); return; }
      const req = db.transaction('redux_store').objectStore('redux_store').get(key);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    };
  });
  return { raw: await read('${PERSIST_KEY}'), flag: await read('${FLAG_KEY}') };
})()`;

// --- platforms --------------------------------------------------------------

const bundleIdOf = async (appPath) =>
  (
    await execFile('plutil', [
      '-extract',
      'CFBundleIdentifier',
      'raw',
      path.join(appPath, 'Info.plist'),
    ])
  ).stdout.trim();

async function iosPlatform() {
  const simctl = async (...a) =>
    (await execFile('xcrun', ['simctl', ...a], { maxBuffer: 64 * 1024 * 1024 }))
      .stdout;
  const booted = JSON.parse(await simctl('list', 'devices', 'booted', '-j'));
  const udid = args.device ?? Object.values(booted.devices).flat()[0]?.udid;
  if (!udid)
    throw new SetupError('no booted iOS simulator (xcrun simctl boot <udid>)');

  const bundleId = await bundleIdOf(path.resolve(args['legacy-app-path']));
  for (const appPath of [args['via-app-path'], args['app-path']]) {
    if (appPath && (await bundleIdOf(path.resolve(appPath))) !== bundleId) {
      throw new SetupError(
        `${appPath} is not the same app as the Cordova build (${bundleId}), so installing it is not an upgrade`,
      );
    }
  }

  let webkit;
  const container = async () =>
    (await simctl('get_app_container', udid, bundleId, 'data')).trim();
  const exists = async (relative) =>
    fs.existsSync(path.join(await container(), relative));

  return {
    describe: `iOS simulator ${udid}, ${bundleId}`,
    async install(appPath, { fresh }) {
      webkit?.close();
      webkit = undefined;
      await simctl('terminate', udid, bundleId).catch(() => {});
      if (fresh) await simctl('uninstall', udid, bundleId).catch(() => {});
      await simctl('install', udid, path.resolve(appPath));
    },
    async launch(urlPrefix) {
      webkit?.close();
      await simctl('terminate', udid, bundleId).catch(() => {});
      await simctl('launch', udid, bundleId);
      webkit = await attachIosWebKit(udid, urlPrefix);
      return {
        eval: (expression, arg) => webkit.evaluate(expression, arg),
        screenshot: (name) =>
          simctl(
            'io',
            udid,
            'screenshot',
            path.join(artifactsDir, `${name}.png`),
          ).catch(() => {}),
      };
    },
    legacyUrlPrefix: 'app://',
    newUrlPrefix: 'capacitor://',
    async legacyStore() {
      const file = path.join(
        await container(),
        'Library/LocalDatabase/redux-store-db',
      );
      return fs.existsSync(file) ? sqliteValue(file) : null;
    },
    legacyProtocolFile: (uid) =>
      exists(`Library/NoCloud/protocols/${uid}/protocol.json`),
    newProtocolFile: (uid) =>
      exists(`Documents/protocols/${uid}/protocol.json`),
    close: async () => webkit?.close(),
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
  const serial = device.serial();
  const pkg = 'org.codaco.NetworkCanvasInterviewer6';
  const shell = async (command) => (await device.shell(command)).toString();
  const runAs = (command) => shell(`run-as ${pkg} ${command}`);
  const adb = (...a) =>
    execFile('adb', ['-s', serial, ...a], { maxBuffer: 64 * 1024 * 1024 });
  const exists = async (relative) =>
    (await runAs(`ls ${relative}`).catch(() => '')).trim() === relative;

  let page;
  return {
    describe: `Android ${serial}, ${pkg}`,
    async install(apkPath, { fresh }) {
      await shell(`am force-stop ${pkg}`);
      if (fresh) await adb('uninstall', pkg).catch(() => {});
      // -r replaces the installed app and keeps its data: an upgrade.
      await adb('install', '-r', '-t', path.resolve(apkPath));
      if (!(await shell(`pm list packages ${pkg}`)).includes(pkg))
        throw new SetupError(`${apkPath} did not install as ${pkg}`);
    },
    async launch() {
      await shell(`am force-stop ${pkg}`);
      // Start whichever activity the installed build declares as its
      // launcher (`monkey` launches nothing on the emulator images used here).
      const activity = (
        await shell(`cmd package resolve-activity --brief ${pkg}`)
      )
        .trim()
        .split('\n')
        .at(-1);
      await shell(`am start -W -n ${activity}`);
      const webview = await device.webView({ pkg }, { timeout: 60_000 });
      page = await webview.page();
      const driver = playwrightDriver(page, { artifactsDir });
      driver.screenshot = async (name) => {
        const png = await device.screenshot().catch(() => null);
        if (png) fs.writeFileSync(path.join(artifactsDir, `${name}.png`), png);
      };
      return driver;
    },
    async legacyStore() {
      // The framework may keep recent writes in a -wal file beside the
      // database, so copy all three before reading.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-legacy-db-'));
      let copied = false;
      for (const suffix of ['', '-wal', '-shm']) {
        const name = `redux-store-db${suffix}`;
        if (!(await exists(`databases/${name}`))) continue;
        const { stdout } = await execFile(
          'adb',
          ['-s', serial, 'exec-out', 'run-as', pkg, 'cat', `databases/${name}`],
          { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
        );
        fs.writeFileSync(path.join(dir, name), stdout);
        copied ||= suffix === '';
      }
      return copied ? sqliteValue(path.join(dir, 'redux-store-db')) : null;
    },
    legacyProtocolFile: (uid) => exists(`files/protocols/${uid}/protocol.json`),
    newProtocolFile: (uid) => exists(`files/protocols/${uid}/protocol.json`),
    close: async () => {
      await device.close().catch(() => {});
    },
  };
}

// --- journeys ---------------------------------------------------------------

const stageIndex = `(() => { const m = location.hash.match(/\\/session\\/[^/]+\\/(\\d+)/); return m ? Number(m[1]) : null; })()`;
// Leaves an interview through the stage menu's Exit Interview item, as a user
// would: the Cordova build restores the session route over a changed URL.
const toStartScreen = async (driver) => {
  if (await driver.eval(`location.hash.startsWith('#/session')`)) {
    await driver.eval(
      `__rt.click(document.querySelector('.session-navigation__button--menu'))`,
    );
    await waitFor(
      driver,
      `(() => { const item = document.querySelector('.sub-menu__exit .item'); return item ? __rt.click(item) : false; })()`,
      { label: 'Exit Interview in the stage menu' },
    );
  }
  await waitFor(driver, `Boolean(__rt.byText('Install sample protocol'))`, {
    timeout: 30_000,
    label: 'start screen',
  });
};

// Installs the sample protocol, starts an interview with `caseId` and fills
// the ego form's two text fields with `names`, then returns to the start
// screen. Works on the Cordova and Capacitor builds alike.
async function createInterview(driver, { caseId, names }) {
  await waitFor(driver, `Boolean(__rt.byText('Install sample protocol'))`, {
    timeout: 90_000,
    label: 'start screen',
  });
  await driver.eval(`__rt.click(__rt.byText('Install sample protocol'))`);
  // The Cordova Android build unzips the protocol one file-plugin write at a
  // time; on an emulator that alone can take several minutes.
  await waitFor(
    driver,
    `document.body.textContent.includes('Protocol installed successfully')`,
    { timeout: 360_000, interval: 1_000, label: 'sample protocol installed' },
  );
  // The new protocol's card is the last one.
  await driver.eval(
    `__rt.click([...document.querySelectorAll('.protocol-card--clickable')].at(-1))`,
  );
  await waitFor(
    driver,
    `Boolean(document.querySelector('input[name=case_id]'))`,
    {
      label: 'case ID prompt',
    },
  );
  await driver.eval(
    `(id) => __rt.typeInto(document.querySelector('input[name=case_id]'), id)`,
    caseId,
  );
  await driver.eval(`__rt.click(__rt.byText('Start interview'))`);
  await waitFor(
    driver,
    `(text) => document.querySelector('.stage')?.textContent.includes(text)`,
    { timeout: 30_000, label: 'first stage', arg: SAMPLE.firstStageText },
  );
  const signature = `location.hash + '|' + (document.querySelector('.stage')?.textContent.slice(0, 300) ?? '')`;
  const advanceTo = async (target) => {
    for (let clicks = 0; clicks < 30; clicks += 1) {
      if ((await driver.eval(stageIndex)) >= target) return;
      const before = await driver.eval(signature);
      await driver.eval(
        `__rt.click(document.querySelector('.session-navigation__button--next'))`,
      );
      await waitFor(driver, `(before) => (${signature}) !== before`, {
        timeout: 6_000,
        label: 'stage change',
        arg: before,
      });
      await new Promise((r) => setTimeout(r, 600));
    }
    throw new Error(`did not reach stage ${target}`);
  };
  await advanceTo(SAMPLE.consentStage);
  await driver.eval(
    `__rt.click(document.querySelector('.boolean-option:not(.boolean-option--negative)'))`,
  );
  await advanceTo(SAMPLE.egoFormStage);
  await driver.eval(
    `async (names) => { const t = [...document.querySelectorAll('.stage input[type=text]')]; await __rt.typeInto(t[0], names[0]); t[0].blur(); await __rt.typeInto(t[1], names[1]); t[1].blur(); return true; }`,
    names,
  );
  // Leaving the stage commits the form to the session.
  const before = await driver.eval(signature);
  await driver.eval(
    `__rt.click(document.querySelector('.session-navigation__button--next'))`,
  );
  await waitFor(driver, `(before) => (${signature}) !== before`, {
    timeout: 6_000,
    label: 'ego form submitted',
    arg: before,
  });
  await toStartScreen(driver);
}

const sessionHas = (session, { caseId, names }) =>
  session.caseId === caseId && names.every((n) => session.ego.includes(n));

async function main(p) {
  run.note(p.describe);
  const step = async (name, body, driver) => {
    const value = await run.step(name, body);
    if (value === undefined && driver)
      await driver.screenshot(`fail-${name.replace(/\W+/g, '-')}`);
    return value;
  };

  // 1. The Cordova build, with real data.
  await p.install(args['legacy-app-path'], { fresh: true });
  const legacyDriver = await p.launch(p.legacyUrlPrefix);
  const seeded = await step(
    'the Cordova build installs the sample protocol and records an interview',
    () => createInterview(legacyDriver, LEGACY_CASE),
    legacyDriver,
  );
  if (!seeded) return;

  let legacy;
  const baseline = await step(
    "the Cordova build's SQLite store holds the protocol and the interview",
    async () => {
      // The store is written after the action; give it a moment.
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        legacy = summarise(parsePersisted(await p.legacyStore()));
        if (legacy.sessions.some((s) => sessionHas(s, LEGACY_CASE))) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const files = await Promise.all(
        legacy.protocols.map((x) => p.legacyProtocolFile(x.uid)),
      );
      return {
        ok:
          legacy.protocols.some((x) => x.name === SAMPLE.name) &&
          legacy.sessions.some((s) => sessionHas(s, LEGACY_CASE)) &&
          files.every(Boolean),
        note: `${legacy.protocols.length} protocol(s), ${legacy.sessions.length} session(s), protocol files at the Cordova location: ${files.every(Boolean)}`,
      };
    },
  );
  if (!baseline) return;
  fs.writeFileSync(
    path.join(artifactsDir, 'legacy-store.json'),
    JSON.stringify(legacy, null, 2),
  );

  // 2. Optionally, an intermediate Capacitor build first.
  const expectedSessions = [LEGACY_CASE];
  if (args['via-app-path']) {
    await p.install(args['via-app-path'], { fresh: false });
    const viaDriver = await p.launch(p.newUrlPrefix);
    await step(
      'after upgrading to the intermediate build, a new interview can be recorded',
      async () => {
        const { raw } = await waitFor(
          viaDriver,
          `(${NEW_STORE}).then((s) => s.raw ? s : null)`,
          { timeout: 60_000, label: 'intermediate build store written' },
        );
        const before = summarise(parsePersisted(raw));
        await createInterview(viaDriver, VIA_CASE);
        // Replacing the app kills it, so wait for the interview to reach
        // IndexedDB rather than trusting the start screen.
        await waitFor(
          viaDriver,
          `async (expected) => { const { raw } = await ${NEW_STORE}; if (!raw) return false; const sessions = Object.values(JSON.parse(JSON.parse(raw).sessions ?? '{}')); return sessions.some((s) => s.caseId === expected.caseId && expected.names.every((n) => JSON.stringify(s.network?.ego?.attributes ?? {}).includes(n))); }`,
          {
            timeout: 30_000,
            label: 'intermediate interview persisted',
            arg: VIA_CASE,
          },
        );
        return `the intermediate build showed ${before.protocols.length} protocol(s) and ${before.sessions.length} session(s) on first launch`;
      },
      viaDriver,
    );
    expectedSessions.push(VIA_CASE);
  }

  // 3. The build under test, installed over the top.
  await p.install(args['app-path'], { fresh: false });
  let driver = await p.launch(p.newUrlPrefix);
  const store = await step(
    'the upgraded build boots and has written its store',
    async () => {
      await waitFor(driver, `Boolean(__rt.byText('Install sample protocol'))`, {
        timeout: 60_000,
        label: 'start screen',
      });
      return waitFor(driver, `(${NEW_STORE}).then((s) => s.raw ? s : null)`, {
        timeout: 30_000,
        label: 'store written',
      });
    },
    driver,
  );
  if (!store) return;
  const upgraded = summarise(parsePersisted(store.raw));
  fs.writeFileSync(
    path.join(artifactsDir, 'upgraded-store.json'),
    JSON.stringify({ ...upgraded, flag: store.flag }, null, 2),
  );

  await step('the migration flag is recorded in the new store', () => ({
    ok: store.flag?.outcome === 'migrated',
    note: JSON.stringify(store.flag),
  }));

  await step('every protocol from the Cordova build is still installed', () => {
    const missing = legacy.protocols.filter(
      (x) => !upgraded.protocols.some((y) => y.uid === x.uid),
    );
    return {
      ok: missing.length === 0,
      note: missing.length
        ? `missing: ${missing.map((x) => x.name).join(', ')}`
        : `${upgraded.protocols.length} protocol(s) installed`,
    };
  });

  await step('every interview is still there with its data', () => {
    const missing = expectedSessions.filter(
      (expected) => !upgraded.sessions.some((s) => sessionHas(s, expected)),
    );
    return {
      ok: missing.length === 0,
      note: missing.length
        ? `missing: ${missing.map((x) => x.caseId).join(', ')}`
        : `${upgraded.sessions.length} session(s)`,
    };
  });

  await step(
    "the Cordova build's protocol files are where the new build reads them",
    async () => {
      const results = await Promise.all(
        legacy.protocols.map(async (x) => [
          x.name,
          await p.newProtocolFile(x.uid),
        ]),
      );
      const missing = results.filter(([, ok]) => !ok).map(([name]) => name);
      return {
        ok: missing.length === 0,
        note: missing.length
          ? `no protocol.json for: ${missing.join(', ')}`
          : undefined,
      };
    },
  );

  const legacySession = legacy.sessions.find((s) => sessionHas(s, LEGACY_CASE));
  await step(
    'the Cordova interview resumes at its ego form with the names entered',
    async () => {
      await driver.eval(
        `(hash) => { location.hash = hash; return true; }`,
        `#/session/${legacySession.id}/${SAMPLE.egoFormStage}`,
      );
      await waitFor(
        driver,
        `(names) => { const v = [...document.querySelectorAll('.stage input[type=text]')].map((i) => i.value); return names.every((n) => v.includes(n)); }`,
        {
          timeout: 30_000,
          label: 'ego form with names',
          arg: LEGACY_CASE.names,
        },
      );
      await toStartScreen(driver);
    },
    driver,
  );

  await step(
    'after a relaunch the data is kept and the migration does not run again',
    async () => {
      driver = await p.launch(p.newUrlPrefix);
      await waitFor(driver, `Boolean(__rt.byText('Install sample protocol'))`, {
        timeout: 60_000,
        label: 'start screen',
      });
      const again = await driver.eval(NEW_STORE);
      const sessions = summarise(parsePersisted(again.raw)).sessions;
      return {
        ok:
          again.flag?.completedAt === store.flag?.completedAt &&
          expectedSessions.every((e) => sessions.some((s) => sessionHas(s, e))),
        note: `flag ${JSON.stringify(again.flag)}`,
      };
    },
    driver,
  );
}

let platformHandle;
try {
  for (const required of ['platform', 'legacy-app-path', 'app-path']) {
    if (!args[required]) throw new SetupError(`--${required} is required`);
  }
  const factory = { ios: iosPlatform, android: androidPlatform }[platform];
  if (!factory) throw new SetupError(`unknown --platform ${platform}`);
  platformHandle = await factory();
  run.onCleanup(() => platformHandle.close());
  await main(platformHandle);
} catch (error) {
  await platformHandle?.close();
  if (error instanceof SetupError) run.setupFailure(error.message);
  run.record(
    'upgrade test',
    false,
    error instanceof Error ? error.stack : String(error),
  );
  run.finish();
}
await platformHandle?.close();
run.finish();
