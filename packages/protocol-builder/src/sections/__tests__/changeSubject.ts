import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/**
 * The researcher changes what a configured stage is about.
 *
 * Two gestures, not one: the pick, and the answer to the question the pick
 * raises. Every test that means "the researcher changed the type" goes through
 * both, so none of them can pass by a route the researcher does not have.
 *
 * Shared because the question belongs to the subject picker rather than to any
 * one section — a second copy of these two clicks is a second definition of
 * what changing a subject costs, and the two would drift.
 */
export const changeSubjectTo = async (
  user: ReturnType<typeof userEvent.setup>,
  typeLabel: string,
  confirmLabel = 'Change the node type',
): Promise<void> => {
  await user.click(screen.getByRole('radio', { name: typeLabel }));
  await user.click(await screen.findByRole('button', { name: confirmLabel }));
};
