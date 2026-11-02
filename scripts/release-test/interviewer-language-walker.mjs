#!/usr/bin/env node
// Canonical walker for the Interviewer release smoke test's
// language-negotiation journey, against a DEPLOYED Interviewer origin.
//
// Interviewer shows each person the best language it has for them until they
// say otherwise, and keeps two choices apart:
// - the researcher-facing app (home, data, settings, onboarding) follows the
//   browser's languages, best fit one preference at a time, until a language
//   is chosen in Settings → Language; "Automatic" hands it back to the
//   browser;
// - an interview follows the browser's languages for both the protocol's
//   translation and its own built-in text, whatever the app's language, until
//   the participant chooses a language on a language chooser stage. That
//   choice belongs to that interview, in that tab: it survives a reload and
//   never reaches the next interview or the stored session.
// Each browser-language case runs in its own fresh profile with
// navigator.languages set before any page loads, so the deployment's own
// negotiation decides — the walker asserts the outcome, never drives it.
// Expected words are read from the app's and the interview's own catalogs,
// so a retranslation never breaks the walk and a wrong language always does.
//
// The interview cases conduct the release-smoke fixture
// (packages/protocols/e2e/release-smoke, declaring en-US and es); its archive
// is built from the reviewable protocol.json at run time. Interactions are
// lifted from apps/interviewer/e2e/specs/i18n.spec.ts. Change interactions
// HERE — never let a release-test agent rebuild this from scratch.
//
// Usage (from the repo root):
//   node scripts/release-test/interviewer-language-walker.mjs \
//     --url https://interviewer.networkcanvas.dev \
//     --artifacts /path/to/artifacts [--timeout-ms 300000]
//
// Exit codes: 0 all checks passed; 1 one or more checks failed (see
// result.json); 2 watchdog timeout (a hang, not a verdict); 3 setup error.
// Always writes <artifacts>/result.json and numbered evidence screenshots;
// the final stdout line is the result JSON.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The app's database name (an import-free module, loaded through Node's type
// stripping), so the walker reads the database the deployed app writes.
import { DB_NAME } from '../../apps/interviewer/src/lib/db/storageNames.ts';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const require = createRequire(
  path.join(repoRoot, 'apps/interviewer/package.json'),
);
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 15_000 });

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}
const url = arg('url', 'https://interviewer.networkcanvas.dev');
const artifactsDir = arg('artifacts', null);
const timeoutMs = Number(arg('timeout-ms', '300000'));

const FIXTURE = path.join(
  repoRoot,
  'packages/protocols/e2e/release-smoke/protocol.json',
);
// The interview's own key for the participant's choice, one per interview,
// in the tab's sessionStorage
// (packages/interview/src/localization/localePreferenceStorage.ts).
const CHOICE_KEY_PREFIX = 'network-canvas:interview-locale-preference:';
const APP_CHOICE_KEY = 'interviewer.locale';

// The researcher-facing app. `label` is the language's own name, as the
// Settings picker's Automatic entry names the language it resolves to.
const DASHBOARD_CASES = [
  {
    languages: ['es-MX'],
    locale: 'es',
    label: 'Español',
    rule: 'a regional variant gets its language',
  },
  {
    languages: ['fr-CA', 'en'],
    locale: 'fr',
    label: 'Français',
    rule: 'the first preference wins over a later supported one',
  },
  {
    languages: ['ja', 'de-AT'],
    locale: 'de',
    label: 'Deutsch',
    rule: 'an unsupported first preference passes to the next',
  },
  {
    languages: ['zh-TW'],
    locale: 'zh-Hant',
    label: '繁體中文',
    rule: 'Chinese is matched by script (Taiwan → Traditional)',
  },
  {
    languages: ['zh-CN'],
    locale: 'zh-Hans',
    label: '简体中文',
    rule: 'Chinese is matched by script (China → Simplified)',
  },
  {
    languages: ['pt-PT'],
    locale: 'pt-BR',
    label: 'Português (Brasil)',
    rule: 'the closest regional variant stands in for a missing one',
  },
  {
    languages: ['en-AU'],
    locale: 'en-GB',
    label: 'English (UK)',
    rule: 'the closest English variant',
  },
];
const DASHBOARD_FALLBACK = {
  languages: ['ja', 'ko'],
  locale: 'en',
  label: 'English',
  rule: 'no supported preference falls back to English',
};

if (!artifactsDir) {
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
fs.mkdirSync(artifactsDir, { recursive: true });

const result = { ok: false, url, steps: [], failures: [] };
function record(step, ok, note) {
  result.steps.push({ step, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${note ? ` :: ${note}` : ''}`);
  if (!ok) result.failures.push(`${step}: ${note ?? 'failed'}`);
}
function finish(code) {
  result.ok = code === 0;
  fs.writeFileSync(
    path.join(artifactsDir, 'result.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  process.exit(code);
}
function setupFailure(note) {
  record('setup', false, note);
  finish(3);
}

// --- catalogs -------------------------------------------------------------
// A message as the deployed app shows it in `locale`: the locale's catalog,
// then its parent's (en-GB ships only the words that differ from en), then
// the English source. The English catalog holds source entries
// ({ defaultMessage }); every other catalog holds plain strings.
const catalogCache = new Map();
function catalog(dir, locale) {
  const file = path.join(repoRoot, dir, `${locale}.json`);
  if (!catalogCache.has(file))
    catalogCache.set(
      file,
      fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {},
    );
  return catalogCache.get(file);
}
function message(dir, locale, id) {
  for (const tag of [locale, locale.split('-')[0], 'en']) {
    const entry = catalog(dir, tag)[id];
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry.defaultMessage === 'string')
      return entry.defaultMessage;
  }
  throw new Error(`no catalog entry ${id} for ${locale} in ${dir}`);
}
const appMessage = (locale, id) =>
  message('apps/interviewer/src/locales', locale, id);
const interviewMessage = (locale, id) =>
  message('packages/interview/src/locales', locale, id);

// The archive is BUILT from the reviewable fixture at run time — a committed
// binary could silently drift from the JSON reviewers inspect.
let protocolPath;
try {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('protocol.json', fs.readFileSync(FIXTURE, 'utf8'));
  protocolPath = path.join(artifactsDir, 'release-smoke.netcanvas');
  fs.writeFileSync(
    protocolPath,
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
  // Fail at setup, not mid-walk, if a catalog the walk reads has moved.
  for (const { locale } of [...DASHBOARD_CASES, DASHBOARD_FALLBACK]) {
    appMessage(locale, 'interviewer.topActionBar.settings');
    appMessage(locale, 'interviewer.settingsDialog.language');
    appMessage(locale, 'interviewer.language.label');
  }
  interviewMessage('es', 'interview.navigation.nextStep');
} catch (err) {
  setupFailure(
    `setup failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

// Every non-whitelisted console error is reportable under the gate's shared
// journey contract; one list collects them from every profile.
const consoleErrors = [];
const NOISE = [
  /frame-ancestors.*ignored when delivered via a <meta> element/i,
  // Cloudflare's injected beacon: the refused INLINE bootstrap and the
  // blocked cloudflareinsights.com load. Any OTHER CSP violation surfaces.
  /Refused to execute inline script.*Content Security Policy/i,
  /cloudflareinsights/i,
  /ph-relay\.networkcanvas\.com/i,
];

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  setupFailure(
    `browser setup failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

// The page the walk is on, for the watchdog's and the failure's screenshot.
let page;
const watchdog = setTimeout(async () => {
  try {
    await page.screenshot({
      path: path.join(artifactsDir, 'watchdog-timeout.png'),
    });
    record(
      'watchdog',
      false,
      `no completion within ${timeoutMs}ms at ${page.url()}`,
    );
  } catch {
    record(
      'watchdog',
      false,
      `no completion within ${timeoutMs}ms (page gone)`,
    );
  }
  finish(2);
}, timeoutMs);

let shots = 0;
async function shot(name) {
  shots += 1;
  // Let the stage's entrance animation finish, so the capture shows it.
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(
      artifactsDir,
      `${String(shots).padStart(2, '0')}-${name}.png`,
    ),
  });
}

// A fresh profile whose browser asks for `languages`, most preferred first.
// Playwright's `locale` sets navigator.language and Accept-Language for the
// first; the init script gives navigator.languages the whole list before any
// app code runs.
async function openProfile(languages) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: languages[0],
  });
  await context.addInitScript((list) => {
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => [...list],
      configurable: true,
    });
    Object.defineProperty(Navigator.prototype, 'language', {
      get: () => list[0],
      configurable: true,
    });
  }, languages);
  // The relay is blocked in every context: analytics defaults on, and a fresh
  // profile would otherwise emit real events to product analytics.
  await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = `${m.text()} ${m.location()?.url ?? ''}`;
    if (NOISE.some((p) => p.test(text))) return;
    consoleErrors.push(`[${languages.join(',')}] ${text.trim()}`);
  });
  page.on('pageerror', (err) =>
    consoleErrors.push(`[${languages.join(',')}] pageerror: ${err.message}`),
  );
  return context;
}

const htmlLang = () => page.locator('html').getAttribute('lang');
const settingsTrigger = () => page.getByTestId('settings-trigger');
const interviewMain = () =>
  page.locator('main[data-theme-interview]:not([aria-busy="true"])');
const stageStep = () => page.locator('[data-stage-step]');

// Settings → Language: the app-language picker, named in the app's language.
async function openLanguageSettings(locale) {
  await settingsTrigger().click();
  await page
    .getByRole('tab', {
      name: appMessage(locale, 'interviewer.settingsDialog.language'),
      exact: true,
    })
    .click();
  const picker = page.getByRole('combobox', {
    name: appMessage(locale, 'interviewer.language.label'),
    exact: true,
  });
  await expect(picker).toBeVisible();
  return picker;
}

// The app's language as a researcher sees it: <html lang>, the top bar's
// Settings name, and the picker resting on Automatic naming that language.
async function readDashboard(expected) {
  await expect(settingsTrigger()).toBeVisible({ timeout: 20_000 });
  const lang = await htmlLang();
  const settingsName = await settingsTrigger().getAttribute('aria-label');
  const picker = await openLanguageSettings(expected.locale);
  const picked = await picker.evaluate((el) => ({
    value: el.value,
    text: el.selectedOptions[0]?.textContent ?? '',
  }));
  await page.keyboard.press('Escape');
  const ok =
    lang === expected.locale &&
    settingsName ===
      appMessage(expected.locale, 'interviewer.topActionBar.settings') &&
    picked.value === '__automatic' &&
    picked.text.includes(expected.label);
  return {
    ok,
    note: `${JSON.stringify(expected.languages)} → lang=${lang} Settings=${JSON.stringify(settingsName)} picker=${picked.value} ${JSON.stringify(picked.text)} (expected ${expected.locale}: ${expected.rule})`,
  };
}

// Import the fixture and wait for the toast, in the app's language.
async function importFixture(appLocale) {
  await page.getByTestId('protocol-import-input').setInputFiles(protocolPath);
  await expect(
    page
      .getByText(
        appMessage(appLocale, 'interviewer.protocolImport.protocolImported'),
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

// Deck-settle click: the spring-animated deck swallows early clicks — require
// SUSTAINED stability (three identical samples 250 ms apart), as the other
// walkers do.
async function clickSettled(locator) {
  await expect(locator).toBeVisible();
  let stable = 0;
  let last = null;
  for (let i = 0; i < 30 && stable < 3; i += 1) {
    const b = await locator.boundingBox();
    stable = b && last && b.x === last.x && b.y === last.y ? stable + 1 : 0;
    last = b;
    await page.waitForTimeout(250);
  }
  if (stable < 3)
    throw new Error('deck never settled after 30 stability samples');
  await locator.click();
}

// Start an interview from home; returns its session id.
async function startInterview(appLocale, caseId) {
  await clickSettled(
    page.getByRole('button', {
      name: appMessage(appLocale, 'interviewer.deckSlotCard.startNewInterview'),
      exact: true,
    }),
  );
  await page.getByTestId('new-session-case-id').fill(caseId);
  await page.getByTestId('new-session-submit').click();
  await expect(page).toHaveURL(/\/interview\/[^/?]+$/, { timeout: 20_000 });
  await expect(interviewMain()).toBeVisible({ timeout: 20_000 });
  await expect(stageStep()).toHaveAttribute('data-stage-step', '0');
  return page.url().split('/interview/')[1];
}

// The interview as a participant meets it on the language chooser: its lang,
// the chooser's name (the protocol's own text), the option resting selected,
// and the built-in Next control's name.
async function readInterview() {
  const chooser = page.getByRole('listbox');
  await expect(chooser).toBeVisible({ timeout: 20_000 });
  return {
    lang: await interviewMain().getAttribute('lang'),
    chooser: await chooser.evaluate(
      (el) =>
        el.getAttribute('aria-label') ??
        document.getElementById(el.getAttribute('aria-labelledby') ?? '')
          ?.textContent ??
        '',
    ),
    selected: await chooser
      .getByRole('option', { selected: true })
      .allTextContents(),
    next: await page.getByTestId('next-button').getAttribute('aria-label'),
    app: await htmlLang(),
  };
}

// The tab's stored participant choices, and the stored session row.
const storedChoices = () =>
  page.evaluate(
    (prefix) =>
      Object.entries(sessionStorage).filter(([key]) => key.startsWith(prefix)),
    CHOICE_KEY_PREFIX,
  );
function readSession(sessionId) {
  return page.evaluate(
    async ({ dbName, id }) => {
      const listed = (await indexedDB.databases()).some(
        (d) => d.name === dbName,
      );
      if (!listed) return { missingDatabase: dbName };
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const row = await new Promise((res, rej) => {
        const rq = db
          .transaction('sessions', 'readonly')
          .objectStore('sessions')
          .get(id);
        rq.onsuccess = () => res(rq.result ?? null);
        rq.onerror = () => rej(rq.error);
      });
      db.close();
      return {
        found: row !== null,
        currentStep: row?.currentStep ?? null,
        keys: row ? Object.keys(row) : [],
      };
    },
    { dbName: DB_NAME, id: sessionId },
  );
}

const nextStepName = (locale) =>
  interviewMessage(locale, 'interview.navigation.nextStep');

// One fresh profile per browser: import the fixture, start an interview and
// read it on the language chooser before anyone chooses.
async function interviewCase(step, languages, expected, appLocale) {
  const context = await openProfile(languages);
  await page.goto(url);
  await importFixture(appLocale);
  await startInterview(appLocale, `lang-${languages.join('-')}`);
  const seen = await readInterview();
  await shot(step);
  record(
    step,
    seen.lang === expected.lang &&
      seen.chooser === expected.chooser &&
      seen.selected.length === 1 &&
      seen.selected[0] === expected.selected &&
      seen.next === nextStepName(expected.builtIn) &&
      seen.app === appLocale,
    `${JSON.stringify(languages)} → interview lang=${seen.lang} chooser=${JSON.stringify(seen.chooser)} selected=${JSON.stringify(seen.selected)} Next=${JSON.stringify(seen.next)} app lang=${seen.app} (expected interview ${expected.lang}, built-in text ${expected.builtIn}, app ${appLocale}: ${expected.rule})`,
  );
  await context.close();
}

// --- the walk -------------------------------------------------------------
try {
  // Phase 1: the researcher-facing app negotiates the browser's languages.
  const negotiated = [];
  for (const expected of DASHBOARD_CASES) {
    const context = await openProfile(expected.languages);
    await page.goto(url);
    const seen = await readDashboard(expected);
    negotiated.push(seen);
    await shot(`dashboard-${expected.locale}`);
    await context.close();
  }
  record(
    'dashboard-negotiated',
    negotiated.every((n) => n.ok),
    negotiated.map((n) => `${n.ok ? 'ok' : 'WRONG'} ${n.note}`).join(' ; '),
  );
  {
    const context = await openProfile(DASHBOARD_FALLBACK.languages);
    await page.goto(url);
    const seen = await readDashboard(DASHBOARD_FALLBACK);
    await shot('dashboard-fallback');
    record('dashboard-fallback', seen.ok, seen.note);
    await context.close();
  }

  // Phase 2 (a Spanish-speaking browser): onboarding negotiates too, a
  // Settings choice replaces negotiation for the app alone, and an
  // interview negotiates for itself until the participant chooses.
  const context = await openProfile(['es-MX']);
  await page.goto(new URL('/welcome', url).href);
  const getStarted = page.getByRole('button', {
    name: appMessage('es', 'interviewer.onboardingScreen.getStarted'),
    exact: true,
  });
  await expect(getStarted).toBeVisible({ timeout: 20_000 });
  const welcomeLang = await htmlLang();
  await shot('welcome-es');
  record(
    'welcome-negotiated',
    welcomeLang === 'es',
    `/welcome shows "${appMessage('es', 'interviewer.onboardingScreen.getStarted')}" with lang=${welcomeLang} before any setup`,
  );

  await page.goto(url);
  await expect(settingsTrigger()).toHaveAttribute(
    'aria-label',
    appMessage('es', 'interviewer.topActionBar.settings'),
    { timeout: 20_000 },
  );
  const picker = await openLanguageSettings('es');
  await picker.focus();
  await picker.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('Escape');
  const storedAppChoice = await page.evaluate(
    (key) => localStorage.getItem(key),
    APP_CHOICE_KEY,
  );
  await expect(settingsTrigger()).toHaveAttribute('aria-label', 'Settings');
  await shot('app-choice-en');
  record(
    'app-choice-applies',
    storedAppChoice === 'en',
    `Settings → Language → English: lang=en, top bar "Settings"; stored ${APP_CHOICE_KEY}=${JSON.stringify(storedAppChoice)}`,
  );

  await page.reload();
  await expect(settingsTrigger()).toHaveAttribute('aria-label', 'Settings', {
    timeout: 20_000,
  });
  const reloadedLang = await htmlLang();
  record(
    'app-choice-persists',
    reloadedLang === 'en',
    `after a reload the app stays English (lang=${reloadedLang}) on a Spanish browser`,
  );

  await importFixture('en');
  const firstId = await startInterview('en', 'lang-first');
  const first = await readInterview();
  await shot('interview-es-with-app-en');
  record(
    'interview-ignores-app-choice',
    first.lang === 'es' &&
      first.chooser === 'Elige un idioma' &&
      first.selected.length === 1 &&
      first.selected[0] === 'español' &&
      first.next === nextStepName('es') &&
      first.app === 'en',
    `app chosen English, browser es-MX → interview lang=${first.lang} chooser=${JSON.stringify(first.chooser)} selected=${JSON.stringify(first.selected)} Next=${JSON.stringify(first.next)} app lang=${first.app} (expected Spanish throughout the interview, the app still English)`,
  );

  await page
    .getByRole('listbox', { name: 'Elige un idioma', exact: true })
    .getByRole('option')
    .filter({ hasNotText: 'español' })
    .click();
  await expect(interviewMain()).toHaveAttribute('lang', 'en-US');
  await expect(
    page.getByRole('listbox', { name: 'Choose a language', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('next-button')).toHaveAttribute(
    'aria-label',
    nextStepName('en'),
  );
  await page.getByTestId('next-button').click();
  await expect(stageStep()).toHaveAttribute('data-stage-step', '1', {
    timeout: 20_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Release smoke' }),
  ).toBeVisible();
  await shot('chooser-choice-en');
  record(
    'chooser-choice-applies',
    true,
    'choosing English on the chooser switched the interview (lang=en-US, chooser "Choose a language", Next in English) and the next stage shows the protocol’s English text',
  );

  // Step writes are fire-and-forget: wait for the stored step before the
  // reload, so the reload proves the choice, not a lost write.
  await expect
    .poll(async () => (await readSession(firstId)).currentStep, {
      timeout: 15_000,
    })
    .toBe(1);
  await page.reload();
  await expect(interviewMain()).toBeVisible({ timeout: 20_000 });
  await expect(stageStep()).toHaveAttribute('data-stage-step', '1', {
    timeout: 20_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Release smoke' }),
  ).toBeVisible();
  const reloadedInterviewLang = await interviewMain().getAttribute('lang');
  const choices = await storedChoices();
  const row = await readSession(firstId);
  record(
    'chooser-choice-persists',
    reloadedInterviewLang === 'en-US' &&
      choices.length === 1 &&
      choices[0][0] === `${CHOICE_KEY_PREFIX}${firstId}` &&
      choices[0][1] === 'en-US' &&
      row.found &&
      !row.keys.includes('locale') &&
      !row.keys.includes('localePreference'),
    `after a reload the interview stays English (lang=${reloadedInterviewLang}); tab choices=${JSON.stringify(choices)}; stored session keys=${JSON.stringify(row.keys)} (the choice is never stored with the session)`,
  );

  await page.goto(url);
  await startInterview('en', 'lang-second');
  const second = await readInterview();
  await shot('second-interview-es');
  record(
    'new-interview-negotiates-again',
    second.lang === 'es' &&
      second.selected.length === 1 &&
      second.selected[0] === 'español' &&
      second.next === nextStepName('es'),
    `the next interview in the same tab opens on the browser's language again: lang=${second.lang} selected=${JSON.stringify(second.selected)} Next=${JSON.stringify(second.next)} (the first participant's English choice stays with that interview)`,
  );

  await page.goto(url);
  const automatic = await openLanguageSettings('en');
  await automatic.focus();
  await automatic.selectOption('__automatic');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.keyboard.press('Escape');
  const clearedChoice = await page.evaluate(
    (key) => localStorage.getItem(key),
    APP_CHOICE_KEY,
  );
  await page.reload();
  await expect(settingsTrigger()).toHaveAttribute(
    'aria-label',
    appMessage('es', 'interviewer.topActionBar.settings'),
    { timeout: 20_000 },
  );
  const automaticLang = await htmlLang();
  await shot('automatic-es');
  record(
    'automatic-restores-negotiation',
    clearedChoice === null && automaticLang === 'es',
    `Settings → Language → Automatic: stored ${APP_CHOICE_KEY}=${JSON.stringify(clearedChoice)}; after a reload lang=${automaticLang} (the browser's Spanish again)`,
  );
  await context.close();

  // Phase 3: an interview negotiates the protocol's translation and its own
  // built-in text separately, each the best it has for this browser.
  await interviewCase(
    'interview-second-preference',
    ['fr-FR', 'es'],
    {
      lang: 'es',
      chooser: 'Elige un idioma',
      selected: 'español',
      builtIn: 'fr',
      rule: 'the protocol has no French, so its Spanish (the second preference) is used; the built-in text has French',
    },
    'fr',
  );
  await interviewCase(
    'interview-builtins-follow-browser',
    ['de-AT'],
    {
      lang: 'en-US',
      chooser: 'Choose a language',
      selected: 'American English',
      builtIn: 'de',
      rule: 'the protocol has no German, so its default English is used; the built-in text has German',
    },
    'de',
  );
  await interviewCase(
    'interview-fallback',
    ['ja'],
    {
      lang: 'en-US',
      chooser: 'Choose a language',
      selected: 'American English',
      builtIn: 'en',
      rule: 'nothing matches Japanese, so both fall back to English',
    },
    'en',
  );

  record(
    'console-errors',
    consoleErrors.length === 0,
    consoleErrors.length
      ? `${consoleErrors.length} non-whitelisted console error(s): ${consoleErrors.slice(0, 3).join(' || ').slice(0, 400)}`
      : 'no non-whitelisted console errors across the walk',
  );

  clearTimeout(watchdog);
  await browser.close();
  finish(result.failures.length ? 1 : 0);
} catch (err) {
  clearTimeout(watchdog);
  record('walk', false, err instanceof Error ? err.message : String(err));
  try {
    await page.screenshot({ path: path.join(artifactsDir, 'failure.png') });
  } catch {
    /* page may be gone */
  }
  await browser.close().catch(() => {});
  finish(1);
}
