import { expect, type Locator, type Page } from '@playwright/test';

/**
 * How long an erroneously-accepted write is given to reach IndexedDB before a
 * caller asserts it did not.
 *
 * This is the one place in the Architect suite where `waitForTimeout` is the
 * oracle rather than a papered-over race. Architect's guards return BEFORE
 * dispatching, so a refused edit produces no store change, no announcement and
 * no DOM transition — there is nothing to await. Every "the write did not
 * happen" condition is already true at 0 ms, so a web-first assertion would
 * pass instantly and could never catch the regression these tests exist for:
 * the dialog is shown and the destructive action proceeds anyway.
 *
 * A 1-second window comfortably covers the accepted path, whose commit reaches
 * the durable row well inside `readProtocolJson`'s own 5-second poll.
 */
const SETTLE_MS = 1_000;

/**
 * Observe a refusal, acknowledge it, and let any erroneously-accepted write
 * land before the caller asserts nothing changed.
 *
 * The observation half matters as much as the wait: asserting only that state
 * is unchanged would also pass if the action never ran at all (a broken
 * selector, a control that moved). This checks that the refusal really
 * happened, and that it is an ACKNOWLEDGEMENT — a guard that regressed into a
 * destructive confirm would offer a cancel action, and fails here.
 *
 * @param page   The Architect page under test.
 * @param dialog The guard dialog, located by its accessible name.
 */
export async function acknowledgeRefusal(
  page: Page,
  dialog: Locator,
): Promise<void> {
  await expect(dialog).toBeVisible();
  // An acknowledge dialog has exactly one action, "OK", and no way to proceed.
  await expect(dialog.getByTestId('dialog-cancel')).toHaveCount(0);
  const acknowledge = dialog.getByTestId('dialog-primary');
  await expect(acknowledge).toHaveText('OK');
  await acknowledge.click();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(SETTLE_MS);
}
