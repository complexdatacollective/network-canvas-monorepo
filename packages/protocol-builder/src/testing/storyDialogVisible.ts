import { expect, waitFor } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
    // A frame never arrives in a tab the browser has hidden.
    setTimeout(resolve, 100);
  });

/** The element's opacity as drawn: its own times every ancestor's. */
const drawnOpacity = (element: Element): number => {
  let opacity = 1;
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    opacity *= Number(getComputedStyle(node).opacity);
  }
  return opacity;
};

/**
 * Resolves once a dialog has finished appearing.
 *
 * The dialog fades in under Motion and its controls run CSS transitions, and
 * the preview's `AnimationProvider` stops neither. The a11y check runs the
 * moment a play returns, so a dialog still part-way through is measured at
 * whatever opacity the run reached and its controls read as contrast failures.
 *
 * The fade starts from an effect, a frame after the dialog is in the document,
 * and Motion writes it as an inline opacity that `getAnimations()` cannot see.
 * Polling straight away therefore finds nothing running and resolves before
 * the fade begins. Waiting out the effects and a frame first means the poll
 * starts after the fade has, and reading the drawn opacity covers a fade
 * carried by an ancestor of the dialog as well as by the dialog.
 *
 * A precondition rather than an oracle: it polls a real condition, and a
 * dialog that never opens still fails the assertions after it.
 */
export const storyDialogVisible = async (
  dialog: HTMLElement,
): Promise<void> => {
  await awaitPassiveEffects();
  await nextFrame();
  await waitFor(() => {
    expect(drawnOpacity(dialog)).toBe(1);
    expect(dialog.getAnimations({ subtree: true })).toHaveLength(0);
  });
};
