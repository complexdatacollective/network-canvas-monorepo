import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '../DialogProvider';
import useDialog from '../useDialog';

const Opener = () => {
  const { confirm } = useDialog();
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({
          title: 'Remove this item?',
          confirmLabel: 'Remove',
          onConfirm: () => undefined,
          dataAttributes: { 'data-opened-by': 'editor' },
        })
      }
    >
      Remove item
    </button>
  );
};

describe('a dialog opened through useDialog', () => {
  it('carries the data attributes that it was given', async () => {
    render(
      <DialogProvider>
        <Opener />
      </DialogProvider>,
    );
    screen.getByRole('button', { name: 'Remove item' }).click();

    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-opened-by="editor"]')).not.toBeNull();
  });
});
