#!/usr/bin/env node
// The researcher interface in another language.
//
// Every previous check ran in English with no account language preference set,
// so nothing exercised the localization at all: whether the preference applies
// to server-rendered pages, whether it follows the account rather than the
// device, whether it reaches validation and dialogs and the structured details
// in the activity feed, and whether it seeds the interview's own controls
// while leaving protocol-authored text and stored answers alone.
//
// The oracle is the shipped catalogs, not a list of sentences: the same pages
// are read in English and then in Spanish, and every message the English
// rendering carried has to have become its Spanish counterpart. See
// `localization-contract.mjs`.
//
// Usage: node localization-lane.mjs [--lane fresh]
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import {
  attempt,
  check,
  launch,
  newPage,
  recordDiagnosticsTo,
  report,
  signIn,
} from './fresco-driver.mjs';
import { lane, postgresContainer } from './lanes.mjs';
import {
  judgeAuthoredText,
  judgeInterpolated,
  judgeRendering,
  loadCatalog,
} from './localization-contract.mjs';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'fresh');
const config = lane(laneName);
const here = import.meta.dirname;
const outDir = argument('out', join(here, '..', 'artifacts', laneName));
const repoRoot = join(here, '..', '..', '..', '..');

const LANGUAGE = 'Español';
const appEnglish = loadCatalog(
  join(repoRoot, 'apps/fresco/src/locales/en.json'),
);
const appSpanish = loadCatalog(
  join(repoRoot, 'apps/fresco/src/locales/es.json'),
);
const interviewEnglish = loadCatalog(
  join(repoRoot, 'packages/interview/src/locales/en.json'),
);
const interviewSpanish = loadCatalog(
  join(repoRoot, 'packages/interview/src/locales/es.json'),
);

/**
 * Messages whose English text is also a value written into the database when a
 * row was created — an anonymous participant's identifier is one — so a page
 * showing it is showing stored research data rather than interface copy.
 * Switching language must leave them exactly as they are, which
 * `judgeRendering` checks rather than ignores.
 */
const PRESERVED_IDS = ['fresco.actions.interviews.copyAnonymousParticipant'];

/** The dashboard pages read in both languages. */
const PAGES = ['/dashboard', '/dashboard/participants', '/dashboard/settings'];

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
const result = { ok: false, checks, lane: laneName };
let browser;

/**
 * The language control, found by what it offers rather than by its own label.
 *
 * Its label is itself translated, so a lane that looked for "Language" could
 * only ever run once: the second time the control is called "Idioma" and the
 * check fails as if the app had no language setting at all. The option labels
 * are each language's own name, in every language.
 */
const languageSelect = (page) =>
  page
    .locator('select')
    .filter({ has: page.locator('option', { hasText: LANGUAGE }) })
    .first();

const setLanguage = async (page, label) => {
  await page.goto(`${config.baseUrl}/dashboard/settings`, {
    waitUntil: 'networkidle',
  });
  const select = languageSelect(page);
  await select.waitFor({ state: 'visible', timeout: 30_000 });
  await select.selectOption({ label });
  await page.waitForTimeout(4000);
};

const textOf = async (page, path) => {
  await page.goto(`${config.baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  return page.locator('body').innerText();
};

try {
  const launched = await launch({ lane: laneName });
  browser = launched.browser;
  const page = await newPage(launched.context);
  recordDiagnosticsTo(page, outDir);
  await signIn(page, { lane: laneName });
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });

  // Explicitly English first. The preference persists in the account, so a
  // lane that assumed the default would compare Spanish against Spanish on its
  // second run and report a perfectly translated app as untranslated.
  await setLanguage(page, 'English');
  const inEnglish = {};
  for (const path of PAGES) inEnglish[path] = await textOf(page, path);

  checks.push(
    await attempt('localization-preference-applies', async () => {
      await setLanguage(page, LANGUAGE);
      const judgements = [];
      for (const path of PAGES)
        judgements.push({
          path,
          ...judgeRendering({
            englishText: inEnglish[path],
            translatedText: await textOf(page, path),
            english: appEnglish,
            translated: appSpanish,
            what: path,
            preserved: PRESERVED_IDS,
          }),
        });
      result.pages = judgements;
      const failed = judgements.filter((judgement) => !judgement.pass);
      return {
        pass: failed.length === 0,
        detail:
          failed.length === 0
            ? judgements
                .map(
                  (judgement) =>
                    `${judgement.path}: ${judgement.present} message(s)`,
                )
                .join('; ')
            : failed.map((judgement) => judgement.detail).join(' | '),
      };
    }),
  );

  // Validation is server-rendered too, and it is where a half-localized
  // interface usually shows: the happy path is translated and the refusal is
  // not.
  checks.push(
    await attempt('localization-reaches-validation-and-dialogs', async () => {
      await page.goto(`${config.baseUrl}/dashboard/participants`, {
        waitUntil: 'networkidle',
      });
      await page
        .getByRole('button', { name: /Add|Añadir|Agregar/ })
        .first()
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 30_000 });
      // Submit nothing, so the form has to say what is missing.
      await dialog
        .getByRole('button', {
          name: /Submit|Save|Enviar|Guardar|Crear|Create/,
        })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(2500);
      const text = await dialog.innerText();
      const english = Object.entries(appEnglish).filter(
        ([id]) =>
          typeof appSpanish[id] === 'string' &&
          appSpanish[id] !== appEnglish[id],
      );
      const leftInEnglish = english.filter(
        ([id, source]) =>
          source.length >= 12 &&
          !/[{}<>]/.test(source) &&
          text.includes(source) &&
          !text.includes(appSpanish[id]),
      );
      const shown = english.filter(
        ([id]) => appSpanish[id].length >= 12 && text.includes(appSpanish[id]),
      );
      return {
        pass: shown.length > 0 && leftInEnglish.length === 0,
        detail:
          shown.length === 0
            ? 'the dialog showed no translated message at all'
            : leftInEnglish.length === 0
              ? `${shown.length} translated message(s) in the dialog, including its validation`
              : `still English in the dialog: ${leftInEnglish
                  .slice(0, 3)
                  .map(([, source]) => `"${source}"`)
                  .join('; ')}`,
      };
    }),
  );

  // The activity feed's structured details, which every other comparison
  // skips: they name a user, a protocol or a count, so they are written with
  // placeholders and never appear on a page verbatim. They are also the part
  // of the interface that holds an audit record, which is why the claim is
  // that they are PRESENTED in the language while what they record is
  // unchanged.
  checks.push(
    await attempt('localization-reaches-activity-details', async () => {
      const ids = Object.keys(appEnglish).filter((id) =>
        id.startsWith('fresco.activity.detail.'),
      );
      if (ids.length === 0)
        return {
          pass: false,
          detail: 'the catalog holds no structured activity details at all',
        };
      return judgeInterpolated({
        englishText: inEnglish['/dashboard'],
        translatedText: await textOf(page, '/dashboard'),
        english: appEnglish,
        translated: appSpanish,
        ids,
      });
    }),
  );

  // The preference belongs to the ACCOUNT, so a different device with no
  // cookie of its own still gets it.
  checks.push(
    await attempt('localization-follows-the-account', async () => {
      const other = await launch({ lane: laneName });
      try {
        const fresh = await newPage(other.context);
        await signIn(fresh, { lane: laneName });
        await fresh.waitForURL(/\/dashboard/, { timeout: 90_000 });
        const cookies = await other.context.cookies();
        await fresh.goto(`${config.baseUrl}/dashboard`, {
          waitUntil: 'networkidle',
        });
        await fresh.waitForTimeout(2500);
        const judgement = judgeRendering({
          englishText: inEnglish['/dashboard'],
          translatedText: await fresh.locator('body').innerText(),
          english: appEnglish,
          translated: appSpanish,
          what: 'a second device',
          preserved: PRESERVED_IDS,
        });
        return {
          pass: judgement.pass,
          detail: `${judgement.detail} (the device brought ${cookies.filter((cookie) => cookie.name.includes('locale')).length} locale cookie(s) of its own)`,
        };
      } finally {
        await other.browser.close().catch(() => {});
      }
    }),
  );

  // And it seeds the interview's own controls, without touching what the
  // protocol says or what the participant answered.
  checks.push(
    await attempt('localization-seeds-interview-controls', async () => {
      // A new interview of its own, through the participant's own route: an
      // interview that has been finished redirects away, and the controls this
      // check is about are the ones a participant is looking at.
      const protocolId = psql(
        `select id from "Protocol" where name like 'fresco-release-test%' order by "importedAt" desc limit 1;`,
      );
      if (!protocolId)
        return {
          pass: false,
          detail: 'this lane holds no release-test protocol to open',
        };
      await page.goto(`${config.baseUrl}/onboard/${protocolId}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForURL(/\/interview\//, { timeout: 60_000 });
      // The first render of this route on a freshly started container can come
      // back as the app's error screen; reloading serves the interview. Same
      // retry as the interview lane's, for the same reason.
      for (let attempts = 0; attempts < 4; attempts += 1) {
        const broken = await page
          .getByRole('button', {
            name: /Copy Debug Information|Copiar informaci/i,
          })
          .isVisible()
          .catch(() => false);
        if (!broken && (await page.locator('[data-stage-step]').count()) > 0)
          break;
        await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
      }
      // Wait for the stage itself, not a fixed pause: the authored text this
      // check requires is the stage's own content, and reading before it has
      // rendered reports the protocol's words as lost.
      await page
        .locator('[data-stage-step]')
        .first()
        .waitFor({ state: 'attached', timeout: 60_000 })
        .catch(() => {});
      await page.waitForTimeout(4000);
      const text = await page.locator('body').innerText();
      const controls = await page.locator('body').ariaSnapshot();
      const ids = Object.keys(interviewEnglish).filter(
        (id) =>
          typeof interviewSpanish[id] === 'string' &&
          interviewSpanish[id] !== interviewEnglish[id] &&
          interviewSpanish[id].length >= 6 &&
          !/[{}<>]/.test(interviewSpanish[id]),
      );
      const spanish = ids.filter((id) =>
        controls.includes(interviewSpanish[id]),
      );
      const english = ids.filter(
        (id) =>
          controls.includes(interviewEnglish[id]) &&
          !controls.includes(interviewSpanish[id]),
      );
      const authored = judgeAuthoredText({
        translatedText: text,
        authored: ['Fresco release test'],
      });
      result.interviewText = text.slice(0, 400);
      return {
        pass: spanish.length > 0 && english.length === 0 && authored.pass,
        detail:
          spanish.length === 0
            ? "the interview's own controls showed no Spanish at all"
            : english.length > 0
              ? `interview controls still in English: ${english
                  .slice(0, 3)
                  .map((id) => interviewEnglish[id])
                  .join('; ')}`
              : `${spanish.length} interview control message(s) in Spanish; ${authored.detail}`,
      };
    }),
  );

  result.ok = true;
} catch (error) {
  result.error = error.message;
  checks.push(check('localization-lane-completed', false, error.message));
} finally {
  await browser?.close().catch(() => {});
}

report(result);
