// Moving through a Fresco interview, for the lanes that conduct one.
//
// Shared by interview-lane.mjs (the schema 8 protocol, migrated on import),
// schema9-interview-lane.mjs (the schema 9 protocol) and migration-lane.mjs
// (interviews resumed after the upgrade). Everything here is driving; the
// lanes decide what counts as a pass.
import { execFileSync } from 'node:child_process';

import { postgresContainer } from './lanes.mjs';

/** A psql runner against one lane's Postgres container: one value per line. */
export const psqlFor = (laneName) => (sql) =>
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

/** A SQL string literal. */
export const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Every stage marker on the page, because a stage that is leaving stays
 * mounted while it animates out: for part of a second there are two, and a
 * reader that assumed one either throws or reads whichever it happened to
 * find. A settled interview has exactly one.
 */
export const currentSteps = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-stage-step]')].map((element) =>
      element.getAttribute('data-stage-step'),
    ),
  );

/** The one stage step the interview has settled on. */
export async function settledStep(page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const steps = await currentSteps(page);
    if (steps.length === 1) return steps[0];
    if (Date.now() > deadline)
      throw new Error(
        `the interview never settled on one stage (saw ${steps.length})`,
      );
    await page.waitForTimeout(250);
  }
}

/**
 * Presses a navigation button and waits for the interview to settle on a
 * different stage, returning the step it settled on.
 *
 * A press that lands while a stage is still entering — straight after the
 * interview opens, or after another stage's content appeared — can be dropped
 * without any sign. So while the interview is still on the same single stage
 * a few seconds later, the button is pressed again, at most three times in
 * all; a press can only be repeated from the stage it was made on, so a slow
 * move is never doubled into two. A stage that refuses to move (one whose
 * questions are unanswered) still fails, after the last press.
 */
async function move(page, testId) {
  const before = await settledStep(page);
  const presses = 3;
  for (let press = 1; press <= presses; press += 1) {
    await page.getByTestId(testId).click();
    const deadline = Date.now() + (press === presses ? 30_000 : 5_000);
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      const steps = await currentSteps(page);
      if (steps.length === 1 && steps[0] !== before) return steps[0];
    }
    const steps = await currentSteps(page);
    if (steps.length !== 1 || steps[0] !== before) break;
  }
  throw new Error(`the stage did not move from step ${before} (${testId})`);
}

export const nextStage = (page) => move(page, 'next-button');
export const previousStage = (page) => move(page, 'previous-button');

/**
 * Opens an interview URL until its stage renders.
 *
 * The first render of this route on a freshly started container can come back
 * as the app's error screen, and the next attempt serves the interview — so
 * the open is retried the way a participant would retry it, on either symptom:
 * an error screen, or a stage that never appeared. Bounded, and the attempts
 * are returned so an interview that needed retries is visible in a detail
 * rather than smoothed away.
 */
export async function openInterview(page, url) {
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
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
    const steps = await currentSteps(page).catch(() => []);
    if (steps.length >= 1) break;
    await page.waitForTimeout(3000);
  }
  // A stage on the page is not yet a page that can be driven: while the route
  // finishes streaming in, the document briefly holds a second copy of the
  // interview, navigation included, and a click then finds two of every
  // control. Settled is one navigation.
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="next-button"]').length === 1,
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
  return attempts + 1;
}

/**
 * Exports every interview from the dashboard and saves the archive.
 *
 * The researcher's own route through the interviews page: a menu, then the
 * format dialog with its defaults (every format), then a build that streams
 * for as long as the archive takes. The page must already be signed in, in
 * English.
 */
export async function exportAllInterviews(page, baseUrl, archivePath) {
  await page.goto(`${baseUrl}/dashboard/interviews`, {
    waitUntil: 'networkidle',
  });
  const download = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByRole('button', { name: 'Export Interview Data' }).click();
  await page.getByRole('menuitem', { name: /Export all interviews/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  await dialog
    .getByRole('button', { name: /Start export|Export/ })
    .first()
    .click();
  await (await download).saveAs(archivePath);
  return archivePath;
}

/**
 * Starts an interview the way a participant's personal link does — onboarding
 * with a participant identifier, which needs no anonymous recruitment — and
 * returns its id once the interview has rendered a stage.
 */
export async function startInterview(page, baseUrl, protocolId, identifier) {
  await page.goto(
    `${baseUrl}/onboard/${protocolId}?participantIdentifier=${encodeURIComponent(identifier)}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForURL(/\/interview\//, { timeout: 60_000 });
  const attempts = await openInterview(page);
  return {
    interviewId: new URL(page.url()).pathname.split('/').pop(),
    attempts,
  };
}

/**
 * Imports a protocol file from the dashboard and returns the id it was stored
 * under, waited for in the database rather than by the toast — the toast is
 * also how a FAILED import reports itself. Fresco names a protocol after its
 * file, which is what `fileStem` matches.
 */
export async function importProtocol(
  page,
  { baseUrl, psql, path, fileStem, upload },
) {
  await page.goto(`${baseUrl}/dashboard/protocols`, {
    waitUntil: 'networkidle',
  });
  await upload(page, path);
  const deadline = Date.now() + 120_000;
  let id = '';
  while (Date.now() < deadline && !id) {
    await page.waitForTimeout(2000);
    id = psql(
      `select id from "Protocol" where name like ${sqlText(`${fileStem}%`)} order by "importedAt" desc limit 1;`,
    );
  }
  return id;
}
