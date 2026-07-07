import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import type { AuthContextValue } from '../AuthContext';
import { StepUpAuthProvider } from '../StepUpAuthProvider';

// The provider only reads `auth.kind`/`auth.mode` from useAuth; mock it so the
// test can drive the locked → unlocked transition directly.
let mockAuth: Pick<AuthContextValue, 'kind' | 'mode'>;
vi.mock('../AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const RESET_CONFIRM_TITLE = 'Reset all app data?';

// Opens a destructive confirm dialog on demand — the same DialogProvider-hosted
// confirm the lock screen's Reset button opens via useResetAppData.
function ConfirmOpener() {
  const { confirm } = useDialog();
  return (
    <button
      type="button"
      onClick={() => {
        void confirm({
          title: RESET_CONFIRM_TITLE,
          description: 'This permanently deletes everything.',
          confirmLabel: 'Permanently delete',
          intent: 'destructive',
          // The test only exercises dismissal on lock transition (it never
          // confirms), so the reset action is a no-op here.
          onConfirm: async () => {},
        });
      }}
    >
      open-reset
    </button>
  );
}

function Harness({ children }: { children?: ReactNode }) {
  return (
    <DialogProvider>
      <StepUpAuthProvider>
        <ConfirmOpener />
        {children}
      </StepUpAuthProvider>
    </DialogProvider>
  );
}

beforeEach(() => {
  mockAuth = { kind: 'locked', mode: 'biometric' };
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('StepUpAuthProvider dialog dismissal across lock transitions', () => {
  it('dismisses a provider-hosted confirm opened while locked when auth unlocks', async () => {
    const { rerender } = render(<Harness />);

    // While locked (e.g. during the biometric auto-unlock window) the user taps
    // Reset, arming a destructive confirm hosted by the app-level DialogProvider.
    await act(async () => {
      screen.getByText('open-reset').click();
    });
    expect(await screen.findByText(RESET_CONFIRM_TITLE)).toBeInTheDocument();

    // Auth resolves to unlocked and AuthGate swaps the locked child for Home.
    // The confirm must not float armed over the unlocked app.
    mockAuth = { kind: 'unlocked', mode: 'biometric' };
    rerender(<Harness />);

    await waitFor(() =>
      expect(screen.queryByText(RESET_CONFIRM_TITLE)).not.toBeInTheDocument(),
    );
  });

  it('dismisses a provider-hosted confirm opened while unlocked when the app locks', async () => {
    mockAuth = { kind: 'unlocked', mode: 'pin' };
    const { rerender } = render(<Harness />);

    await act(async () => {
      screen.getByText('open-reset').click();
    });
    expect(await screen.findByText(RESET_CONFIRM_TITLE)).toBeInTheDocument();

    mockAuth = { kind: 'locked', mode: 'pin' };
    rerender(<Harness />);

    await waitFor(() =>
      expect(screen.queryByText(RESET_CONFIRM_TITLE)).not.toBeInTheDocument(),
    );
  });
});
