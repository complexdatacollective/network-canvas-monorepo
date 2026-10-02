// Shared harness for the classic apps' release tests
// (/architect-classic-release-test and /interviewer-classic-release-test).
//
// The walkers drive locally built release candidates — packaged Electron apps,
// and Interviewer's Capacitor builds in the iOS simulator and Android
// emulator — through their core journeys and write a structured result. This
// module holds what they share: result recording, packaged-app discovery,
// Electron launch with stubbed native dialogs, the in-page driving helpers
// (identical on every platform, so one journey definition runs everywhere),
// and the pure oracles over exports and version stamps.
//
// Result contract (same as the deployed-app walkers): every run writes
// <artifacts>/result.json and prints it as the final stdout line. Exit 0 = all
// checks passed; 1 = a check failed; 2 = watchdog timeout (a hang, not a
// verdict); 3 = harness setup error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

// --- result recording -------------------------------------------------------

export class SetupError extends Error {}

export function createRun({ artifactsDir, meta, timeoutMs }) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const result = {
    ok: false,
    ...meta,
    startedAt: new Date().toISOString(),
    steps: [],
    failures: [],
    manual: [],
    notes: [],
  };
  let finished = false;

  const finish = (code) => {
    if (finished) return;
    finished = true;
    result.ok = code === 0;
    result.exitCode = code;
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      path.join(artifactsDir, 'result.json'),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    process.exit(code);
  };

  // Platform teardown (closing the app, the inspector proxy) registered by
  // the walker; a watchdog exit runs it too, so a hung run does not leave a
  // process holding a port for the rerun.
  const cleanups = [];
  // Once the watchdog fires, the run's verdict is "timed out" (exit 2) however
  // it ends: the walk itself may fail first as the cleanup tears the app down.
  let timedOut = false;
  const watchdog = setTimeout(async () => {
    timedOut = true;
    result.failures.push(`watchdog: run exceeded ${timeoutMs}ms`);
    await Promise.race([
      Promise.allSettled(cleanups.map((fn) => fn())),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);
    finish(2);
  }, timeoutMs);
  watchdog.unref();

  const record = (step, ok, note) => {
    result.steps.push({ step, ok, ...(note ? { note } : {}) });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${note ? ` :: ${note}` : ''}`);
    if (!ok) result.failures.push(`${step}: ${note ?? 'failed'}`);
    return ok;
  };

  return {
    result,
    record,
    onCleanup(fn) {
      cleanups.push(fn);
    },
    note(text) {
      result.notes.push(text);
      console.log(`NOTE ${text}`);
    },
    // A check this harness cannot perform on this platform; the skill hands it
    // to the agent driving the run, which must report it before a verdict.
    manual(step, instructions) {
      result.manual.push({ step, instructions });
      console.log(`MANUAL ${step} :: ${instructions}`);
    },
    // Records a step from an async body. The body returns nothing (pass), a
    // string (pass with a note) or { ok, note }; a thrown error is a failure
    // whose message is the note. Returns the body's value, or undefined when
    // it threw, so callers can skip dependent steps.
    async step(name, body) {
      try {
        const value = await body();
        const ok =
          value && typeof value === 'object' ? value.ok !== false : true;
        const note = typeof value === 'string' ? value : value?.note;
        record(name, ok, note);
        return ok ? (value ?? true) : undefined;
      } catch (error) {
        record(
          name,
          false,
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
    },
    finish: () => {
      if (timedOut) finish(2);
      else finish(result.failures.length === 0 ? 0 : 1);
    },
    setupFailure(message) {
      result.failures.push(`setup: ${message}`);
      console.log(`SETUP ${message}`);
      finish(3);
    },
  };
}

// --- packaged-app discovery -------------------------------------------------

// The packaged Electron binary electron-builder --dir produced for this host.
// mac: release-builds/mac[-arm64]/<Product>.app/Contents/MacOS/<exe>
// linux: release-builds/linux[-arm64]-unpacked/<exe>
export function findPackagedBinary(appDir) {
  const root = path.join(appDir, 'release-builds');
  if (!fs.existsSync(root)) {
    throw new SetupError(`no release-builds/ under ${appDir} — build first`);
  }
  const dirs = fs.readdirSync(root);
  const archSuffix = process.arch === 'arm64' ? '-arm64' : '';
  if (process.platform === 'darwin') {
    const dir = [`mac${archSuffix}`, 'mac', 'mac-universal'].find((d) =>
      dirs.includes(d),
    );
    const appBundle =
      dir &&
      fs.readdirSync(path.join(root, dir)).find((f) => f.endsWith('.app'));
    if (!appBundle) {
      throw new SetupError(`no host-runnable .app under ${root}`);
    }
    const macosDir = path.join(root, dir, appBundle, 'Contents', 'MacOS');
    const [exe] = fs.readdirSync(macosDir);
    return path.join(macosDir, exe);
  }
  if (process.platform === 'linux') {
    const dir = [`linux${archSuffix}-unpacked`, 'linux-unpacked'].find((d) =>
      dirs.includes(d),
    );
    if (!dir) {
      throw new SetupError(`no host-runnable linux build under ${root}`);
    }
    const full = path.join(root, dir);
    const exe = fs.readdirSync(full).find((f) => {
      if (['chrome-sandbox', 'chrome_crashpad_handler'].includes(f)) {
        return false;
      }
      const stat = fs.statSync(path.join(full, f));
      return !f.includes('.') && stat.isFile() && (stat.mode & 0o111) !== 0;
    });
    if (!exe) throw new SetupError(`no executable in ${full}`);
    return path.join(full, exe);
  }
  throw new SetupError(`unsupported host platform ${process.platform}`);
}

export function readAppVersion(appDir) {
  return JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
    .version;
}

// --- Electron ---------------------------------------------------------------

// Launches a packaged Electron app in a throwaway profile and replaces its
// native dialogs with queues the walker fills: a native panel would block an
// unattended run, and both apps open and save every file through
// dialog.showOpenDialog / showSaveDialog in the main process. showMessageBox
// answers with the queued response (default 0) and is logged, so a walker can
// assert which confirmations the app raised; showErrorBox is logged too.
export async function launchElectron({ executablePath, userDataDir }) {
  const { _electron } = await import('playwright');
  const app = await _electron.launch({
    executablePath,
    // A window behind others is "occluded" to Chromium, which then throttles
    // its animation frames: exit transitions never finish, and closed screens
    // linger over the ones beneath. The run must not depend on window focus.
    args: [
      `--user-data-dir=${userDataDir}`,
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
    timeout: 60_000,
  });
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const unthrottle = (w) => w.webContents.setBackgroundThrottling(false);
    BrowserWindow.getAllWindows().forEach(unthrottle);
    electronApp.on('browser-window-created', (_, w) => unthrottle(w));
  });
  await app.evaluate(({ dialog }) => {
    const queues = { open: [], save: [], message: [] };
    const log = [];
    globalThis.__rtDialogs = { queues, log };
    // Each dialog function takes an optional BrowserWindow before options.
    const optionsOf = (args) => args[args.length - 1] ?? {};
    dialog.showOpenDialog = async (...args) => {
      const filePath = queues.open.shift();
      log.push({
        kind: 'open',
        title: optionsOf(args).title ?? null,
        filePath,
      });
      return filePath
        ? { canceled: false, filePaths: [filePath] }
        : { canceled: true, filePaths: [] };
    };
    dialog.showSaveDialog = async (...args) => {
      const options = optionsOf(args);
      const filePath = queues.save.shift();
      log.push({
        kind: 'save',
        title: options.title ?? null,
        defaultPath: options.defaultPath ?? null,
        filePath,
      });
      return filePath ? { canceled: false, filePath } : { canceled: true };
    };
    dialog.showMessageBox = async (...args) => {
      const options = optionsOf(args);
      const response = queues.message.length ? queues.message.shift() : 0;
      log.push({
        kind: 'message',
        message: options.message ?? null,
        detail: options.detail ?? null,
        buttons: options.buttons ?? null,
        response,
      });
      return { response, checkboxChecked: false };
    };
    dialog.showErrorBox = (title, content) => {
      log.push({ kind: 'error', message: title, detail: content });
    };
  });
  return app;
}

// The app's visible main window. Architect also creates hidden windows (the
// Interviewer preview), so app.firstWindow() is not reliably the one a user
// sees.
export async function mainWindow(app, { timeout = 60_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      const handle = await app.browserWindow(page).catch(() => null);
      const visible = await handle
        ?.evaluate((w) => w.isVisible())
        .catch(() => false);
      if (visible) return page;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new SetupError('no visible app window');
}

// Quitting can raise an unsaved-changes prompt that keeps the app alive, so a
// close that does not finish promptly falls back to killing the process.
export async function closeElectron(app) {
  const closed = await Promise.race([
    app.close().then(
      () => true,
      () => false,
    ),
    new Promise((r) => setTimeout(() => r(false), 10_000)),
  ]);
  if (!closed) app.process().kill('SIGKILL');
}

export const queueDialog = (app, kind, value) =>
  app.evaluate(
    (_, [k, v]) => globalThis.__rtDialogs.queues[k].push(v),
    [kind, value],
  );

export const dialogLog = (app) =>
  app.evaluate(() => globalThis.__rtDialogs.log.slice());

// Collects uncaught renderer exceptions from every window the app opens.
// Console errors are not collected: both apps log expected errors (missing
// optional assets, devtools extensions) that are not release defects.
// "index.html#/summary", "session/<id>/6": enough to tell the windows apart.
const windowLabel = (url) => {
  const [file, hash] = url.split('#');
  return `${file.split('/').pop()}${hash ? `#${hash}` : ''}`;
};

export function trackPageErrors(app) {
  const errors = [];
  const watch = (page) =>
    page.on('pageerror', (error) =>
      errors.push(`${windowLabel(page.url())}: ${error.message}`),
    );
  app.windows().forEach(watch);
  app.on('window', watch);
  return errors;
}

// --- in-page driving --------------------------------------------------------

// Installed into every page the walkers drive (Electron renderer, Android
// WebView, iOS WKWebView). Interactions are synthesised DOM events rather than
// OS input so that one journey definition runs on all three platforms: the iOS
// simulator exposes no input API to scripts. The apps' drag handling
// (DragManager) listens to mousedown on the element and mousemove/mouseup on
// window, which synthetic events satisfy; React inputs need the native value
// setter plus an input event, and a React state update lands a tick after the
// event, so typeInto waits before the caller submits. Nothing scrolls an
// element into view first: the sociogram measures its canvas before a drag,
// and a scroll in between moves the drop point. For the same reason inputs are
// focused with preventScroll: focusing a form field scrolls its container, and
// the interview shell stays scrolled for every later stage.
export const PAGE_HELPERS = String.raw`
(() => {
  if (window.__rt) return;
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  // Labels are compared without whitespace: the apps split labels across
  // spans ("Import" / "From File"), so textContent loses the visible space.
  const squash = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  // The innermost visible element whose text matches — the label a user aims
  // at. Case-insensitive because the apps uppercase labels with CSS.
  const byText = (text, root = document) => {
    const want = squash(text);
    const matches = [...root.querySelectorAll('*')].filter(
      (el) => squash(el.textContent) === want && visible(el),
    );
    const innermost = matches.filter((el) => ![...el.children].some((c) => squash(c.textContent) === want));
    // Prefer what a user could click: closing screens stay mounted (and their
    // controls visible) while they fade out behind the one on top.
    return innermost.find((el) => hittable(el)) || innermost.find((el) => opaque(el)) || innermost[0] || null;
  };
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const mouse = (type, x, y, target) =>
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
      button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1,
    }));
  // A real mousedown moves focus: off the focused field and onto the target
  // (or the body). el.click() alone leaves focus where it was, and a focused
  // input that animates away keeps scrolling its container after it.
  const click = (el) => {
    if (!el) throw new Error('click: element not found');
    const active = document.activeElement;
    if (active && active !== document.body && !el.contains(active)) active.blur();
    el.click();
    return true;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const setValue = (el, value) => {
    if (!el) throw new Error('setValue: element not found');
    el.focus({ preventScroll: true });
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const typeInto = async (el, value) => {
    setValue(el, value);
    await sleep(150);
    return true;
  };
  const drag = async (el, toX, toY) => {
    if (!el) throw new Error('drag: element not found');
    const { x, y } = center(el);
    mouse('mousedown', x, y, el);
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      await frame();
      mouse('mousemove', x + ((toX - x) * i) / steps, y + ((toY - y) * i) / steps, window);
    }
    await sleep(60);
    mouse('mouseup', toX, toY, window);
    return true;
  };
  // Visible error surfaces: error toasts, modal dialogs and error boundaries.
  const errors = () =>
    [...document.querySelectorAll('.toast--error, .dialog, .modal, [class*="error-boundary"], [class*="stage-error"]')]
      .filter((el) => visible(el) && (!el.matches('.modal') || /something went wrong/i.test(el.textContent)))
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 400));
  // Fully faded in: screens animate from opacity 0 and ignore clicks until
  // their opening transition finishes, as a user would never click them.
  const opaque = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      if (Number(getComputedStyle(e).opacity) < 1) return false;
    }
    return Boolean(el);
  };
  // The element a click at its centre would reach — the real test of "the
  // user can click this" when screens stack.
  const hittable = (el) => {
    if (!visible(el)) return false;
    const { x, y } = center(el);
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit) && (hit === el || el.contains(hit) || hit.contains(el));
  };
  // The stacked screen a user sees: the one under the middle of the window.
  const topScreen = (selector = '.screen') =>
    document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(selector) ?? null;
  // Not moving or fading: the element's box and effective opacity are the
  // same across two frames. Screens ignore clicks while they transition.
  const settled = async (el) => {
    if (!el) return false;
    const snap = () => {
      const r = el.getBoundingClientRect();
      let o = 1;
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        o *= Number(getComputedStyle(e).opacity);
      }
      return [r.x, r.y, r.width, r.height, o].join(',');
    };
    const before = snap();
    await frame();
    await frame();
    await sleep(50);
    return before === snap();
  };
  window.__rt = { settled, hittable, topScreen, opaque, visible, byText, click, setValue, typeInto, drag, sleep, frame, errors, norm, center };
})();
`;

// Wraps a Playwright Page (Electron renderer, Android WebView) in the
// platform-neutral driver the journeys use. eval(expression) runs a string
// expression in the page, awaiting a returned promise, with __rt installed.
// eval(fn, arg) runs the function source `fn` with `arg` passed as data: values
// from the run (names, case IDs, text read back from the page) never become
// part of the evaluated code.
export function playwrightDriver(page, { artifactsDir }) {
  return {
    async eval(expression, arg) {
      await page.evaluate(PAGE_HELPERS);
      if (arg === undefined) return page.evaluate(expression);
      const fn = await page.evaluateHandle(`(${expression})`);
      try {
        return await fn.evaluate((f, value) => f(value), arg);
      } finally {
        await fn.dispose();
      }
    },
    async screenshot(name) {
      await page
        .screenshot({ path: path.join(artifactsDir, `${name}.png`) })
        .catch(() => {});
    },
  };
}

// Polls a page expression (or function, with options.arg) until it returns a
// truthy value, which it returns.
export async function waitFor(
  driver,
  expression,
  { timeout = 15_000, interval = 250, label = 'condition', arg } = {},
) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await driver.eval(expression, arg);
      if (last) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  const detail =
    last === undefined || last === false || last === null
      ? ''
      : ` (last: ${JSON.stringify(last).slice(0, 300)})`;
  throw new Error(`${label} not met within ${timeout}ms${detail}`);
}

// --- oracles ----------------------------------------------------------------

// Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, CRLF) returning
// one object per data row keyed by the header row.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows.filter((r) => r.some((f) => f !== ''));
  return body.map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])),
  );
}

// Checks an Interviewer export zip against the session the walker conducted.
// Returns one { check, ok, note } per expectation so every miss is reported,
// not just the first.
export async function inspectInterviewerExport(zipBuffer, expected) {
  const checks = [];
  const add = (check, ok, note) =>
    checks.push({ check, ok: Boolean(ok), ...(note ? { note } : {}) });
  let zip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (error) {
    add('export is a readable zip', false, String(error));
    return checks;
  }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const listing = `files: ${names.join(', ') || 'none'}`;
  const find = (suffix) =>
    names.find(
      (n) => n.startsWith(`${expected.caseId}_`) && n.endsWith(suffix),
    );
  const read = (name) => zip.file(name).async('string');

  const graphml = find('.graphml');
  add('export contains the session graphml', graphml, graphml ?? listing);
  if (graphml) {
    let doc;
    try {
      doc = new JSDOM(await read(graphml), { contentType: 'text/xml' }).window
        .document;
    } catch (error) {
      add('graphml parses as XML', false, String(error).slice(0, 200));
    }
    if (doc) {
      const graph = doc.querySelector('graphml > graph');
      add('graphml has a graph element', graph);
      // Node labels by GraphML id, from each node's <data key="label">.
      const labelOf = new Map(
        [...(graph?.querySelectorAll(':scope > node') ?? [])].map((n) => [
          n.getAttribute('id'),
          n.querySelector(':scope > data[key="label"]')?.textContent ?? '',
        ]),
      );
      const graphLabels = [...labelOf.values()].sort((a, b) =>
        a.localeCompare(b),
      );
      add(
        'graphml nodes are the ones created',
        JSON.stringify(graphLabels) ===
          JSON.stringify(
            [...expected.nodeNames].sort((a, b) => a.localeCompare(b)),
          ),
        `got ${graphLabels.join(', ') || 'none'}`,
      );
      if (expected.edgeBetween) {
        const pairs = [...(graph?.querySelectorAll(':scope > edge') ?? [])].map(
          (e) =>
            [
              labelOf.get(e.getAttribute('source')),
              labelOf.get(e.getAttribute('target')),
            ]
              .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
              .join('–'),
        );
        const want = [...expected.edgeBetween]
          .sort((a, b) => a.localeCompare(b))
          .join('–');
        add(
          `graphml has the ${want} edge`,
          pairs.length === expected.edgeCount && pairs.includes(want),
          `got ${pairs.join(', ') || 'no edges'}`,
        );
      }
    }
  }

  const egoFile = find('_ego.csv');
  add('export contains the ego csv', egoFile, egoFile ?? listing);
  if (egoFile) {
    const [ego] = parseCsv(await read(egoFile));
    add('ego csv has a row for the session', ego);
    if (ego) {
      add(
        'ego case ID matches',
        ego.networkCanvasCaseID === expected.caseId,
        ego.networkCanvasCaseID,
      );
      add(
        'APP_VERSION is the build under test',
        ego.APP_VERSION === expected.appVersion,
        `APP_VERSION=${JSON.stringify(ego.APP_VERSION)}, expected ${expected.appVersion}`,
      );
      add('sessionFinish is recorded', ego.sessionFinish, ego.sessionFinish);
      add(
        'sessionExported is recorded',
        ego.sessionExported,
        ego.sessionExported,
      );
    }
  }

  const nodeFile = find(`_attributeList_${expected.nodeType}.csv`);
  add(
    `export contains the ${expected.nodeType} attribute list`,
    nodeFile,
    nodeFile ?? listing,
  );
  let nodes = [];
  if (nodeFile) {
    nodes = parseCsv(await read(nodeFile));
    const labels = nodes.map((n) => n.name).sort((a, b) => a.localeCompare(b));
    add(
      'exported nodes are the ones created',
      JSON.stringify(labels) ===
        JSON.stringify(
          [...expected.nodeNames].sort((a, b) => a.localeCompare(b)),
        ),
      `got ${labels.join(', ') || 'none'}`,
    );
    if (expected.layoutVariable) {
      // Both coordinates: the exporter writes <variable>_x and <variable>_y.
      const unplaced = nodes
        .filter((n) =>
          ['x', 'y'].some(
            (axis) =>
              !Number.isFinite(
                Number.parseFloat(n[`${expected.layoutVariable}_${axis}`]),
              ),
          ),
        )
        .map((n) => n.name);
      add(
        'every node has a sociogram position',
        unplaced.length === 0,
        unplaced.length ? `unplaced: ${unplaced.join(', ')}` : undefined,
      );
    }
  }

  if (expected.edgeType) {
    const edgeFile = find(`_edgeList_${expected.edgeType}.csv`);
    const edges = edgeFile ? parseCsv(await read(edgeFile)) : [];
    add(
      `export contains ${expected.edgeCount} ${expected.edgeType} edge(s)`,
      edges.length === expected.edgeCount,
      edgeFile ? `got ${edges.length}` : `no edge list; ${listing}`,
    );
    if (expected.edgeBetween && edgeFile) {
      // from/to are the node list's nodeIDs.
      const nameOf = new Map(nodes.map((n) => [n.nodeID, n.name]));
      const pairs = edges.map((e) =>
        [nameOf.get(e.from), nameOf.get(e.to)]
          .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
          .join('–'),
      );
      const want = [...expected.edgeBetween]
        .sort((a, b) => a.localeCompare(b))
        .join('–');
      add(
        `the ${expected.edgeType} edge connects ${want}`,
        pairs.includes(want),
        `got ${pairs.join(', ') || 'none'}`,
      );
    }
  }
  return checks;
}

// Interviewer's native projects carry their own version stamps
// (android/app/build.gradle versionName, the iOS project's MARKETING_VERSION)
// that `pnpm version:sync` copies from package.json. A release that skips it
// ships the previous version number to the stores.
export function parseGradleVersionName(gradle) {
  return gradle.match(/versionName\s+["']([^"']+)["']/)?.[1] ?? null;
}

export function parsePbxMarketingVersions(pbxproj) {
  return [
    ...new Set(
      [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) =>
        m[1].trim(),
      ),
    ),
  ];
}

export function checkNativeVersions(appDir, version) {
  const checks = [];
  const gradlePath = path.join(appDir, 'android/app/build.gradle');
  if (fs.existsSync(gradlePath)) {
    const name = parseGradleVersionName(fs.readFileSync(gradlePath, 'utf8'));
    checks.push({
      check: 'Android versionName matches package.json',
      ok: name === version,
      note: `versionName=${name}, package.json=${version}`,
    });
  }
  const pbxPath = path.join(appDir, 'ios/App/App.xcodeproj/project.pbxproj');
  if (fs.existsSync(pbxPath)) {
    const versions = parsePbxMarketingVersions(
      fs.readFileSync(pbxPath, 'utf8'),
    );
    checks.push({
      check: 'iOS MARKETING_VERSION matches package.json',
      ok: versions.length > 0 && versions.every((v) => v === version),
      note: `MARKETING_VERSION=${versions.join('/') || 'none'}, package.json=${version}`,
    });
  }
  return checks;
}
