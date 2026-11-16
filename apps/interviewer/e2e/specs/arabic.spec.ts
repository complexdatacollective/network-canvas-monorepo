import type { Page } from '@playwright/test';

import { auditArabicPage } from '@codaco/e2e-helpers/arabic-page-audit';

import { expect, test } from '../fixtures/test.js';
import { clickWhenDeckSettles, waitForDeckToSettle } from '../helpers/deck.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

/**
 * Interviewer in Arabic, screen by screen, checked by `auditArabicPage`: each
 * screen is marked Arabic and laid out right to left, no box runs off the
 * window, and no Latin text is left untranslated or shown without its own
 * direction. Names someone wrote are Latin on purpose (“team-b!”), so a name
 * shown without its own direction is caught.
 *
 * The interview itself is in its protocol's language (this fixture's is
 * English), so inside it only Arabic text marked as another language is a
 * fault. The participant's names are typed in Latin letters: the language of
 * typed text is not recorded, so an Arabic name typed into an English
 * interview takes the interview's language, a known limit of the runtime
 * rather than of this app.
 *
 * The build served is the production one, where the pseudo-locale `ar-XB`
 * does not exist, so the run is in real Arabic.
 */
test.use({ locale: 'ar' });

/** Latin words Interviewer shows as they are in every language. */
const UNTRANSLATED = [
  'Network Canvas',
  'Interviewer',
  'Architect',
  'GraphML',
  'CSV',
  // The protocol file's extension, `.netcanvas`.
  'netcanvas',
];

/** Interviewer's own words for the controls the walk uses. */
const START_NEW_INTERVIEW = 'بدء مقابلة جديدة';
const SETTINGS = 'الإعدادات';
const FILTERS = 'عوامل التصفية';
const PROTOCOL = 'البروتوكول';

const CASE_ID = 'team-b!';

const audit = async (page: Page, screen: string) => {
  // Boxes are measured in the Arabic typeface, not a fallback.
  await page.evaluate(() => document.fonts.ready);
  expect
    .soft(
      await page.evaluate(auditArabicPage, { untranslated: UNTRANSLATED }),
      screen,
    )
    .toEqual([]);
};

/** Each tab of the settings dialog, opened from the home screen. */
const auditSettings = async (page: Page, when: string) => {
  await page.getByTestId('settings-trigger').click();
  const dialog = page.getByRole('dialog', { name: SETTINGS });
  await expect(dialog).toBeVisible();
  const tabs = dialog.getByRole('tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const tab = tabs.nth(index);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // The panel this tab shows; the one it replaces may still be leaving.
    const panel = await tab.getAttribute('aria-controls');
    expect(panel).not.toBeNull();
    await expect(page.locator(`[id="${panel}"]`)).toBeVisible();
    await expect(dialog.getByRole('tabpanel')).toHaveCount(1);
    await audit(page, `settings, ${when}: ${await tab.textContent()}`);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
};

test('every screen of Interviewer reads right to left in Arabic', async ({
  page,
  protocol,
  interviewNav,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/welcome');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await audit(page, 'welcome');

  // The sample protocol's card, before any protocol is imported.
  await page.goto('/');
  await waitForDeckToSettle(page.getByRole('heading', { level: 2 }).first());
  await audit(page, 'home, sample card');
  await auditSettings(page, 'no protocols');

  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  const startButton = page.getByRole('button', { name: START_NEW_INTERVIEW });
  await waitForDeckToSettle(startButton);
  await audit(page, 'home, with a protocol');
  await auditSettings(page, 'with a protocol');

  await clickWhenDeckSettles(startButton);
  const caseId = page.getByTestId('new-session-case-id');
  await expect(caseId).toBeVisible();
  await audit(page, 'new interview form');

  await caseId.fill(CASE_ID);
  await page.getByTestId('new-session-submit').click();
  await expect(page).toHaveURL(/\/interview\//);
  await interviewNav.waitForStage();
  await audit(page, 'interview: information');
  await interviewNav.next();
  await interviewNav.fillEgoName('team-b!');
  await audit(page, 'interview: form');
  await interviewNav.next();
  await interviewNav.quickAddNode('team-c!');
  await audit(page, 'interview: name generator');
  await interviewNav.next();
  await audit(page, 'interview: sociogram');
  await page.getByTestId('settings-button').click();
  await expect(page.getByTestId('exit-button')).toBeVisible();
  await audit(page, 'interview: settings');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('exit-button')).toBeHidden();
  await interviewNav.next();
  await interviewNav.finish();
  // The finished interview, shown in place with the app's way out.
  await expect(
    page.getByRole('heading', { name: 'Interview Finished' }),
  ).toBeVisible();
  await audit(page, 'interview: finished');

  await page.goto('/data');
  await expect(
    page.getByRole('cell', { name: CASE_ID, exact: true }),
  ).toBeVisible();
  await audit(page, 'interview data');

  // The filters, with the protocols to filter by.
  await page.getByTestId('data-filter-trigger').click();
  const filters = page.getByRole('dialog').filter({ hasText: FILTERS });
  await expect(filters).toBeVisible();
  await filters.getByRole('combobox').filter({ hasText: PROTOCOL }).click();
  await expect(
    page.getByRole('option', { name: LEAN_E2E_PROTOCOL_NAME }),
  ).toBeVisible();
  await audit(page, 'interview data: protocol filter');

  expect(errors).toEqual([]);
});
