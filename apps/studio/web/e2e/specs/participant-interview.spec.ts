import { expect, type Page, test } from '@playwright/test';

type Links = { readonly managed: string; readonly anonymous: string };

const readLinks = (): Links => {
  const raw = process.env.STUDIO_E2E_LINKS;
  if (raw === undefined) {
    throw new Error(
      'STUDIO_E2E_LINKS is required: the JSON scripts/e2e-participant-links.ts prints',
    );
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('managed' in parsed) ||
    !('anonymous' in parsed) ||
    typeof parsed.managed !== 'string' ||
    typeof parsed.anonymous !== 'string'
  ) {
    throw new Error(`STUDIO_E2E_LINKS is not a pair of links: ${raw}`);
  }
  return { managed: parsed.managed, anonymous: parsed.anonymous };
};

const LINKS = readLinks();

const stage = (page: Page) => page.locator('[data-stage-step]');

async function waitForStage(page: Page): Promise<void> {
  await expect(page.locator('main[data-theme-interview]')).toBeVisible();
  await expect(stage(page)).toHaveAttribute('data-stage-step', /\d+/);
}

async function next(page: Page): Promise<void> {
  const before = await stage(page).getAttribute('data-stage-step');
  await page.getByTestId('next-button').click();
  await expect
    .poll(() => stage(page).getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .not.toBe(before);
}

async function quickAdd(page: Page, name: string): Promise<void> {
  const toggle = page.getByTestId('quick-add-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }
  const input = page.getByTestId('quick-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByRole('option', { name })).toBeVisible();
}

const finishedNotice = (page: Page) =>
  page.getByRole('heading', { name: "You've finished this interview" });

async function interviewToFinish(page: Page, link: string): Promise<void> {
  await page.goto(`/enter/${link}`);
  await expect(page).toHaveURL(/\/session\/[^/]+$/);
  await waitForStage(page);
  await expect(
    page.getByRole('heading', { name: 'Welcome' }).first(),
  ).toBeVisible();
  await next(page);

  const egoName = page.locator('[data-field-name="ego_name"] input');
  await egoName.fill('Ada');
  await egoName.blur();
  await expect(page.getByTestId('next-button')).toHaveClass(/bg-success/);
  await next(page);

  await quickAdd(page, 'Grace');
  const sessionUrl = page.url();
  await page.reload();
  await waitForStage(page);
  expect(page.url()).toBe(sessionUrl);
  await expect(stage(page)).toHaveAttribute('data-stage-step', '2');
  await expect(page.getByRole('option', { name: 'Grace' })).toBeVisible();
  await next(page);

  await next(page);

  await expect(
    page.getByRole('heading', { name: 'Finish Interview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Finish Interview' }).click();
  await expect(finishedNotice(page)).toBeVisible();
}

test.describe('a participant on the built stack', () => {
  for (const kind of ['managed', 'anonymous'] as const) {
    test(`completes an interview from the ${kind} link and finds it finished on return`, async ({
      page,
    }) => {
      const requests: string[] = [];
      page.on('request', (request) => {
        requests.push(new URL(request.url()).pathname);
      });

      await interviewToFinish(page, LINKS[kind]);

      await page.goto(`/enter/${LINKS[kind]}`);
      await expect(finishedNotice(page)).toBeVisible();

      expect(requests.filter((path) => path.startsWith('/api/auth'))).toEqual(
        [],
      );
    });
  }
});
