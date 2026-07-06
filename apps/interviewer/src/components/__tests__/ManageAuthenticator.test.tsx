import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => useAuthMock() }));

const toastAdd = vi.fn();
vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: vi.fn() }),
}));

import { ManageAuthenticator } from '../ManageAuthenticator';

const NEW_PHRASE = 'Brand-New-Phrase-2!';

// delay: null types synchronously instead of scheduling a real timer between
// keystrokes. Under a contended CI runner (whole-workspace tests in parallel)
// those per-keystroke timers get starved and the ~50 keystrokes across three
// fields balloon from ~300ms to >5s, tripping the default testTimeout.
const setup = () => userEvent.setup({ delay: null });

// Even with delay:null, this heavy interviewer suite (58 files, crypto + the
// interview engine) runs many workers in parallel on a small CI runner; under
// peak load a ~300ms test can still be starved past the 5000ms default. Give
// generous headroom so scheduler contention doesn't flake the run.
vi.setConfig({ testTimeout: 20000 });

afterEach(() => {
  useAuthMock.mockReset();
  toastAdd.mockReset();
});

describe('ManageAuthenticator — change passphrase', () => {
  it('changes the passphrase and surfaces a success toast', async () => {
    const reEnrolWithPassphrase = vi.fn(async () => ({ ok: true }));
    useAuthMock.mockReturnValue({ mode: 'passphrase', reEnrolWithPassphrase });
    const user = setup();
    render(<ManageAuthenticator />);

    await user.click(
      screen.getByRole('button', { name: /change passphrase/i }),
    );
    await user.type(
      screen.getByLabelText('Current passphrase'),
      'Correct-Horse-9!',
    );
    await user.type(screen.getByLabelText('New passphrase'), NEW_PHRASE);
    await user.type(
      screen.getByLabelText('Confirm new passphrase'),
      NEW_PHRASE,
    );
    await user.click(
      screen.getByRole('button', { name: /save new passphrase/i }),
    );

    await waitFor(() =>
      expect(reEnrolWithPassphrase).toHaveBeenCalledWith(
        'Correct-Horse-9!',
        NEW_PHRASE,
      ),
    );
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('blocks submission when the two new passphrases differ', async () => {
    const reEnrolWithPassphrase = vi.fn(async () => ({ ok: true }));
    useAuthMock.mockReturnValue({ mode: 'passphrase', reEnrolWithPassphrase });
    const user = setup();
    render(<ManageAuthenticator />);

    await user.click(
      screen.getByRole('button', { name: /change passphrase/i }),
    );
    await user.type(
      screen.getByLabelText('Current passphrase'),
      'Correct-Horse-9!',
    );
    await user.type(screen.getByLabelText('New passphrase'), NEW_PHRASE);
    await user.type(
      screen.getByLabelText('Confirm new passphrase'),
      'Different-Phrase-3!',
    );
    await user.click(
      screen.getByRole('button', { name: /save new passphrase/i }),
    );

    expect(reEnrolWithPassphrase).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
  });

  it('surfaces a wrong-current-secret failure from the action', async () => {
    const reEnrolWithPassphrase = vi.fn(async () => ({
      ok: false,
      message: 'Current passphrase is incorrect',
    }));
    useAuthMock.mockReturnValue({ mode: 'passphrase', reEnrolWithPassphrase });
    const user = setup();
    render(<ManageAuthenticator />);

    await user.click(
      screen.getByRole('button', { name: /change passphrase/i }),
    );
    await user.type(
      screen.getByLabelText('Current passphrase'),
      'Wrong-Current-1!',
    );
    await user.type(screen.getByLabelText('New passphrase'), NEW_PHRASE);
    await user.type(
      screen.getByLabelText('Confirm new passphrase'),
      NEW_PHRASE,
    );
    await user.click(
      screen.getByRole('button', { name: /save new passphrase/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /current passphrase is incorrect/i,
    );
    expect(toastAdd).not.toHaveBeenCalled();
  });
});

describe('ManageAuthenticator — change PIN', () => {
  it('offers a Change PIN affordance for a pin vault', () => {
    useAuthMock.mockReturnValue({
      mode: 'pin',
      reEnrolWithPin: vi.fn(async () => ({ ok: true })),
    });
    render(<ManageAuthenticator />);
    expect(
      screen.getByRole('button', { name: /change pin/i }),
    ).toBeInTheDocument();
  });

  it('changes the PIN and surfaces a success toast', async () => {
    const reEnrolWithPin = vi.fn(async () => ({ ok: true }));
    useAuthMock.mockReturnValue({ mode: 'pin', reEnrolWithPin });
    const user = setup();
    render(<ManageAuthenticator />);

    await user.click(screen.getByRole('button', { name: /change pin/i }));
    await user.type(screen.getByLabelText('Current PIN'), '12345678');
    // SegmentedCodeField renders one input per digit; typing into the first
    // digit advances focus through the rest. Two groups exist (New PIN and
    // Confirm new PIN), so target each group's first digit by index.
    const firstDigitInputs = screen.getAllByLabelText(/digit 1 of 8/i);
    await user.type(firstDigitInputs[0]!, '87654321');
    await user.type(firstDigitInputs[1]!, '87654321');
    await user.click(screen.getByRole('button', { name: /save new pin/i }));

    await waitFor(() =>
      expect(reEnrolWithPin).toHaveBeenCalledWith('12345678', '87654321'),
    );
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });
});

describe('ManageAuthenticator — biometric / none', () => {
  it('does not offer a change form for a biometric vault', () => {
    useAuthMock.mockReturnValue({ mode: 'biometric' });
    render(<ManageAuthenticator />);
    expect(
      screen.queryByRole('button', { name: /change/i }),
    ).not.toBeInTheDocument();
  });
});
