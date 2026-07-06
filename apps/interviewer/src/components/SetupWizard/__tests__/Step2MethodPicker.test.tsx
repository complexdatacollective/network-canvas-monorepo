import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setNextEnabledMock = vi.fn<(v: boolean) => void>();
const setStepDataMock = vi.fn<(patch: Record<string, unknown>) => void>();
const wizardData: Record<string, unknown> = {};
vi.mock('@codaco/fresco-ui/dialogs/useWizard', () => ({
  useWizard: () => ({
    setNextEnabled: setNextEnabledMock,
    setStepData: setStepDataMock,
    data: wizardData,
  }),
}));

type ConfirmOptions = { onConfirm?: () => void };
const confirmMock = vi.fn<(options: ConfirmOptions) => void>((options) => {
  options.onConfirm?.();
});
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: confirmMock }),
}));

vi.mock('~/lib/auth/useBiometric', () => ({
  useBiometric: () => ({ status: 'available' as const }),
}));

vi.mock('~/lib/pwa/passkeyWindowLimitation', () => ({
  isMacChromium: () => false,
  hasPasskeyWindowLimitation: () => false,
}));

import Step2MethodPicker from '../Step2MethodPicker';

beforeEach(() => {
  for (const key of Object.keys(wizardData)) delete wizardData[key];
});

afterEach(() => {
  setNextEnabledMock.mockReset();
  setStepDataMock.mockReset();
  confirmMock.mockClear();
});

describe('Step2MethodPicker — method change clears prior enrolment', () => {
  it('clears enrolmentCommitted when switching away from a committed method', async () => {
    wizardData.selectedMethod = 'pin';
    wizardData.enrolmentCommitted = true;
    render(<Step2MethodPicker />);

    await userEvent.click(screen.getByText('Passphrase'));

    expect(setStepDataMock).toHaveBeenCalledWith({
      selectedMethod: 'passphrase',
      enrolmentCommitted: false,
    });
  });

  it('clears enrolmentCommitted when switching to no security', async () => {
    wizardData.selectedMethod = 'pin';
    wizardData.enrolmentCommitted = true;
    render(<Step2MethodPicker />);

    await userEvent.click(screen.getByText(/No security/i));

    expect(confirmMock).toHaveBeenCalled();
    expect(setStepDataMock).toHaveBeenCalledWith({
      selectedMethod: 'none',
      enrolmentCommitted: false,
    });
  });

  it('does not force re-enrolment when re-selecting the already committed method', async () => {
    wizardData.selectedMethod = 'pin';
    wizardData.enrolmentCommitted = true;
    render(<Step2MethodPicker />);

    await userEvent.click(screen.getByText('PIN code'));

    expect(setStepDataMock).toHaveBeenCalledWith({ selectedMethod: 'pin' });
    expect(setStepDataMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ enrolmentCommitted: false }),
    );
  });
});
