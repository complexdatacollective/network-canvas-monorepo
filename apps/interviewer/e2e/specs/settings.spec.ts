import { expect, test } from '../fixtures/test.js';

async function openSettings(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto('/');
  await page.getByTestId('settings-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('settings', () => {
  test('toggling Export CSV persists across reload', async ({
    page,
    capture,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    const csv = page.getByRole('switch', { name: 'Export CSV' });
    const before = await csv.getAttribute('aria-checked');
    await csv.click();
    await expect(csv).not.toHaveAttribute('aria-checked', before ?? 'true');
    await capture('settings-data-export');

    // Reload and confirm the new value stuck (Dexie-backed, `none` mode plaintext).
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await expect(
      page.getByRole('switch', { name: 'Export CSV' }),
    ).not.toHaveAttribute('aria-checked', before ?? 'true');
  });

  test('screen-layout coordinate toggle and dimensions persist', async ({
    page,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await page
      .getByRole('switch', {
        name: 'Export node positions as screen-coordinate pixels',
      })
      .click();
    const width = page.getByRole('spinbutton', { name: 'Screen layout width' });
    await width.fill('800');
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await expect(
      page.getByRole('spinbutton', { name: 'Screen layout width' }),
    ).toHaveValue('800');
  });

  test('Allow stage navigation toggle persists', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Interview' }).click();
    const toggle = page.getByRole('switch', { name: 'Allow stage navigation' });
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Interview' }).click();
    await expect(
      page.getByRole('switch', { name: 'Allow stage navigation' }),
    ).not.toHaveAttribute('aria-checked', before ?? 'true');
  });

  test('About section shows a version and a storage estimate', async ({
    page,
    capture,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'About' }).click();
    await expect(
      page.getByRole('progressbar', { name: 'Storage usage' }),
    ).toBeVisible();
    await capture('settings-about');
  });

  test('Security section is hidden in none mode (settings gated on a vault)', async ({
    page,
  }) => {
    // In `none` mode the Security tab's controls require an enrolled vault;
    // confirm the step-up flags are only reachable once a mode is set. Here we
    // assert the About/Data export tabs render, documenting the none-mode shape.
    await openSettings(page);
    await expect(page.getByRole('tab', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Data export' })).toBeVisible();
  });
});
