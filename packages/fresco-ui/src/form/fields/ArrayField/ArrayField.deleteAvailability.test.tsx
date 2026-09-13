import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import ArrayField, { type ArrayFieldItemProps } from './ArrayField';

type Row = { id: string; label: string };

const promptLabel = {
  id: 'test.arrayField.deleteAvailability.prompt',
  defaultMessage: 'prompt',
};

function LabelledRow({ item, onDelete }: ArrayFieldItemProps<Row>) {
  return (
    <div>
      <span>{item.label}</span>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove ${item.label ?? ''}`}
        >
          Remove
        </button>
      )}
    </div>
  );
}

/**
 * A list whose caller can withdraw editing while a confirmation is open —
 * a section whose prerequisite has just been unset, a lock lost to a
 * collaborator.
 *
 * Withdrawn through a handle rather than through a control on the page,
 * because a modal confirmation makes the rest of the document inert: the very
 * thing that makes this window hard to reach from inside the app is what a
 * researcher-driven control could not reach here either.
 */
let stopAcceptingChanges: () => void;

function Host() {
  const [rows, setRows] = useState<Row[]>([
    { id: 'alpha', label: 'Alpha' },
    { id: 'bravo', label: 'Bravo' },
  ]);
  const [readOnly, setReadOnly] = useState(false);
  stopAcceptingChanges = () => setReadOnly(true);

  return (
    <ArrayField<Row>
      value={rows}
      getId={(item) => item.id}
      onChange={(next) => setRows(next ?? [])}
      itemComponent={LabelledRow}
      itemLabel={promptLabel}
      readOnly={readOnly}
      confirmDelete
    />
  );
}

describe('a delete confirmation the list stops accepting', () => {
  it('removes nothing, and says so, when the list goes read-only mid-confirm', async () => {
    const user = userEvent.setup();
    render(
      <DialogProvider>
        <Host />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Bravo' }));
    const dialog = await screen.findByRole('dialog');

    // The list stops accepting changes while the confirmation sits open. The
    // row is untouched — only what may be done to it has changed.
    act(() => {
      stopAcceptingChanges();
    });

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete prompt' }),
    );

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so nothing was removed. Try again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    // Still there, and the confirmation is still open rather than closing over
    // a removal that never happened.
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('removes the row when the list is still accepting changes', async () => {
    const user = userEvent.setup();
    render(
      <DialogProvider>
        <Host />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Bravo' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete prompt' }),
    );

    // Which is what makes the refusal above a refusal and not a list that
    // never deletes anything.
    await waitFor(() => expect(screen.queryByText('Bravo')).toBeNull());
  });
});
