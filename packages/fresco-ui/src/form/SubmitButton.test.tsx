import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormWithoutProvider } from './Form';
import FormStoreProvider from './store/formStoreProvider';
import SubmitButton from './SubmitButton';

/**
 * A submit control that renamed itself mid-submit made "the Save button is
 * gone" ambiguous between "still saving" and "saved and the dialog closed",
 * which is how a Testing Library wait can silently resolve before the work it
 * is waiting for has happened. Callers identify this control by its name; it
 * must survive the submit.
 */
describe('SubmitButton', () => {
  it('keeps its accessible name while submitting, reporting busy state instead', async () => {
    let finishSubmit: () => void = () => undefined;
    const submitted = new Promise<void>((resolve) => {
      finishSubmit = resolve;
    });

    render(
      <FormStoreProvider>
        <FormWithoutProvider
          onSubmit={async () => {
            await submitted;
            return { success: true as const };
          }}
        >
          <SubmitButton>Save</SubmitButton>
        </FormWithoutProvider>
      </FormStoreProvider>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    finishSubmit();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
        'aria-busy',
        'false',
      );
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('renames itself only when a caller opts in with submittingText', async () => {
    render(
      <FormStoreProvider>
        <FormWithoutProvider onSubmit={() => new Promise<never>(() => {})}>
          <SubmitButton submittingText="Unlocking…">Unlock</SubmitButton>
        </FormWithoutProvider>
      </FormStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(
      await screen.findByRole('button', { name: 'Unlocking…' }),
    ).toBeDisabled();
  });
});
