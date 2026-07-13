import { expect, test } from '../fixtures/test.js';

// A plain browser tab is the app's `none` (unencrypted) mode: usable
// immediately, no lock screen. This is the real product state for an
// un-installed tab and the baseline all functional specs build on.
test.describe('none-mode smoke', () => {
  test('reaches Home with the sample protocol card and no lock screen', async ({
    page,
  }) => {
    await page.goto('/');

    // The sample-protocol deck card is present by default (aria-label).
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();

    // No lock screen: the "Welcome back" unlock dialog must be absent.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toHaveCount(0);
  });
});
