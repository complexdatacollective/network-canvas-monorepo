import { screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

import type { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';

/**
 * Says what a stage being created works with.
 *
 * The first thing a researcher does to a new name generator, and a
 * prerequisite for the sections that describe its people — a panel's filter
 * asks about a node type, so the panels section waits for one.
 */
export async function chooseNodeType(
  harness: ReturnType<typeof renderStageEditor>,
  typeId: string,
): Promise<void> {
  await harness.user.click(screen.getByRole('radio', { name: typeId }));
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: 'Side panels' })).toBeEnabled(),
  );
}

/**
 * Adds one side panel drawing on the interview's own network, the way a
 * researcher does: switch the capability on, create a panel, name it, save the
 * row.
 *
 * Shared by the two name generators that HAVE panels so both prove the same
 * interaction, rather than each proving its own approximation of it.
 */
export async function addInterviewNetworkPanel(
  harness: ReturnType<typeof renderStageEditor>,
  title: string,
): Promise<void> {
  await harness.user.click(screen.getByRole('switch', { name: 'Side panels' }));
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new panel' }),
  );
  const dialog = within(await screen.findByRole('dialog'));
  await writeInto(
    harness,
    dialog.getByRole('textbox', { name: 'Panel title' }),
    title,
  );
  await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
}
