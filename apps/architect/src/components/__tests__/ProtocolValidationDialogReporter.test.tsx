import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  enqueueProtocolValidationDialogEvent,
  takeProtocolValidationDialogEvents,
} from '~/utils/protocolValidationDialogQueue';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

import ProtocolValidationDialogReporter from '../ProtocolValidationDialogReporter';

const onRevert = vi.fn();
const onReturnToStart = vi.fn();
const onClose = vi.fn();

const renderReporter = () =>
  render(
    <DialogProvider>
      <ProtocolValidationDialogReporter />
    </DialogProvider>,
  );

const openRecoveryDialog = async () => {
  await act(async () => {
    enqueueProtocolValidationDialogEvent({
      type: 'open',
      id: 'invalid-protocol',
      errorMessage: 'stages.0.label: Required',
      onRevert,
      onReturnToStart,
      onClose,
    });
  });

  return await screen.findByRole('dialog', { name: 'Misconfigured Protocol' });
};

describe('ProtocolValidationDialogReporter', () => {
  beforeEach(() => {
    takeProtocolValidationDialogEvents();
    onRevert.mockReset();
    onReturnToStart.mockReset();
    onClose.mockReset();
  });

  it('offers exactly revert and return-to-start recovery actions', async () => {
    renderReporter();
    const dialog = await openRecoveryDialog();

    expect(
      within(dialog).getByRole('button', {
        name: 'Revert to Last Valid State',
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Return to Start Screen' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
  });

  it('cannot be dismissed with Escape', async () => {
    renderReporter();
    const dialog = await openRecoveryDialog();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(dialog).toBeVisible();
    });
    expect(onRevert).not.toHaveBeenCalled();
    expect(onReturnToStart).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes overflowing validation details keyboard reachable', async () => {
    renderReporter();
    const dialog = await openRecoveryDialog();
    const errors = within(dialog).getByRole('region', {
      name: 'Protocol validation errors',
    });

    expect(errors).toHaveAttribute('tabindex', '0');
    errors.focus();
    expect(errors).toHaveFocus();
  });

  it('runs only the selected recovery action', async () => {
    renderReporter();
    let dialog = await openRecoveryDialog();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Revert to Last Valid State',
      }),
    );

    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onReturnToStart).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    dialog = await openRecoveryDialog();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Return to Start Screen' }),
    );

    expect(onReturnToStart).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
