import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Dialog from '../dialogs/Dialog';
import Field from './Field/Field';
import InputField from './fields/InputField';
import { FormWithoutProvider } from './Form';
import ResetFormWhenClosed from './ResetFormWhenClosed';
import FormStoreProvider from './store/formStoreProvider';

/**
 * The shape the component exists for: the store sits OUTSIDE the dialog, so
 * the footer's submit can reach it, which means it outlives the close the
 * dialog needs in order to animate out.
 */
function Host({ open }: { open: boolean }) {
  return (
    <FormStoreProvider>
      <ResetFormWhenClosed open={open} />
      <Dialog open={open} title="Unlock">
        <FormWithoutProvider
          id="unlock"
          onSubmit={() => ({ success: true as const })}
        >
          <Field name="passphrase" label="Passphrase" component={InputField} />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}

const field = () => screen.getByRole('textbox', { name: 'Passphrase' });

describe('ResetFormWhenClosed', () => {
  /**
   * Closed and reopened BEFORE the exit has finished, which is the window the
   * component exists for — and the one a researcher who changes their mind is
   * in. The field is still mounted and still registered through it, so
   * nothing else clears what was typed: reopening brings the same field back
   * with the same contents unless the close emptied it.
   */
  it('empties what was typed when the dialog is reopened mid-exit', () => {
    const { rerender } = render(<Host open />);

    fireEvent.change(field(), { target: { value: 'hunter2' } });
    rerender(<Host open={false} />);
    rerender(<Host open />);

    expect(field()).toHaveValue('');
  });

  it('leaves what was typed alone while the dialog stays open', () => {
    const { rerender } = render(<Host open />);

    fireEvent.change(field(), { target: { value: 'hunter2' } });
    rerender(<Host open />);

    expect(field()).toHaveValue('hunter2');
  });

  it('leaves nothing of it behind once the dialog has gone', async () => {
    const { rerender } = render(<Host open />);

    fireEvent.change(field(), { target: { value: 'hunter2' } });
    rerender(<Host open={false} />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // Not in a field, and not in a portal that an earlier approach to this
    // (a `key` on the provider) left orphaned.
    expect(document.body.innerHTML).not.toContain('hunter2');
  });
});
