import { expect, test } from '../fixtures/test.js';

const PIN = '12345678';
const PASSPHRASE = 'correct-horse-battery-1';

test.describe('vault lifecycle', () => {
  test(
    'PIN enrolment locks on reload and unlocks with the PIN',
    {
      tag: '@visual',
    },
    async ({ vault, page, capture }) => {
      await vault.enrolPin(PIN);
      // Reload drops the in-memory DEK → the app re-locks.
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Welcome back' }),
      ).toBeVisible();
      await capture('lock-screen-pin');
      await vault.unlockPin(PIN);
      // Unlocked → Home deck visible again.
      await expect(
        page.getByRole('heading', { name: 'Sample Protocol' }),
      ).toBeVisible({
        timeout: 15_000,
      });
    },
  );

  test('a wrong PIN is rejected', async ({ vault, page }) => {
    await vault.enrolPin(PIN);
    await page.reload();
    await vault.unlockPin('87654321');
    // Still locked (unlock failed) — the unlock dialog stays.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
  });

  test('passphrase enrolment and unlock', async ({ vault, page }) => {
    await vault.enrolPassphrase(PASSPHRASE);
    await page.reload();
    await vault.unlockPassphrase(PASSPHRASE);
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('refreshing an interview does not request authentication twice', async ({
    vault,
    interviewNav,
    page,
  }) => {
    await vault.enrolPin(PIN);
    await page.getByRole('button', { name: 'Previous protocol' }).click();
    await page.getByRole('button', { name: 'Install sample protocol' }).click();
    await expect(
      page.getByRole('button', { name: 'Start new interview' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Start new interview' }).click();
    await page.getByTestId('new-session-case-id').fill('refresh-regression');
    await page.getByTestId('new-session-submit').click();
    await vault.confirmPin(PIN);
    await expect(page).toHaveURL(/\/interview\//, { timeout: 15_000 });
    await interviewNav.waitForStage();

    const interviewUrl = page.url();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Recover by resetting' }),
    ).toHaveCount(0);

    // Changing the URL and forcing another load while still locked must not
    // turn the active interview's lock screen into a destructive reset route.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Recover by resetting' }),
    ).toHaveCount(0);
    await page.goto(interviewUrl);
    await vault.unlockPin(PIN);

    await expect(page).toHaveURL(interviewUrl);
    await interviewNav.waitForStage();
    await expect(
      page.getByRole('heading', { name: 'Confirm your identity' }),
    ).toHaveCount(0);
  });

  test('reset app data returns to an unconfigured state', async ({
    vault,
    page,
  }) => {
    await vault.enrolPin(PIN);
    await page.reload();
    await page.getByRole('button', { name: 'Recover by resetting' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset all app data?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Permanently delete' }).click();
    // Back to a usable (unconfigured/none) Home — no lock screen.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
