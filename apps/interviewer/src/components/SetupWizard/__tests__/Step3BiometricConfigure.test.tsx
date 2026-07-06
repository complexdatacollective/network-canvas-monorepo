import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setNextEnabledMock = vi.fn<(v: boolean) => void>();
const setBeforeNextMock =
  vi.fn<(fn: (() => Promise<boolean>) | null) => void>();
const setStepDataMock = vi.fn<(patch: Record<string, unknown>) => void>();
vi.mock('@codaco/fresco-ui/dialogs/useWizard', () => ({
  useWizard: () => ({
    setNextEnabled: setNextEnabledMock,
    setBeforeNext: setBeforeNextMock,
    setStepData: setStepDataMock,
    data: {},
  }),
}));

type AuthStatusResult = { configured: boolean; locked: boolean };
type AuthResult = { ok: boolean; message?: string };

const statusMock = vi.fn<() => Promise<AuthStatusResult>>(async () => ({
  configured: false,
  locked: false,
}));
const revokeMock = vi.fn<() => Promise<void>>(async () => {});
const enrolWithBiometricMock = vi.fn<
  (recoveryPhrase: string) => Promise<AuthResult>
>(async () => ({ ok: true }));
vi.mock('~/lib/auth/api', () => ({
  status: () => statusMock(),
  revoke: () => revokeMock(),
  enrolWithBiometric: (phrase: string) => enrolWithBiometricMock(phrase),
}));

import Step3BiometricConfigure from '../Step3BiometricConfigure';

afterEach(() => {
  setNextEnabledMock.mockReset();
  setBeforeNextMock.mockReset();
  setStepDataMock.mockReset();
  enrolWithBiometricMock.mockReset().mockResolvedValue({ ok: true });
  statusMock
    .mockReset()
    .mockResolvedValue({ configured: false, locked: false });
});

function lastBeforeNext(): () => Promise<boolean> {
  const calls = setBeforeNextMock.mock.calls.filter(
    ([fn]) => typeof fn === 'function',
  );
  const fn = calls.at(-1)?.[0];
  if (!fn) throw new Error('no beforeNext registered');
  return fn;
}

function passphraseFields(): [HTMLElement, HTMLElement] {
  const [phrase, confirm] = screen.getAllByLabelText(/passphrase/i);
  if (!phrase || !confirm) throw new Error('passphrase fields not found');
  return [phrase, confirm];
}

describe('Step3BiometricConfigure — recovery passphrase capture', () => {
  it('disables Next until a strong, confirmed recovery passphrase is entered', async () => {
    render(<Step3BiometricConfigure />);
    await waitFor(() => expect(setNextEnabledMock).toHaveBeenCalledWith(false));

    const [phrase, confirm] = passphraseFields();
    await userEvent.type(phrase, 'Tr0ub4dor&3-clever');
    await userEvent.type(confirm, 'Tr0ub4dor&3-clever');

    await waitFor(() =>
      expect(setNextEnabledMock).toHaveBeenLastCalledWith(true),
    );
  });

  it('enrols biometric with the recovery passphrase on Next', async () => {
    render(<Step3BiometricConfigure />);
    const [phrase, confirm] = passphraseFields();
    await userEvent.type(phrase, 'Tr0ub4dor&3-clever');
    await userEvent.type(confirm, 'Tr0ub4dor&3-clever');
    await waitFor(() =>
      expect(setNextEnabledMock).toHaveBeenLastCalledWith(true),
    );

    const ok = await lastBeforeNext()();
    expect(ok).toBe(true);
    expect(enrolWithBiometricMock).toHaveBeenCalledWith('Tr0ub4dor&3-clever');
    expect(setStepDataMock).toHaveBeenCalledWith({
      enrolmentCommitted: true,
    });
  });

  it('surfaces an enrolment failure and does not advance', async () => {
    enrolWithBiometricMock.mockResolvedValue({
      ok: false,
      message: 'Cancelled',
    });
    render(<Step3BiometricConfigure />);
    const [phrase, confirm] = passphraseFields();
    await userEvent.type(phrase, 'Tr0ub4dor&3-clever');
    await userEvent.type(confirm, 'Tr0ub4dor&3-clever');
    await waitFor(() =>
      expect(setNextEnabledMock).toHaveBeenLastCalledWith(true),
    );

    const ok = await lastBeforeNext()();
    expect(ok).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancelled');
  });
});
