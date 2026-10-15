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
 */
async function move(page, testId) {
  const before = await settledStep(page);
  await page.getByTestId(testId).click();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    const steps = await currentSteps(page);
    if (steps.length === 1 && steps[0] !== before) return steps[0];
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
  return attempts + 1;
}
