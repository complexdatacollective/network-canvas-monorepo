#!/usr/bin/env node
// Conducts an interview in Fresco, from the first stage to the finish screen,
// and checks what the participant sees while doing it.
//
// This is the hole the release test had: nothing advanced through a stage,
// answered a prompt or finished an interview, so every pending change to the
// interview runtime Fresco hosts reached the release unexercised. The protocol
// it conducts is purpose-built for that (packages/protocols/e2e/
// fresco-release-test) — response options long enough to need the bin's own
// fitting, emphasis authored inside them, a video the researcher described
// beside one whose description is blank.
//
// Usage:
//   node interview-lane.mjs --lane fresh [--stop-after <stage>] [--out <dir>]
//
// Prints one JSON line: { ok, checks, interviewId, nodeIds, ... }. The workflow
// binds the check ids to a list of its own, so a run that stops performing one
// fails rather than reporting a shorter list.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  attempt,
  check,
  repoRoot,
  completeSetup,
  launch,
  newPage,
  recordDiagnosticsTo,
  report,
  signIn,
  uploadProtocol,
} from './fresco-driver.mjs';
import { readInterviewExport } from './interview-export-contract.mjs';
import { lane, postgresContainer } from './lanes.mjs';
import { relayHost } from './relay-host.mjs';

const RELAY_HOST = relayHost();

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'fresh');
const config = lane(laneName);
const outDir = argument(
  'out',
  join(import.meta.dirname, '..', 'artifacts', laneName),
);
const fixtures = argument(
  'fixtures',
  join(import.meta.dirname, '..', 'artifacts', 'fixtures'),
);
// A partial walk stops once the network has nodes in it. The analytics lane
// asks only for a participant-facing surface that has created entities; the
// full walk is what checks the interview itself.
const stopAfter = argument('stop-after', 'finish');
const alreadySetUp = argv.includes('--signed-in');

mkdirSync(outDir, { recursive: true });

/** The answers this walk gives, which the export then has to carry. */
const TRANSCRIPT = {
  egoName: 'Release Tester',
  people: ['Alex', 'Blair', 'Casey'],
  // label → the option label whose value each person is filed under.
  closeness: {
    Alex: 'Someone I would tell **anything** to, however difficult the subject',
    Blair: 'Someone I would talk to about most things',
    Casey: '_Not_ close',
  },
  context: {
    Alex: 'Someone I know through **work**, or through something work led to',
    Blair:
      'Previously involved in the criminal legal system, but not currently',
    Casey: '_Family_',
  },
};

/** Markdown emphasis removed, which is what a screen reader is handed. */
const plain = (markdown) => markdown.replaceAll('**', '').replaceAll('_', '');

const psql = (sql) =>
  execFileSync('docker', [
    'exec',
    postgresContainer(laneName),
    'psql',
    '-U',
    'postgres',
    '-t',
    '-A',
    '-c',
    sql,
  ])
    .toString()
    .trim();

const checks = [];
const result = { ok: false, checks };
let browser;

try {
  const launched = await launch({
    lane: laneName,
    // On a lane that runs with analytics ENABLED, this browser's events have
    // to reach that lane's sink like every other event in the run — and
    // `launch` refuses the lane without it rather than letting them go to the
    // real relay.
    relayTo: config.analytics
      ? { host: RELAY_HOST, port: config.sinkHttpsPort }
      : null,
  });
  browser = launched.browser;
  const page = await newPage(launched.context);
  recordDiagnosticsTo(page, outDir);

  if (alreadySetUp) {
    await signIn(page, { lane: laneName });
    await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
  } else {
    await completeSetup(page, { lane: laneName });
  }

  // --- the protocol the walk conducts -------------------------------------
  checks.push(
    await attempt('interview-protocol-imported', async () => {
      await page.goto(`${config.baseUrl}/dashboard/protocols`, {
        waitUntil: 'networkidle',
      });
      await uploadProtocol(
        page,
        join(fixtures, 'fresco-release-test.netcanvas'),
      );
      // The import streams the media through storage, so it is not instant.
      // Waited for by its effect in the database rather than by a toast: the
      // toast is also how a FAILED import reports itself.
      const deadline = Date.now() + 120_000;
      let id = '';
      while (Date.now() < deadline && !id) {
        await page.waitForTimeout(2000);
        id = psql(
          `select id from "Protocol" where name like 'fresco-release-test%' order by "importedAt" desc limit 1;`,
        );
      }
      result.protocolId = id;
      return {
        pass: Boolean(id),
        detail: id
          ? `imported as ${id}`
          : 'the protocol never appeared in the database within 120s',
      };
    }),
  );
  if (!result.protocolId) throw new Error('no protocol to conduct');

  // Anonymous recruitment is the shortest path to a real participant-facing
  // interview: the same route a recruited participant follows, with no
  // researcher session involved.
  await page.goto(`${config.baseUrl}/dashboard/settings`, {
    waitUntil: 'networkidle',
  });
  const recruitment = page.getByRole('switch', {
    name: 'Anonymous Recruitment',
  });
  if ((await recruitment.getAttribute('aria-checked')) !== 'true') {
    await recruitment.click();
    await page.waitForTimeout(3000);
  }

  // --- the interview ------------------------------------------------------
  // Every stage marker on the page, because a stage that is leaving stays
  // mounted while it animates out: for part of a second there are two, and a
  // reader that assumed one either throws or reads whichever it happened to
  // find. A settled interview has exactly one.
  const currentSteps = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-stage-step]')].map((element) =>
        element.getAttribute('data-stage-step'),
      ),
    );
  const settledStep = async (timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const steps = await currentSteps();
      if (steps.length === 1) return steps[0];
      if (Date.now() > deadline)
        throw new Error(
          `the interview never settled on one stage (saw ${steps.length})`,
        );
      await page.waitForTimeout(250);
    }
  };
  const nextStage = async () => {
    const before = await settledStep();
    await page.getByTestId('next-button').click();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      const steps = await currentSteps();
      if (steps.length === 1 && steps[0] !== before) return;
    }
    throw new Error(`the stage did not advance from step ${before}`);
  };

  checks.push(
    await attempt('interview-opens', async () => {
      await page.goto(`${config.baseUrl}/onboard/${result.protocolId}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForURL(/\/interview\//, { timeout: 60_000 });
      result.interviewId = new URL(page.url()).pathname.split('/').pop();
      // The first render of this route on a freshly started container can come
      // back as the app's error screen, and the next attempt serves the
      // interview — so the open is retried the way a participant would retry
      // it, on either symptom: an error screen, or a stage that never
      // appeared. Bounded and counted, so an interview that needed retries is
      // visible in the detail rather than smoothed away.
      let attempts = 0;
      for (; attempts < 4; attempts += 1) {
        if (attempts > 0) {
          await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
        }
        const broken = await page
          .getByRole('button', { name: 'Copy Debug Information' })
          .isVisible()
          .catch(() => false);
        if (broken) continue;
        const steps = await currentSteps().catch(() => []);
        if (steps.length >= 1) break;
        await page.waitForTimeout(3000);
      }
      result.openAttempts = attempts + 1;
      const settled = await settledStep();
      const heading = await page
        .getByRole('heading', { name: 'Welcome' })
        .first()
        .textContent();
      return {
        pass: settled === '0' && Boolean(heading?.includes('Welcome')),
        detail: `interview ${result.interviewId} opened on step ${settled} after ${attempts + 1} attempt(s)`,
      };
    }),
  );

  // The Information interface carried a marker class for overriding the host's
  // global `user-select: none`, and the utility that implemented it was
  // removed as unused — so the text silently stopped being selectable. The
  // oracle is the computed style a participant is actually subject to, not the
  // class name that was supposed to produce it.
  checks.push(
    await attempt('interview-information-selectable', async () => {
      const value = await page.evaluate(() => {
        const paragraph = [...document.querySelectorAll('p')].find((element) =>
          element.textContent?.includes('selectable'),
        );
        if (!paragraph) return null;
        return getComputedStyle(paragraph).userSelect;
      });
      return {
        pass: value !== null && value !== 'none',
        detail:
          value === null
            ? "the Information stage's text was not on the page"
            : `computed user-select on the stage's text: ${value}`,
      };
    }),
  );

  // A video announces itself with the description the researcher wrote for it,
  // and falls back to the file's own name only when nobody wrote one — a
  // description of nothing but spaces being nobody having written one.
  checks.push(
    await attempt('interview-video-descriptions', async () => {
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll('video')].map((video) =>
          video.getAttribute('aria-label'),
        ),
      );
      const described = 'A short clip of a duck, with sound';
      const fileName = 'withSound.mp4';
      return {
        pass:
          labels.length === 2 &&
          labels[0] === described &&
          labels[1] === fileName,
        detail: `video labels: ${JSON.stringify(labels)} (expected the researcher's description, then the file's own name for the blank one)`,
      };
    }),
  );

  await nextStage();

  checks.push(
    await attempt('interview-ego-form-answered', async () => {
      const field = page.locator('[data-field-name="ego_name"] input');
      await field.fill(TRANSCRIPT.egoName);
      // Blur is load-bearing: protocol forms validate on blur and the next
      // control is only ready once validation has run.
      await field.blur();
      await page.waitForTimeout(500);
      const value = await field.inputValue();
      await nextStage();
      return {
        pass: value === TRANSCRIPT.egoName,
        detail: `ego_name = ${value}`,
      };
    }),
  );

  checks.push(
    await attempt('interview-nodes-created', async () => {
      await page.getByRole('button', { name: 'Add a person' }).click();
      const input = page.getByRole('textbox', { name: 'Person name' });
      for (const name of TRANSCRIPT.people) {
        await input.fill(name);
        await input.press('Enter');
        await page.getByRole('option', { name }).waitFor({ timeout: 15_000 });
      }
      const options = await page.getByRole('option').allTextContents();
      return {
        pass: TRANSCRIPT.people.every((name) => options.includes(name)),
        detail: `added ${options.join(', ')}`,
      };
    }),
  );

  if (stopAfter === 'nodes') {
    result.ok = true;
    result.stoppedAfter = 'nodes';
  } else {
    await nextStage();

    checks.push(
      await attempt('interview-sociogram-placed-and-connected', async () => {
        for (const [name, target] of [
          ['Alex', { x: 0.3, y: 0.35 }],
          ['Blair', { x: 0.65, y: 0.35 }],
          ['Casey', { x: 0.5, y: 0.65 }],
        ])
          await placeNode(page, name, target);
        // Two taps on the same prompt create the edge between them — on the
        // canvas, not in the drawer: a node that is still unplaced has a
        // button of its own there, and tapping that one selects nothing.
        const canvas = page.getByRole('application', {
          name: 'Placement area',
        });
        await canvas.getByRole('button', { name: /^Alex/ }).first().click();
        await page.waitForTimeout(400);
        await canvas
          .getByRole('button', { name: /^Blair/ })
          .first()
          .click();
        await page.waitForTimeout(1500);
        const edges = await page.locator('line[data-edge-id]').count();
        const unplaced = await unplacedCount(page);
        return {
          pass: edges === 1 && unplaced === 0,
          detail: `${edges} edge(s) drawn, ${unplaced} node(s) left unplaced`,
        };
      }),
    );

    if (stopAfter === 'sociogram') {
      result.ok = true;
      result.stoppedAfter = 'sociogram';
    } else {
      await nextStage();
      checks.push(
        await binLabelsCheck(
          page,
          'interview-ordinal-bin-labels',
          TRANSCRIPT.closeness,
        ),
      );
      checks.push(
        await binPlacementCheck(
          page,
          'interview-ordinal-bin-placement',
          TRANSCRIPT.closeness,
        ),
      );
      await nextStage();
      checks.push(
        await binLabelsCheck(
          page,
          'interview-categorical-bin-labels',
          TRANSCRIPT.context,
        ),
      );
      checks.push(
        await binPlacementCheck(
          page,
          'interview-categorical-bin-placement',
          TRANSCRIPT.context,
        ),
      );
      await nextStage();

      checks.push(
        await attempt('interview-finished', async () => {
          await page
            .getByRole('button', { name: /^Finish/ })
            .first()
            .click();
          const dialog = page.getByRole('dialog');
          if (await dialog.isVisible().catch(() => false))
            await dialog
              .getByRole('button', { name: /Finish/ })
              .first()
              .click();
          // The database, not the screen: a finish screen that renders without
          // the finish being recorded is exactly the failure worth catching.
          const deadline = Date.now() + 60_000;
          let finishedAt = '';
          while (Date.now() < deadline && !finishedAt) {
            await page.waitForTimeout(2000);
            finishedAt = psql(
              `select "finishTime" from "Interview" where id = '${result.interviewId}';`,
            );
          }
          return {
            pass: Boolean(finishedAt),
            detail: finishedAt
              ? `finishTime recorded: ${finishedAt}`
              : 'no finishTime was recorded within 60s of finishing',
          };
        }),
      );

      // --- and out through the export ----------------------------------------
      checks.push(
        await attempt('interview-export-carries-the-answers', async () => {
          await signIn(page, { lane: laneName });
          await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
          await page.goto(`${config.baseUrl}/dashboard/interviews`, {
            waitUntil: 'networkidle',
          });
          // A menu, then the format dialog, then a build that streams for as
          // long as the archive takes.
          const download = page.waitForEvent('download', { timeout: 300_000 });
          await page
            .getByRole('button', { name: 'Export Interview Data' })
            .click();
          await page
            .getByRole('menuitem', { name: /Export all interviews/ })
            .click();
          const dialog = page.getByRole('dialog');
          await dialog.waitFor({ state: 'visible', timeout: 30_000 });
          await dialog
            .getByRole('button', { name: /Start export|Export/ })
            .first()
            .click();
          const archivePath = join(outDir, 'interview-export.zip');
          await (await download).saveAs(archivePath);
          result.exportPath = archivePath;
          const found = await readInterviewExport(archivePath);
          const missing = expectedAnswers().filter(
            (answer) => !found.text.includes(answer),
          );
          return {
            pass: found.entries > 0 && missing.length === 0,
            detail:
              found.entries === 0
                ? 'the export archive held no data files'
                : missing.length === 0
                  ? `every answer this walk gave is in the export (${found.entries} file(s))`
                  : `the export does not carry: ${missing.join(' | ')}`,
          };
        }),
      );
      result.ok = true;
    }
  }

  result.interviewId = result.interviewId ?? null;
} catch (error) {
  result.error = error.message;
  checks.push(check('interview-walk-completed', false, error.message));
} finally {
  await browser?.close().catch(() => {});
}

writeFileSync(
  join(outDir, 'interview-walk.json'),
  JSON.stringify({ ...result, transcript: TRANSCRIPT }, null, 2),
);
report(result);

/**
 * Every answer the walk gave, as it must appear in exported data.
 *
 * The bin answers are included as the VALUES the codebook gives their options,
 * read from the protocol rather than restated: an export carries the value, not
 * the label, and a walk whose bin placements were not persisted would otherwise
 * produce an export this check was happy with.
 */
function expectedAnswers() {
  const codebook = JSON.parse(
    readFileSync(
      join(
        repoRoot,
        'packages/protocols/e2e/fresco-release-test/protocol.json',
      ),
      'utf8',
    ),
  ).codebook.node.person.variables;
  const valueOf = (variable, label) => {
    const option = codebook[variable].options.find(
      (entry) => entry.label === label,
    );
    if (!option)
      throw new Error(
        `the protocol has no "${variable}" option labelled "${label}" — the walk is filing people into bins that do not exist`,
      );
    return String(option.value);
  };
  return [
    TRANSCRIPT.egoName,
    ...TRANSCRIPT.people,
    ...Object.values(TRANSCRIPT.context).map((label) =>
      valueOf('context', label),
    ),
    ...Object.values(TRANSCRIPT.closeness).map((label) =>
      valueOf('closeness', label),
    ),
  ];
}

/**
 * How many nodes the drawer still says are unplaced.
 *
 * Returns null when the drawer cannot be read, never 0: "nothing left to
 * place" and "could not tell" are opposite findings, and a reader that
 * conflated them would report a stage nobody completed as complete.
 */
async function unplacedCount(page) {
  const text = await page
    .getByText(/unplaced/)
    .first()
    .textContent()
    .catch(() => null);
  if (text === null) return null;
  const count = /(\d+)\s+unplaced/.exec(text);
  return count ? Number(count[1]) : null;
}

/**
 * Places one node and proves it landed.
 *
 * Every drag moves the remaining nodes in the drawer, so a sequence of
 * measured drags can miss one and leave the check reporting an edge failure
 * for a node that was never placed. Each drag is therefore verified against
 * the drawer's own count and retried from a fresh measurement.
 */
async function placeNode(page, label, target) {
  const before = await unplacedCount(page);
  for (let tries = 0; tries < 3; tries += 1) {
    await dragToCanvas(page, label, target);
    const after = await unplacedCount(page);
    if (after !== null && before !== null && after < before) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`"${label}" would not leave the drawer after 3 attempts`);
}

/**
 * A sociogram drag: a raw pointer drag with a jiggle that clears the 5px drag
 * threshold, not a native drag-and-drop — the canvas uses pointer capture, and
 * a pointerup that never moved is treated as a click.
 */
async function dragToCanvas(page, label, target) {
  const node = page
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .first();
  const canvas = page.getByRole('application', { name: 'Placement area' });
  const nodeBox = await node.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!nodeBox || !canvasBox)
    throw new Error(`cannot measure "${label}" or the placement area`);
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8);
  await page.mouse.move(
    canvasBox.x + canvasBox.width * target.x,
    canvasBox.y + canvasBox.height * target.y,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.waitForTimeout(600);
}

/**
 * Every option of a bin stage reads in full, and emphasis authored in it is
 * emphasis rather than the characters that produce it.
 *
 * Two assertions in one check because they are one behaviour: the option is
 * sized to the room it has, and what a screen reader is handed is the whole
 * option without the markdown around it. A truncated accessible name and a
 * literal `**` are the two ways that goes wrong.
 */
async function binLabelsCheck(page, id, assignments) {
  return attempt(id, async () => {
    const labels = [...new Set(Object.values(assignments))];
    // The accessibility snapshot, because that IS the claim: whatever the bin
    // does with the text on screen, the whole option is still handed to a
    // screen reader. It also spans both bin shapes — an ordinal bin names its
    // options in headings and listbox names, a categorical one in buttons —
    // without this check having to know which it is looking at.
    const snapshot = await page.locator('main').ariaSnapshot();
    const emphasised = await page.evaluate(() =>
      [...document.querySelectorAll('main strong, main em')].map(
        (element) => element.textContent?.trim() ?? '',
      ),
    );

    const missing = labels.filter(
      (label) => !snapshot.includes(plain(label).trim()),
    );
    // The words the researcher marked up, which must arrive as emphasis rather
    // than as the characters that produce it.
    const authored = labels.flatMap(
      (label) =>
        [...label.matchAll(/\*\*(.+?)\*\*|_(.+?)_/g)].map(
          (match) => match[1] ?? match[2],
        ) ?? [],
    );
    const unemphasised = authored.filter(
      (word) => !emphasised.includes(word.trim()),
    );
    const literal = /\*\*/.test(snapshot);

    return {
      pass: missing.length === 0 && !literal && unemphasised.length === 0,
      detail:
        missing.length > 0
          ? `option(s) not read in full: ${missing.join(' | ')}`
          : literal
            ? 'markdown syntax reached the accessible name literally'
            : unemphasised.length > 0
              ? `authored emphasis not rendered as emphasis: ${unemphasised.join(', ')}`
              : `${labels.length} option(s) read in full, ${authored.length} emphasised span(s) rendered`,
    };
  });
}

/** Files every person into the bin their transcript entry names. */
async function binPlacementCheck(page, id, assignments) {
  return attempt(id, async () => {
    for (const [person, label] of Object.entries(assignments))
      await fileNode(page, person, plain(label).trim());
    await page.waitForTimeout(1000);
    const unplaced = await unplacedCount(page);
    return {
      pass: unplaced === 0,
      detail: `${unplaced} node(s) left unplaced after filing ${Object.keys(assignments).length} people`,
    };
  });
}

/**
 * Files one node into the bin an option names, whichever way that bin takes.
 *
 * A pointer drag first, because both bin interfaces accept one and it does not
 * depend on how a particular interface announces its targets; the keyboard
 * route is the fallback, and it is also the one the interview package's own
 * e2e fixtures use. Verified against the drawer's own count rather than
 * assumed — a drag that lands nowhere leaves no error behind.
 */
async function fileNode(page, person, binLabel) {
  const before = await unplacedCount(page);
  const target = page
    .locator(
      `[role="listbox"][aria-label*="${binLabel.slice(0, 20).replaceAll('"', '')}"]`,
    )
    .first();
  // Waited for, not sampled: the first call lands while the stage is still
  // animating in, and a bin that is not there YET is not a bin that refuses a
  // pointer — treating the two alike sent every node down the keyboard path.
  await target.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await target.isVisible().catch(() => false)) {
    await dragToElement(page, person, target);
    const after = await unplacedCount(page);
    if (after !== null && before !== null && after < before) return;
  }
  await dragToBin(page, person, binLabel);
  const after = await unplacedCount(page);
  if (after !== null && before !== null && after >= before)
    throw new Error(
      `"${person}" would not go into "${binLabel}" by pointer or by keyboard`,
    );
}

/** A pointer drag from a node onto an element, with the threshold-clearing jiggle. */
async function dragToElement(page, label, target) {
  const node = page
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .first();
  const nodeBox = await node.boundingBox();
  const targetBox = await target.boundingBox();
  if (!nodeBox || !targetBox) return;
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // The jiggle clears the drag threshold; the pauses are what make the drop
  // land. The bin has to see the pointer over it for a moment before the
  // release — a drag that arrives and lets go in the same frame is dropped
  // nowhere, silently, and looks exactly like a bin that refused it.
  await page.mouse.move(startX + 8, startY + 8);
  await page.waitForTimeout(200);
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.waitForTimeout(600);
  await page.mouse.move(targetX + 3, targetY + 3);
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(1200);
}

/**
 * Bin placement by keyboard: Ctrl+D lifts the node, ArrowRight cycles the drop
 * targets — which the polite live region announces — and Enter drops it. The
 * same interaction the interview package's own e2e fixtures use, because a
 * pointer drag into a bin depends on layout the fitting behaviour deliberately
 * changes.
 */
async function dragToBin(page, nodeLabel, binLabel) {
  const node = page.getByRole('button', { name: nodeLabel }).first();
  await node.waitFor({ state: 'visible', timeout: 15_000 });
  await node.evaluate((element) => {
    if (element instanceof HTMLElement) element.focus();
  });
  await node.press('Control+d');
  // Both arrow directions, because the two bin interfaces lay their bins out
  // differently — a categorical bin's targets are a row, an ordinal bin's are
  // a column — and a walker that only cycled one axis would find every target
  // in one interface and none in the other.
  const keys = ['ArrowRight', 'ArrowDown'];
  for (let attemptNumber = 0; attemptNumber < 20; attemptNumber += 1) {
    await page.keyboard.press(keys[attemptNumber % keys.length]);
    // Every live region, not only the one that says "Drop target": the two
    // bin interfaces word their announcements differently, and a matcher tied
    // to one of them silently never finds the other's targets.
    const announcement = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-live]')]
        .map((region) => region.textContent?.trim() ?? '')
        .join(' | '),
    );
    if (announcement.includes(binLabel.slice(0, 20))) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      return;
    }
  }
  const announced = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-live]')]
      .map((region) => region.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' | '),
  );
  throw new Error(
    `no drop target announced for "${binLabel}" after 20 steps; the live regions said: ${announced || '(nothing)'}`,
  );
}
