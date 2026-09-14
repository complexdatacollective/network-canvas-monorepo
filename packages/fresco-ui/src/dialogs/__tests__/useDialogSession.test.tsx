import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Dialog from '../Dialog';
import { useDialogSession } from '../useDialogSession';

/**
 * The shape the hook exists for: a dialog whose content is the thing being
 * edited, opened from a control that stays on screen.
 */
function RowEditorHost() {
  const { session, openSession, closeSession, onSessionExited } =
    useDialogSession<{ rowId: string }>();

  return (
    <>
      <button type="button" onClick={() => openSession({ rowId: 'row-1' })}>
        Edit row
      </button>
      <button type="button" onClick={() => openSession({ rowId: 'row-2' })}>
        Edit other row
      </button>
      {session !== null && (
        <Dialog
          open={session.open}
          onExitComplete={onSessionExited}
          closeDialog={closeSession}
          title={`Editing ${session.rowId}`}
        >
          Content
        </Dialog>
      )}
    </>
  );
}

describe('useDialogSession', () => {
  /**
   * The defect it exists to prevent: a dialog rendered only while there is
   * something to edit is unmounted by the close itself, which takes its exit
   * animation with it. What proves the fix is WHEN it leaves — the close
   * alone can no longer remove it.
   */
  it('keeps a closed dialog mounted until it has animated out', async () => {
    render(<RowEditorHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));
    const dialog = screen.getByRole('dialog', { name: 'Editing row-1' });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens again after a close, on the new session', async () => {
    render(<RowEditorHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit other row' }));

    expect(
      screen.getByRole('dialog', { name: 'Editing row-2' }),
    ).toBeInTheDocument();
  });
});
