import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Gives a write the app should have refused time to reach IndexedDB before a
 * caller asserts it did not.
 *
 * Only for a refusal that has no write of its own to wait behind, such as a
 * stage editor that will not save (`settleAfterRefusal`, in read-store.ts,
 * covers the guards that sit before a store write). Pair it with an assertion
 * that the refusal was observed, so a save that never ran cannot pass.
 */
export async function allowErroneousWriteToLand(
  page: Page,
  ms = 1_000,
): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Observe a refusal and acknowledge it.
 *
 * The observation matters as much as the acknowledgement: asserting only that
 * state is unchanged would also pass if the action never ran at all (a broken
 * selector, a control that moved). This checks that the refusal really
 * happened, and that it is an ACKNOWLEDGEMENT — a guard that regressed into a
 * destructive confirm would offer a cancel action, and fails here.
 *
 * It returns as soon as the dialog is gone, and that moment proves NOTHING
 * about an erroneously accepted write: the write may not have reached
 * IndexedDB yet, or it may have got there during the several round-trips this
 * spends dismissing the dialog. Either way every "the write did not happen"
 * condition can already read as true, so a caller must not go straight from
 * here to a "nothing changed" assertion. Call `settleAfterRefusal`
 * (helpers/read-store.ts) in between: it waits for a LATER write of its own to
 * become durable, which is what proves the queue behind it has drained.
 *
 * @param dialog The guard dialog, located by its accessible name.
 */
export async function acknowledgeRefusal(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  // An acknowledge dialog has exactly one action, "OK", and no way to proceed.
  await expect(dialog.getByTestId('dialog-cancel')).toHaveCount(0);
  const acknowledge = dialog.getByTestId('dialog-primary');
  await expect(acknowledge).toHaveText('OK');
  await acknowledge.click();
  await expect(dialog).toHaveCount(0);
}
