import { expect, test } from '../fixtures/test.js';

const PIN = '12345678';
const PASSPHRASE = 'correct-horse-battery-1';

test.describe('vault lifecycle', () => {
  test('PIN enrolment locks on reload and unlocks with the PIN', async ({
    vault,
    page,
    capture,
  }) => {
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
  });

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

  test('reset app data returns to an unconfigured state', async ({
    vault,
    page,
  }) => {
    await vault.enrolPin(PIN);
    await page.reload();
    await page.getByTestId('reset-app-data').click();
    // The confirm dialog stacks on top of the still-open "Welcome back" lock
    // dialog (it doesn't close itself until revoke() completes), so both are
    // simultaneously role="dialog" — scope by name to disambiguate.
    const dialog = page.getByRole('dialog', { name: 'Reset all app data?' });
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('dialog-primary').click();
    // Back to a usable (unconfigured/none) Home — no lock screen.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
