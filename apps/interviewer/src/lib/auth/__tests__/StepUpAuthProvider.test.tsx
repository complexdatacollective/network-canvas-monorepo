import { act, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
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

describe('StepUpAuthProvider callback stability', () => {
  // A location-coupled requireFreshUnlock identity re-runs every consumer
  // effect that lists it as a dependency on every navigation — including the
  // interview route's enter-gate effect while AnimatePresence holds that route
  // mounted for its exit fade, which is how the phantom post-exit
  // "Confirm your identity" prompt over Home arose.
  it('keeps requireFreshUnlock identity stable across location changes', async () => {
    mockAuth = { kind: 'unlocked', mode: 'pin' };
    const seen: Array<unknown> = [];
    function IdentityProbe() {
      seen.push(useStepUpAuth().requireFreshUnlock);
      return null;
    }
    const { rerender } = render(
      <Harness>
        <IdentityProbe />
      </Harness>,
    );

    await act(async () => {
      window.history.pushState({}, '', '/interview/s1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    rerender(
      <Harness>
        <IdentityProbe />
      </Harness>,
    );

    expect(seen.length).toBeGreaterThan(1);
    for (const fn of seen) {
      expect(fn).toBe(seen[0]);
    }
  });
});

describe('StepUpAuthProvider interview authorization', () => {
  // Mirrors AuthGate: the routed child mounts only once auth is unlocked, and
  // reads the authorization from a passive effect as InterviewRoute's enter
  // gate does.
  function GatedEnterGate({
    onRead,
  }: {
    onRead: (authorized: string | null) => void;
  }) {
    const { getAuthorizedInterviewId } = useStepUpAuth();
    useEffect(() => {
      onRead(getAuthorizedInterviewId());
    }, [getAuthorizedInterviewId, onRead]);
    return null;
  }

  function renderGated(onRead: (authorized: string | null) => void) {
    const gated = () => (
      <Harness>
        <AuthorizationProbe />
        {mockAuth.kind === 'unlocked' && <GatedEnterGate onRead={onRead} />}
      </Harness>
    );
    const view = render(gated());
    return { rerenderGated: () => view.rerender(gated()) };
  }

  it('authorizes the interview the app was unlocked on before its enter gate runs', () => {
    window.history.replaceState({}, '', '/interview/s1');
    const onRead = vi.fn();
    const { rerenderGated } = renderGated(onRead);

    mockAuth = { kind: 'unlocked', mode: 'pin' };
    rerenderGated();

    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith('s1');
  });

  it('ignores an authorization value planted in sessionStorage', () => {
    window.sessionStorage.setItem('interviewer:authorized-interview-id', 's1');
    window.history.replaceState({}, '', '/interview/s1');
    mockAuth = { kind: 'unlocked', mode: 'pin' };
    const onRead = vi.fn();

    renderGated(onRead);

    expect(onRead).toHaveBeenCalledWith(null);
  });

  it('does not authorize an interview when the unlock happens elsewhere', async () => {
    const onRead = vi.fn();
    const { rerenderGated } = renderGated(onRead);

    mockAuth = { kind: 'unlocked', mode: 'pin' };
    rerenderGated();
    expect(onRead).toHaveBeenLastCalledWith(null);

    // Navigating into an interview afterwards is not an unlock on its route.
    await act(async () => {
      window.history.pushState({}, '', '/interview/s1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    rerenderGated();
    expect(screen.getByTestId('authorized-interview')).toHaveTextContent(
      'none',
    );
  });

  it('clears stale interview authorization when unlocked on the home route', () => {
    const view = render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    act(() => {
      screen.getByText('authorize-s1').click();
    });

    mockAuth = { kind: 'unlocked', mode: 'pin' };
    view.rerender(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    view.rerender(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );

    expect(screen.getByTestId('authorized-interview')).toHaveTextContent(
      'none',
    );
  });

  it('clears interview authorization after a destructive reset', () => {
    window.history.replaceState({}, '', '/interview/s1');
    const view = render(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    act(() => {
      screen.getByText('authorize-s1').click();
    });

    mockAuth = { kind: 'unconfigured' };
    view.rerender(
      <Harness>
        <AuthorizationProbe />
      </Harness>,
    );
    view.rerender(
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
