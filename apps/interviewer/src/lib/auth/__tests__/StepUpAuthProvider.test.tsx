import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import type { AuthContextValue } from '../AuthContext';
import {
  persistInterviewRecoveryRestriction,
  readInterviewRecoveryRestriction,
} from '../interviewRecoveryRestriction';
import { StepUpAuthProvider, useStepUpAuth } from '../StepUpAuthProvider';

// The provider only reads `auth.kind`/`auth.mode` from useAuth; mock it so the
// test can drive the locked → unlocked transition directly.
let mockAuth: Pick<AuthContextValue, 'kind' | 'mode'>;
vi.mock('../AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const RESET_CONFIRM_TITLE = 'Reset all app data?';

// Opens a destructive confirm dialog on demand so provider-hosted confirmation
// dismissal remains covered independently of the controlled auth reset dialog.
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

function StepUpRequester({
  onResult,
}: {
  onResult: (result: { ok: boolean; reason?: 'cancelled' }) => void;
}) {
  const { requireFreshUnlock } = useStepUpAuth();
  return (
    <button
      type="button"
      onClick={() => {
        void requireFreshUnlock().then(onResult);
      }}
    >
      request-step-up
    </button>
  );
}

function AuthorizationProbe() {
  const { getAuthorizedInterviewId, setAuthorizedInterviewId } =
    useStepUpAuth();
  return (
    <>
      <button type="button" onClick={() => setAuthorizedInterviewId('s1')}>
        authorize-s1
      </button>
      <output data-testid="authorized-interview">
        {getAuthorizedInterviewId() ?? 'none'}
      </output>
    </>
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
  window.history.replaceState({}, '', '/');
  window.sessionStorage.clear();
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

  it('cancels a pending step-up when destructive recovery resets auth', async () => {
    mockAuth = { kind: 'unlocked', mode: 'pin' };
    const onResult = vi.fn();
    const { rerender } = render(
      <Harness>
        <StepUpRequester onResult={onResult} />
      </Harness>,
    );

    await act(async () => {
      screen.getByText('request-step-up').click();
    });
    expect(
      await screen.findByText('Confirm your identity'),
    ).toBeInTheDocument();

    mockAuth = { kind: 'unconfigured' };
    rerender(
      <Harness>
        <StepUpRequester onResult={onResult} />
      </Harness>,
    );

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        ok: false,
        reason: 'cancelled',
      }),
    );
    expect(screen.queryByText('Confirm your identity')).not.toBeInTheDocument();
  });

  it('keeps destructive recovery suppressed for a step-up opened on an interview route', async () => {
    window.history.replaceState({}, '', '/interview/s1');
    mockAuth = { kind: 'unlocked', mode: 'pin' };
    render(
      <Harness>
        <StepUpRequester onResult={vi.fn()} />
      </Harness>,
    );

    await act(async () => {
      screen.getByText('request-step-up').click();
    });
    expect(
      await screen.findByText('Confirm your identity'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recover by resetting' }),
    ).not.toBeInTheDocument();

    // The policy is captured when the dialog opens; changing the URL cannot
    // re-enable reset on the already-open authentication surface.
    await act(async () => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByText('Confirm your identity')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recover by resetting' }),
    ).not.toBeInTheDocument();
  });
});

describe('StepUpAuthProvider interview authorization', () => {
  it('preserves the authorized interview across a hard-refresh remount', async () => {
    window.history.replaceState({}, '', '/interview/s1');
    const firstMount = render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );

    await act(async () => {
      screen.getByText('authorize-s1').click();
    });
    firstMount.unmount();

    render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );

    expect(screen.getByTestId('authorized-interview')).toHaveTextContent('s1');
  });

  it('clears stale interview authorization when unlocked on the home route', async () => {
    const firstMount = render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    await act(async () => {
      screen.getByText('authorize-s1').click();
    });
    firstMount.unmount();

    mockAuth = { kind: 'unlocked', mode: 'pin' };
    const homeMount = render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );

    await waitFor(() =>
      expect(
        window.sessionStorage.getItem('interviewer:authorized-interview-id'),
      ).toBeNull(),
    );
    homeMount.rerender(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    expect(screen.getByTestId('authorized-interview')).toHaveTextContent(
      'none',
    );
  });

  it('clears persisted interview authorization after a destructive reset', async () => {
    const firstMount = render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    await act(async () => {
      screen.getByText('authorize-s1').click();
    });
    firstMount.unmount();

    mockAuth = { kind: 'unconfigured' };
    const resetMount = render(<Harness />);
    await waitFor(() => expect(window.sessionStorage.length).toBe(0));
    resetMount.unmount();

    mockAuth = { kind: 'locked', mode: 'pin' };
    render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    expect(screen.getByTestId('authorized-interview')).toHaveTextContent(
      'none',
    );
  });
});

describe('StepUpAuthProvider lock recovery restriction cleanup', () => {
  it.each([
    { kind: 'unlocked', mode: 'pin' },
    { kind: 'unconfigured' },
    { kind: 'corrupt' },
  ] satisfies Array<Pick<AuthContextValue, 'kind' | 'mode'>>)(
    'clears the persisted lock restriction when auth is $kind',
    async (auth) => {
      persistInterviewRecoveryRestriction();
      mockAuth = auth;

      render(<Harness />);

      await waitFor(() =>
        expect(readInterviewRecoveryRestriction()).toBe(false),
      );
    },
  );
});
