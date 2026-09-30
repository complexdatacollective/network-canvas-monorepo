import { expect, waitFor } from 'storybook/test';

/**
 * Resolves once a row dialog has finished appearing.
 *
 * It fades in with CSS transitions, which the preview's `AnimationProvider`
 * does not reach: that disables Motion and Base UI's bookkeeping, not raw CSS.
 * The a11y check runs the moment a play returns, so without waiting the dialog
 * is measured half-faded and its controls read as contrast failures at
 * whatever opacity the run happened to reach.
 *
 * A precondition rather than an oracle: it polls a real condition, and a
 * dialog that never opens still fails the assertions after it. Closing the gap
 * in the preview, so that no play has to know this, is a note for the shared
 * step.
 *
 * It sits under the Dyad Census because that editor lands first and the family
 * rule is that the first editor owns what its siblings also need.
 */
export const storyDialogVisible = async (
  dialog: HTMLElement,
): Promise<void> => {
  await waitFor(() =>
    expect(dialog.getAnimations({ subtree: true })).toHaveLength(0),
  );
};
