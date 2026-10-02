#!/usr/bin/env node
// Release-test walker for Architect Classic (/architect-classic-release-test).
//
// Drives the packaged Electron app (release-builds/) through the journeys a
// protocol author depends on, with the native open/save dialogs stubbed so the
// run is unattended:
//
//   download the sample protocol and open it; open the editor of every stage
//   in it; open a new-stage editor for every interface type; preview a stage
//   in the embedded Interviewer; open the codebook; rename a stage and save,
//   then read the change back from the saved file; render the printable
//   summary and save it as a PDF; upgrade a schema 6 protocol to an upgraded
//   copy; confirm a schema 8 protocol (what current Architect writes) is
//   refused with an explanation; create a new protocol.
//
// Every bug the 6.6.3 release smoke test found by hand fails a check here:
// "Buffer is not defined" when downloading the sample, "jsx is not defined"
// in the Sociogram stage editor (react-resize-aware 3.1.2+), and React 16 and
// 19 both bundled, which crashed the Information stage editor.
//
// Usage (from the repo root):
//   node scripts/release-test/architect-classic-release-walker.mjs \
//     --artifacts <dir> [--app-dir apps/architect-classic] \
//     [--binary <packaged electron binary>] [--expect-version <semver>] \
//     [--timeout-ms 900000]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import JSZip from 'jszip';

import {
  closeElectron,
  createRun,
  dialogLog,
  findPackagedBinary,
  launchElectron,
  mainWindow,
  playwrightDriver,
  queueDialog,
  readAppVersion,
  repoRoot,
  SetupError,
  trackPageErrors,
  waitFor,
} from './classic-release-lib.mjs';

const { values: args } = parseArgs({
  options: {
    'artifacts': { type: 'string' },
    'app-dir': { type: 'string', default: 'apps/architect-classic' },
    'binary': { type: 'string' },
    'expect-version': { type: 'string' },
    'timeout-ms': { type: 'string', default: '900000' },
  },
});

if (!args.artifacts) {
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
const artifactsDir = path.resolve(args.artifacts);
const appDir = path.resolve(repoRoot, args['app-dir']);
const expectedVersion = args['expect-version'] ?? readAppVersion(appDir);

const run = createRun({
  artifactsDir,
  timeoutMs: Number(args['timeout-ms']),
  meta: { app: 'architect-classic', platform: 'desktop', expectedVersion },
});

const files = path.join(artifactsDir, 'files');
fs.mkdirSync(files, { recursive: true });
const fixture = (source, name) => {
  const file = path.join(files, name);
  fs.copyFileSync(path.join(repoRoot, source), file);
  return file;
};
const SCHEMA_6 = fixture(
  'packages/protocols/documentation/protocols/Sample Protocol v3.netcanvas',
  'rt-schema6.netcanvas',
);
const SCHEMA_8 = fixture(
  'packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas',
  'rt-schema8.netcanvas',
);

const readProtocol = async (file) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  return JSON.parse(await zip.file('protocol.json').async('string'));
};

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

let app;
try {
  const binary = args.binary
    ? path.resolve(args.binary)
    : findPackagedBinary(appDir);
  run.note(`binary: ${binary}`);
  app = await launchElectron({
    executablePath: binary,
    userDataDir: fs.mkdtempSync(
      path.join(os.tmpdir(), 'architect-classic-rt-'),
    ),
  });
  const pageErrors = trackPageErrors(app);
  const page = await mainWindow(app);
  const driver = playwrightDriver(page, { artifactsDir });
  await walk(driver, page, pageErrors);
} catch (error) {
  if (app) await closeElectron(app);
  if (error instanceof SetupError) run.setupFailure(error.message);
  run.record(
    'walker',
    false,
    error instanceof Error ? error.stack : String(error),
  );
  run.finish();
}
await closeElectron(app);
run.finish();

async function walk(driver, page, pageErrors) {
  const check = async (name, body) => {
    const value = await run.step(name, body);
    if (value === undefined) await driver.screenshot(`fail-${slug(name)}`);
    return value;
  };
  const visibleErrors = () => driver.eval(`__rt.errors()`);
  // Dismisses whatever in-app dialog is open (error, confirmation, notice).
  const dismissDialogs = () =>
    driver.eval(
      `(async () => { for (let i = 0; i < 4; i += 1) { const b = [...document.querySelectorAll('.dialog button')].filter(__rt.visible).pop(); if (!b) return true; __rt.click(b); await __rt.sleep(400); } return true; })()`,
    );
  // Closes stacked screens from the top with their Cancel buttons. Closed
  // screens stay mounted while they fade out, so "open" means on top of the
  // window and "clickable" means hit-testable.
  const cancel = `[...document.querySelectorAll('button')].filter((x) => __rt.hittable(x) && __rt.opaque(x) && !x.closest('.dialog') && /^cancel$/i.test(x.textContent.trim())).pop()`;
  const closeScreens = async () => {
    for (let i = 0; i < 6; i += 1) {
      if (!(await driver.eval(`Boolean(__rt.topScreen())`))) return;
      const found = await waitFor(
        driver,
        `(async () => { const b = ${cancel}; return Boolean(b) && (await __rt.settled(b)); })()`,
        {
          timeout: 5_000,
          label: 'cancel button',
        },
      ).catch(() => false);
      if (!found) break;
      await driver.eval(`__rt.click(${cancel})`);
      await new Promise((r) => setTimeout(r, 800));
      await dismissDialogs();
    }
    if (await driver.eval(`Boolean(__rt.topScreen())`)) {
      const top = await driver.eval(
        `__rt.topScreen()?.textContent.trim().slice(0, 60)`,
      );
      const cancels = await driver.eval(
        `(async () => { const out = []; for (const b of [...document.querySelectorAll('button')].filter((x) => __rt.visible(x) && /^cancel$/i.test(x.textContent.trim()))) { const h = document.elementFromPoint(__rt.center(b).x, __rt.center(b).y); out.push({ hittable: __rt.hittable(b), opaque: __rt.opaque(b), settled: await __rt.settled(b), dialog: Boolean(b.closest('.dialog')), hit: h && (h.tagName + '.' + h.className.toString().slice(0, 40)) }); } return out; })()`,
      );
      throw new Error(
        `could not close the screen on top: ${top} ${JSON.stringify(cancels)}`,
      );
    }
  };
  const toStartScreen = async () => {
    await driver.eval(
      `(() => { const b = __rt.byText('Return to start screen'); if (b) __rt.click(b); return true; })()`,
    );
    await dismissDialogs();
    await waitFor(driver, `Boolean(__rt.byText('Download Sample Protocol'))`, {
      timeout: 15_000,
      label: 'start screen',
    });
  };
  const stageCount = `document.querySelectorAll('.timeline-stage').length`;
  // Waits for a protocol to open, failing fast on a visible error.
  const waitForProtocol = (minStages = 0) =>
    waitFor(
      driver,
      `(() => { const e = __rt.errors().filter((x) => !/^info/i.test(x)); if (e.length) return { error: e.join(' | ') }; return document.querySelector('.timeline') && ${stageCount} >= ${minStages} ? { ok: true } : null; })()`,
      { timeout: 45_000, label: 'protocol opened' },
    ).then((r) => {
      if (r.error) throw new Error(`app reported: ${r.error.slice(0, 600)}`);
    });

  const booted = await check('app boots to the start screen', async () => {
    await waitFor(driver, `Boolean(__rt.byText('Download Sample Protocol'))`, {
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

  let samplePath = path.join(files, 'rt-sample.netcanvas');
  let sample = await check(
    'download the sample protocol and open it',
    async () => {
      await queueDialog(app, 'save', samplePath);
      await driver.eval(`__rt.click(__rt.byText('Download Sample Protocol'))`);
      await waitForProtocol(1);
      const protocol = await readProtocol(samplePath);
      const shown = await driver.eval(stageCount);
      return {
        ok: protocol.schemaVersion === 7 && shown === protocol.stages.length,
        note: `schema ${protocol.schemaVersion}, ${protocol.stages.length} stages in the file, ${shown} on the timeline`,
      };
    },
  );

  // A failed download should not hide every later defect: open the same
  // sample from the repository instead and carry on.
  if (!sample) {
    await dismissDialogs();
    samplePath = fixture(
      'packages/protocols/documentation/protocols/Sample Protocol v4.netcanvas',
      'rt-sample-fixture.netcanvas',
    );
    sample = await check('open the sample protocol from a file', async () => {
      await toStartScreen().catch(dismissDialogs);
      await queueDialog(app, 'open', samplePath);
      await driver.eval(`__rt.click(__rt.byText('Open Existing Protocol'))`);
      await waitForProtocol(1);
      return `${await driver.eval(stageCount)} stages`;
    });
  }

  if (sample) {
    // Preview runs before the editor sweeps: after them the preview window
    // stays on Interviewer's start screen instead of opening the stage.
    await check('stage preview renders the stage in Interviewer', async () => {
      const titles = await driver.eval(
        `[...document.querySelectorAll('.timeline-stage__title')].map((e) => e.textContent.trim())`,
      );
      const index = titles.findIndex((t) =>
        /quick add name generator/i.test(t),
      );
      if (index === -1) throw new Error('no Quick Add stage in the sample');
      await driver.eval(
        `__rt.click(document.querySelectorAll('.timeline-stage')[${index}].querySelector('.timeline-stage__screen'))`,
      );
      await waitFor(
        driver,
        `Boolean(document.querySelector('.screen .stage-editor'))`,
        {
          label: 'stage editor',
        },
      );
      await driver.eval(`__rt.click(__rt.byText('Preview'))`);
      const deadline = Date.now() + 30_000;
      let text = null;
      while (!text && Date.now() < deadline) {
        for (const w of app.windows()) {
          if (!w.url().includes('/session/')) continue;
          text = await w
            .evaluate(
              () => document.querySelector('.stage')?.textContent ?? null,
            )
            .catch(() => null);
          if (text) break;
        }
        if (!text) await new Promise((r) => setTimeout(r, 500));
      }
      await closeScreens();
      if (!text) {
        const urls = app
          .windows()
          .map((w) => w.url().split('/').slice(-3).join('/'));
        throw new Error(
          `no preview window rendered a stage; windows: ${urls.join(', ')}`,
        );
      }
      return {
        ok: /within the past 6 months/i.test(text),
        note: text.slice(0, 120),
      };
    });

    await check('every stage editor in the sample opens', async () => {
      const count = await driver.eval(stageCount);
      const broken = [];
      for (let i = 0; i < count; i += 1) {
        const title = await driver.eval(
          `document.querySelectorAll('.timeline-stage')[${i}].querySelector('.timeline-stage__title')?.textContent.trim()`,
        );
        const errorsBefore = pageErrors.length;
        await driver.eval(
          `__rt.click(document.querySelectorAll('.timeline-stage')[${i}].querySelector('.timeline-stage__screen'))`,
        );
        const opened = await waitFor(
          driver,
          `(() => { const e = __rt.errors(); if (e.length) return { error: e.join(' | ') }; const ed = document.querySelector('.screen .stage-editor'); return ed && __rt.visible(ed) ? { ok: true } : null; })()`,
          { timeout: 10_000, label: 'stage editor' },
        ).catch((error) => ({ error: error.message }));
        const thrown = pageErrors.slice(errorsBefore);
        if (opened.error || thrown.length) {
          broken.push(
            `${i + 1} ${title}: ${(opened.error ?? thrown.join(' | ')).slice(0, 300)}`,
          );
          await driver.screenshot(`fail-stage-editor-${i + 1}`);
          await dismissDialogs();
        }
        // A crashed editor can leave an error overlay nothing dismisses.
        const closed = await closeScreens().then(
          () => true,
          (error) => {
            broken.push(`${i + 1} ${title}: ${error.message.slice(0, 200)}`);
            return false;
          },
        );
        if (!closed) {
          broken.push(
            `stages ${i + 2}–${count} not checked: the app could not return to the timeline`,
          );
          break;
        }
      }
      return {
        ok: broken.length === 0,
        note: broken.length ? broken.join(' || ') : `${count} editors`,
      };
    });

    await check(
      'a new stage of every interface type opens its editor',
      async () => {
        // Each type: open the interface list, choose the type once the list
        // has settled (a choice made during its opening transition leaves the
        // list stranded on screen), check the editor, cancel it.
        const list = `[...(__rt.topScreen()?.querySelectorAll('.new-stage-screen__interface') ?? [])]`;
        const openList = async () => {
          await driver.eval(
            `__rt.click(document.querySelector('.timeline__insert'))`,
          );
          await waitFor(
            driver,
            `(async () => { const l = ${list}; return l.length > 0 && __rt.opaque(__rt.topScreen()) && (await __rt.settled(__rt.topScreen())); })()`,
            { label: 'interface list' },
          );
        };
        await openList();
        const types = await driver.eval(
          `${list}.map((e) => e.querySelector('.new-stage-screen__interface-info')?.firstElementChild?.textContent.trim())`,
        );
        await closeScreens();
        const broken = [];
        for (const type of types) {
          const errorsBefore = pageErrors.length;
          await openList();
          await driver.eval(
            `__rt.click(${list}.find((e) => e.querySelector('.new-stage-screen__interface-info')?.firstElementChild?.textContent.trim() === ${JSON.stringify(type)}))`,
          );
          const opened = await waitFor(
            driver,
            `(async () => { const e = __rt.errors(); if (e.length) return { error: e.join(' | ') }; const top = __rt.topScreen(); return top?.querySelector('.stage-editor') && top.querySelector('input[name=label]') && __rt.opaque(top) && (await __rt.settled(top)) ? { ok: true } : null; })()`,
            { timeout: 10_000, label: `${type} editor` },
          ).catch((error) => ({ error: error.message }));
          const thrown = pageErrors.slice(errorsBefore);
          if (opened.error || thrown.length) {
            broken.push(
              `${type}: ${(opened.error ?? thrown.join(' | ')).slice(0, 300)}`,
            );
            await driver.screenshot(`fail-new-stage-${slug(type)}`);
            await dismissDialogs();
          }
          const closed = await closeScreens().then(
            () => true,
            (error) => {
              broken.push(`${type}: ${error.message.slice(0, 200)}`);
              return false;
            },
          );
          if (!closed) {
            broken.push(
              'remaining interface types not checked: the app could not return to the timeline',
            );
            break;
          }
        }
        return {
          ok: broken.length === 0 && types.length > 0,
          note: broken.length
            ? broken.join(' || ')
            : `${types.length} interface types`,
        };
      },
    );

    await check('the codebook lists the sample node types', async () => {
      await driver.eval(`__rt.click(__rt.byText('Manage Codebook'))`);
      const text = await waitFor(
        driver,
        `(() => { const s = [...document.querySelectorAll('.screen')].filter(__rt.visible).pop(); return s && s.textContent.includes('Person') ? s.textContent.slice(0, 200) : null; })()`,
        { label: 'codebook screen' },
      );
      const errors = await visibleErrors();
      const codebookScreen = `[...document.querySelectorAll('.screen')].find((s) => s.textContent.includes('Below you can find an overview'))`;
      await waitFor(driver, `__rt.opaque(${codebookScreen})`, {
        label: 'codebook opened',
      });
      await driver.eval(
        `__rt.click([...${codebookScreen}.querySelectorAll('button')].find((b) => /^close$/i.test(b.textContent.trim())))`,
      );
      // Closed screens can stay mounted while they slide away.
      await waitFor(
        driver,
        `(() => { const s = ${codebookScreen}; if (!s) return true; const r = s.getBoundingClientRect(); return !__rt.visible(s) || !__rt.opaque(s) || r.top >= innerHeight || r.bottom <= 0; })()`,
        { label: 'codebook closed' },
      );
      return {
        ok: errors.length === 0,
        note: errors.join(' | ') || text.slice(0, 80),
      };
    });

    await check('a stage edit saves to the protocol file', async () => {
      await driver.eval(
        `__rt.click(document.querySelectorAll('.timeline-stage')[0].querySelector('.timeline-stage__screen'))`,
      );
      await waitFor(
        driver,
        `Boolean(__rt.topScreen()?.querySelector('input[name=label]'))`,
        {
          label: 'stage editor',
        },
      );
      await driver.eval(
        `(async () => { const i = __rt.topScreen()?.querySelector('input[name=label]'); await __rt.typeInto(i, 'RT renamed stage'); i.blur(); return true; })()`,
      );
      await driver.eval(`__rt.click(__rt.byText('Finished Editing'))`);
      await waitFor(
        driver,
        `document.querySelector('.timeline-stage .timeline-stage__title')?.textContent.trim() === 'RT renamed stage'`,
        { label: 'timeline shows the new name' },
      );
      await driver.eval(`__rt.click(__rt.byText('Save Changes'))`);
      await waitFor(driver, `!__rt.byText('Save Changes')`, {
        timeout: 20_000,
        label: 'saved',
      });
      // The save button clears before the file is replaced on disk.
      let label;
      const until = Date.now() + 15_000;
      while (Date.now() < until) {
        label = (await readProtocol(samplePath).catch(() => null))?.stages[0]
          ?.label;
        if (label === 'RT renamed stage') break;
        await new Promise((r) => setTimeout(r, 500));
      }
      return {
        ok: label === 'RT renamed stage',
        note: `saved stage 1 label: ${label}`,
      };
    });

    await check(
      'the printable summary renders and saves as a PDF',
      async () => {
        const pdf = path.join(files, 'rt-summary.pdf');
        await driver.eval(`__rt.click(__rt.byText('Printable Summary'))`);
        const deadline = Date.now() + 30_000;
        let summary;
        while (!summary && Date.now() < deadline) {
          summary = app.windows().find((w) => w.url().includes('#/summary'));
          if (!summary) await new Promise((r) => setTimeout(r, 500));
        }
        if (!summary) throw new Error('no summary window opened');
        const summaryDriver = playwrightDriver(summary, { artifactsDir });
        await waitFor(
          summaryDriver,
          `document.body.textContent.includes('Protocol Summary') && document.body.textContent.includes('RT renamed stage')`,
          { label: 'summary content' },
        );
        await queueDialog(app, 'save', pdf);
        await summaryDriver.eval(`__rt.click(__rt.byText('Save PDF'))`);
        const written = await new Promise((resolve) => {
          const until = Date.now() + 30_000;
          const poll = () => {
            if (fs.existsSync(pdf) && fs.statSync(pdf).size > 1_000)
              resolve(true);
            else if (Date.now() > until) resolve(false);
            else setTimeout(poll, 500);
          };
          poll();
        });
        await summaryDriver
          .eval(
            `(() => { const b = __rt.byText('Close Window'); if (b) __rt.click(b); return true; })()`,
          )
          .catch(() => {});
        if (!written) throw new Error('PDF not written');
        const header = fs.readFileSync(pdf).subarray(0, 4).toString();
        return {
          ok: header === '%PDF',
          note: `${fs.statSync(pdf).size} bytes`,
        };
      },
    );
  } else {
    run.note(
      'stage, preview, codebook, save and summary checks skipped: no sample protocol could be opened',
    );
  }

  await check('a schema 6 protocol upgrades to a schema 7 copy', async () => {
    await toStartScreen();
    const upgraded = path.join(files, 'rt-schema6-upgraded.netcanvas');
    await queueDialog(app, 'open', SCHEMA_6);
    await queueDialog(app, 'save', upgraded);
    await driver.eval(`__rt.click(__rt.byText('Open Existing Protocol'))`);
    await waitFor(driver, `Boolean(__rt.byText('Create upgraded copy'))`, {
      label: 'upgrade offer',
    });
    await driver.eval(`__rt.click(__rt.byText('Create upgraded copy'))`);
    await waitForProtocol(1).catch(async (error) => {
      await driver.screenshot('fail-upgrade');
      await dismissDialogs();
      throw error;
    });
    const protocol = await readProtocol(upgraded);
    return {
      ok: protocol.schemaVersion === 7 && protocol.stages.length > 0,
      note: `upgraded copy: schema ${protocol.schemaVersion}, ${protocol.stages.length} stages`,
    };
  });

  await check(
    'a schema 8 protocol is refused with an explanation',
    async () => {
      await toStartScreen().catch(dismissDialogs);
      await queueDialog(app, 'open', SCHEMA_8);
      await driver.eval(`__rt.click(__rt.byText('Open Existing Protocol'))`);
      const shown = await waitFor(
        driver,
        `__rt.errors().find((e) => /not compatible/i.test(e)) ?? null`,
        { label: 'refusal explained' },
      );
      await dismissDialogs();
      const opened = await driver.eval(
        `Boolean(document.querySelector('.timeline'))`,
      );
      return {
        ok: !opened,
        note: opened ? 'the protocol opened anyway' : shown.slice(0, 120),
      };
    },
  );

  await check('create a new protocol', async () => {
    await toStartScreen().catch(dismissDialogs);
    const created = path.join(files, 'rt-new.netcanvas');
    await queueDialog(app, 'save', created);
    await driver.eval(`__rt.click(__rt.byText('Create New Protocol'))`);
    await waitForProtocol(0);
    const protocol = await readProtocol(created);
    return {
      ok: protocol.schemaVersion === 7 && protocol.stages.length === 0,
      note: `schema ${protocol.schemaVersion}, ${protocol.stages.length} stages`,
    };
  });

  run.record(
    'no uncaught renderer exceptions',
    pageErrors.length === 0,
    pageErrors.length
      ? [...new Set(pageErrors)].slice(0, 8).join(' | ')
      : undefined,
  );
  const unexpected = (await dialogLog(app)).filter((d) => d.kind === 'error');
  if (unexpected.length) {
    run.note(
      `native error boxes: ${unexpected.map((d) => d.message).join(' | ')}`,
    );
  }
}
