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

  it('shows its spinner while submitting, in place of an icon of its own', async () => {
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
          <SubmitButton icon={<svg data-testid="own-icon" />}>
            Save
          </SubmitButton>
        </FormWithoutProvider>
      </FormStoreProvider>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(screen.getByTestId('own-icon')).toBeInTheDocument();
    expect(button.querySelector('.animate-spin')).toBeNull();

    fireEvent.click(button);

    await waitFor(() => {
      expect(button.querySelector('.animate-spin')).not.toBeNull();
    });
    expect(screen.queryByTestId('own-icon')).toBeNull();

    finishSubmit();

    expect(await screen.findByTestId('own-icon')).toBeInTheDocument();
    expect(button.querySelector('.animate-spin')).toBeNull();
  });

  it('stays disabled while submitting, whatever a caller passes as disabled', async () => {
    render(
      <FormStoreProvider>
        <FormWithoutProvider onSubmit={() => new Promise<never>(() => {})}>
          <SubmitButton disabled={false}>Save</SubmitButton>
        </FormWithoutProvider>
      </FormStoreProvider>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
    expect(button).toBeDisabled();
  });

  it('stays disabled while idle when a caller passes disabled={true}', () => {
    render(
      <FormStoreProvider>
        <FormWithoutProvider onSubmit={() => ({ success: true as const })}>
          <SubmitButton disabled>Save</SubmitButton>
        </FormWithoutProvider>
      </FormStoreProvider>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
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
