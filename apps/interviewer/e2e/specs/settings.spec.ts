import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';
import { settingsAboutMasks } from '../helpers/visual.js';

async function openSettings(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('settings-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('settings', () => {
  test(
    'toggling Export CSV persists across reload',
    {
      tag: '@visual',
    },
    async ({ page, capture }) => {
      await openSettings(page);
      await page.getByRole('tab', { name: 'Data export' }).click();
      const csv = page.getByRole('switch', { name: 'Export CSV' });
      const before = await csv.getAttribute('aria-checked');
      expect(before).not.toBeNull();
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
    },
  );

  test('screen-layout coordinate toggle and dimensions persist', async ({
    page,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    const screenLayoutToggle = page.getByRole('switch', {
      name: 'Export node positions as screen-coordinate pixels',
    });
    const before = await screenLayoutToggle.getAttribute('aria-checked');
    expect(before).not.toBeNull();
    await screenLayoutToggle.click();
    await expect(screenLayoutToggle).not.toHaveAttribute(
      'aria-checked',
      before ?? 'true',
    );
    const width = page.getByRole('spinbutton', { name: 'Screen layout width' });
    await width.fill('800');
    // The width control is bound to the persisted setting, so waiting for it to
    // read back 800 confirms the fire-and-forget updateSettings() write has
    // round-tripped before we reload (otherwise a slow IndexedDB write can lose
    // the value and make this persistence check flaky).
    await expect(width).toHaveValue('800');
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await expect(
      page.getByRole('switch', {
        name: 'Export node positions as screen-coordinate pixels',
      }),
    ).not.toHaveAttribute('aria-checked', before ?? 'true');
    await expect(
      page.getByRole('spinbutton', { name: 'Screen layout width' }),
    ).toHaveValue('800');
  });

  test('Allow stage navigation toggle persists', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Interview' }).click();
    const toggle = page.getByRole('switch', { name: 'Allow stage navigation' });
    const before = await toggle.getAttribute('aria-checked');
    expect(before).not.toBeNull();
    await toggle.click();
    // Confirm the optimistic flip landed before reloading — this both proves
    // the click registered and gives the async settings write time to commit,
    // avoiding a reload-vs-persist race.
    await expect(toggle).not.toHaveAttribute('aria-checked', before ?? 'true');
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Interview' }).click();
    await expect(
      page.getByRole('switch', { name: 'Allow stage navigation' }),
    ).not.toHaveAttribute('aria-checked', before ?? 'true');
  });

  test(
    'About section shows a version and a storage estimate',
    {
      tag: '@visual',
    },
    async ({ page, capture }) => {
      await openSettings(page);
      await page.getByRole('tab', { name: 'About' }).click();
      await expect(
        page.getByRole('progressbar', { name: 'Storage usage' }),
      ).toBeVisible();
      await capture('settings-about', { mask: settingsAboutMasks(page) });
    },
  );

  test('Security tab hides step-up controls when no vault is configured', async ({
    page,
  }) => {
    // NAV_ITEMS always includes the Security tab (it's not conditionally
    // rendered). SettingsDialog gates SecurityBehaviorControls (the step-up
    // toggles + auto-lock timeout) behind
    // `auth.kind === 'unlocked' && auth.mode !== 'none'`. A fresh browser tab
    // reaches Home without ever enrolling a vault, so `auth.kind` is
    // `'unconfigured'` there, not `'unlocked'` — the gate correctly hides
    // these controls. Showing them pre-setup would be dead UI:
    // `requireFreshUnlock` short-circuits with no vault, and the idle timer
    // never arms until a mode other than `'none'` is enrolled and unlocked,
    // so any value the researcher set here would just be discarded/
    // overwritten the moment they actually enrol. (An enrolled `mode:'none'`
    // vault is ALSO `kind:'unlocked'`, which is why the gate keeps the
    // `mode !== 'none'` clause — that case must stay hidden too.)
    await openSettings(page);
    await page.getByRole('tab', { name: 'Security' }).click();
    await expect(
      page.getByRole('switch', {
        name: 'Require unlock when entering an interview',
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('switch', {
        name: 'Require unlock when exiting an interview',
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('switch', {
        name: 'Require unlock before exporting data',
      }),
    ).toHaveCount(0);
    // The Security tab itself still renders real content, so it isn't empty.
    // With no vault, the authenticator section reads "Device lock" (the
    // no-lock variant — the same copy as an enrolled 'none' vault, since an
    // unconfigured tab has no authenticator to manage), and the device-reset
    // control reads "Reset device" (not "Revoke device lock" — there is no
    // lock to revoke).
    await expect(
      page.getByRole('heading', { name: 'Device lock' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reset device' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Revoke', exact: true }),
    ).toHaveCount(0);
  });

  test('Synthetic data tab sees a protocol imported just before Settings opened', async ({
    page,
    protocol,
  }) => {
    // End-to-end smoke of the import→Synthetic-data path: a protocol imported
    // through the UI is selectable in Settings → Synthetic data. The precise
    // race the fix targets (SettingsDialog only queried protocols on the
    // dialog's open transition, not on tab selection) is isolated
    // deterministically in the unit test (SettingsDialog.test.tsx, mocked
    // empty-then-populated listProtocols); here we simply wait for the import
    // to commit (the "Protocol imported" toast fires after the DB write) so the
    // path is exercised without depending on sub-second timing.
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await expect(page.getByText('Protocol imported')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId('settings-trigger').click();
    // Target the Settings dialog's own tab rather than a bare getByRole('dialog')
    // — right after an import a second (transient) dialog can coexist, so the
    // bare role is ambiguous. The tab is unique to the Settings dialog and its
    // click waits for the dialog to be open anyway.
    await expect(
      page.getByRole('tab', { name: 'Synthetic data' }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Synthetic data' }).click();

    const protocolSelect = page.getByRole('combobox', { name: 'Protocol' });
    await expect(protocolSelect.locator('option')).toHaveCount(1);
    await expect(protocolSelect.locator('option')).toHaveText(
      LEAN_E2E_PROTOCOL_NAME,
    );
    await expect(page.getByTestId('synthetic-generate')).toBeEnabled();
  });
});
