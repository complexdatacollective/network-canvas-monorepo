import { expect, waitFor } from 'storybook/test';

/**
 * Resolves once a row dialog has finished fading in.
 *
 * The a11y addon runs axe the moment a play function returns, and a play that
 * opens a row dialog and reads what is inside it gets there in a few
 * milliseconds — while the dialog is still at a few percent opacity. axe reads
 * the composited colour, so the Save button's white-on-purple label is
 * measured as grey-on-lavender and reported as `color-contrast` against a
 * control whose contrast is fine.
 *
 * `.storybook/preview.tsx` already wraps every story in fresco-ui's
 * `AnimationProvider` with `disableAnimationsForAutomation`, which turns off
 * Motion and Base UI's animation bookkeeping. It does not turn off the panel's
 * own CSS fade, which is what this waits out. Closing that gap belongs in the
 * preview or in fresco-ui rather than in five stories, and is a note for the
 * shared step.
 *
 * A precondition rather than an oracle: it polls a real condition — the panel
 * the researcher is looking at is on screen — and a dialog that never opens
 * still fails the assertions after it.
 *
 * It sits under the Dyad Census because that editor lands first and the family
 * rule is that the first editor owns what its siblings also need.
 */
export const storyDialogVisible = async (
  dialog: HTMLElement,
): Promise<void> => {
  await waitFor(() => {
    expect(Number(getComputedStyle(dialog).opacity)).toBe(1);
  });
};
