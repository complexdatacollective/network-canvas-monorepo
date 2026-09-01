import type { InferContractRouterOutputs } from '@orpc/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

import { registerStudioEditorSession } from '../../editor/sessionLifecycle.ts';
import { authClient } from '../../lib/auth.ts';
import { reportUnauthorizedResponse } from '../../lib/session.ts';
import { createAppRouter } from '../../router.tsx';

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn(),
    useSession: vi.fn(),
    useListOrganizations: vi.fn(),
    useActiveOrganization: vi.fn(),
    useActiveMember: vi.fn(),
    organization: { setActive: vi.fn() },
    signIn: { magicLink: vi.fn(), social: vi.fn() },
    signOut: vi.fn(),
  },
}));

type Status = InferContractRouterOutputs<typeof contract>['status'];
const STATUS: Status = {
  name: 'Network Canvas Studio',
  version: '0.1.0',
  auth: { enabled: true, magicLink: true, socialProviders: [] },
};
let currentStatus: Status = STATUS;

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: () => currentStatus,
      }),
    },
    protocols: {
      list: {
        queryOptions: () => ({
          queryKey: ['protocols'],
          queryFn: () => [],
        }),
        key: () => ['protocols'],
      },
      create: {
        mutationOptions: () => ({ mutationFn: vi.fn() }),
      },
      draft: {
        queryOptions: () => ({ queryKey: ['draft'], queryFn: vi.fn() }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: { protocols: {} },
}));

const mocked = vi.mocked(authClient, true);

type GetSessionResult = Awaited<ReturnType<typeof authClient.getSession>>;
type UseSessionResult = ReturnType<typeof authClient.useSession>;
type MagicLinkResult = Awaited<ReturnType<typeof authClient.signIn.magicLink>>;
type SocialResult = Awaited<ReturnType<typeof authClient.signIn.social>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const SESSION = {
  user: {
    id: 'user-1',
    email: 'researcher@example.com',
    emailVerified: true,
    name: 'Researcher',
  },
  session: { id: 'session-1' },
};

const INVITATION_ID = '00000000-0000-4000-8000-000000000123';

const signedIn = { data: SESSION, error: null } as unknown as GetSessionResult;
const signedOut = { data: null, error: null } as unknown as GetSessionResult;
/**
 * `authClient.useSession()` is no longer part of the app shell — `AppLayout`
 * reads the guard's own query instead (§6.2). It is still mocked because
 * `AcceptInvitation`, on the focused branch, calls it, and one test navigates
 * through that route.
 */
const sessionNone = {
  data: null,
  isPending: false,
  error: null,
} as unknown as UseSessionResult;

function renderWithClientAt(path: string) {
  // One client behind both the router's guards and the components: the
  // session guard reads what a component's `queryClient.clear()` removes.
  const queryClient = new QueryClient();
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router, ...view };
}

function renderAt(path: string) {
  return renderWithClientAt(path).router;
}

/**
 * The app shell, rendered. The header no longer names the researcher — the
 * session query the guard resolves carries only signedIn/signedOut (§6.2) —
 * so the account menu's trigger is the shell's unconditional control.
 */
function findAppShell() {
  return screen.findByRole('button', { name: 'Account' });
}

/** Sign out moved into the account menu (§5.5). */
async function clickSignOut() {
  fireEvent.click(await findAppShell());
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  currentStatus = STATUS;
  mocked.getSession.mockResolvedValue(signedOut);
  mocked.useSession.mockReturnValue(sessionNone);
  mocked.useListOrganizations.mockReturnValue({
    data: [],
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof authClient.useListOrganizations>);
  mocked.useActiveOrganization.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof authClient.useActiveOrganization>);
  mocked.useActiveMember.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof authClient.useActiveMember>);
});

describe('route guard', () => {
  it('redirects signed-out visitors to the sign-in page', async () => {
    const router = renderAt('/');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Sign in' }),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('renders the app shell for a signed-in researcher', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    renderAt('/');
    expect(await findAppShell()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument();
  });

  it('costs one call to the auth client, from the guard alone', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    renderAt('/');
    await findAppShell();

    // The guard's `fetchQuery` is the whole session channel. `useSession()`
    // was the second one: it subscribes to better-auth's own
    // `/api/auth/get-session` fetch, which is a request the guard has already
    // made and cached, on every single page load. Any call at all reopens it,
    // so the assertion is zero rather than a count.
    expect(mocked.getSession).toHaveBeenCalledTimes(1);
    expect(mocked.useSession).not.toHaveBeenCalled();
  });

  it('shows the error screen, not sign-in, when the session check cannot reach the server', async () => {
    mocked.getSession.mockRejectedValue(new Error('network down'));
    const router = renderAt('/');
    await waitFor(() =>
      expect(
        screen.getByText(/The server could not be reached/),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/');
  });

  it('leaves a visitor on the sign-in page when the server cannot be reached', async () => {
    // The app branch turns "we could not ask" into the error screen, because a
    // researcher who may still be signed in must not be bounced out. The
    // sign-in page's guard asks a different question — "are you already signed
    // in?" — and not knowing the answer is no reason to take the page away
    // from someone who came here to sign in, which is what letting
    // ServerUnreachableError out of this guard would do.
    mocked.getSession.mockRejectedValue(new Error('network down'));
    const router = renderAt('/sign-in');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Sign in' }),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(
      screen.queryByText(/The server could not be reached/),
    ).not.toBeInTheDocument();
  });

  it('sends a visitor to sign-in, not the error screen, when auth is switched off', async () => {
    mocked.getSession.mockResolvedValue({
      data: null,
      error: { status: 503 },
    } as unknown as GetSessionResult);
    currentStatus = {
      ...STATUS,
      auth: { enabled: false, magicLink: false, socialProviders: [] },
    };
    const router = renderAt('/');
    await waitFor(() =>
      expect(
        screen.getByText(/Sign-in is not available on this server/),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('asks the auth endpoint once, however many times the tree is entered', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt('/');
    await findAppShell();
    expect(mocked.getSession).toHaveBeenCalledTimes(1);

    // Out of the authenticated tree and back into it, twice. Every entry runs
    // the app branch's guard; only the first costs a request, because the
    // guard reads one query rather than probing per navigation.
    for (const _visit of [1, 2]) {
      await act(() =>
        router.navigate({
          to: '/invitations/$invitationId',
          params: { invitationId: INVITATION_ID },
        }),
      );
      await act(() => router.navigate({ to: '/' }));
    }

    await findAppShell();
    expect(mocked.getSession).toHaveBeenCalledTimes(1);
  });

  it('re-asks the auth endpoint when a procedure refuses with 401', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt('/');
    await findAppShell();
    expect(mocked.getSession).toHaveBeenCalledTimes(1);

    // The cookie has gone, and the 401 path re-running the guard is now the
    // only thing that can notice.
    mocked.getSession.mockResolvedValue(signedOut);
    await act(() => reportUnauthorizedResponse());

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
    // Three asks, and each one is a different question. The guard's, on
    // arrival. The 401 path's re-ask, which is what this test is about. And
    // the sign-in route's own guard, because establishing that the session
    // had ended cleared the cache — including the answer — so "are you
    // already signed in?" has to be asked again rather than answered from a
    // cache the previous researcher filled.
    expect(mocked.getSession).toHaveBeenCalledTimes(3);
  });

  it('bounces an already-signed-in visitor off the sign-in page', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt('/sign-in');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('sign-out', () => {
  it('clears private queries when a live session expires', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const { queryClient, router } = renderWithClientAt('/');
    await findAppShell();
    queryClient.setQueryData(['private-draft'], { name: 'Private draft' });

    // The session ends mid-session. With no second live channel to notice it,
    // the one query the guard resolves is where it surfaces: a procedure
    // answers 401, the handler invalidates that query, and the shell reads
    // the refetched answer from the same cache entry the guard wrote.
    mocked.getSession.mockResolvedValue(signedOut);
    await act(() => reportUnauthorizedResponse());

    await waitFor(() =>
      expect(queryClient.getQueryData(['private-draft'])).toBeUndefined(),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
  });

  it('closes editor sessions before clearing authentication', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const closed = deferred<void>();
    const close = vi.fn(() => closed.promise);
    const unregister = registerStudioEditorSession(close);
    mocked.signOut.mockResolvedValue({
      data: { success: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof authClient.signOut>>);
    const { queryClient } = renderWithClientAt('/');
    queryClient.setQueryData(['private-draft'], { name: 'Private draft' });

    await clickSignOut();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocked.signOut).not.toHaveBeenCalled();

    closed.resolve();
    await waitFor(() => expect(mocked.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(queryClient.getQueryData(['private-draft'])).toBeUndefined(),
    );
    unregister();
  });

  it('signs out in the order the sequence requires', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const events: string[] = [];
    let pathnameWhenEditorClosed: string | undefined;
    const unregister = registerStudioEditorSession(() => {
      events.push('closeEditorSessions');
      pathnameWhenEditorClosed = router.state.location.pathname;
      return Promise.resolve();
    });
    mocked.signOut.mockImplementation(() => {
      events.push('signOut');
      return Promise.resolve({
        data: { success: true },
        error: null,
      }) as ReturnType<typeof authClient.signOut>;
    });
    const { queryClient, router } = renderWithClientAt('/');
    await findAppShell();
    queryClient.setQueryData(['private-draft'], { name: 'Private draft' });
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'removed') return;
      if (!events.includes('clearCache')) events.push('clearCache');
    });

    await clickSignOut();

    // Navigate, verify the location actually changed, close editor sessions,
    // sign out, clear. Every step depends on the one before it: leaving the
    // editor route is what settles its blocker, the lease must be released
    // while the cookie is still valid, and the cache must not be emptied
    // until the server has confirmed the session is gone — a failed sign-out
    // leaves the researcher signed in and working.
    await waitFor(() =>
      expect(events).toEqual(['closeEditorSessions', 'signOut', 'clearCache']),
    );
    expect(pathnameWhenEditorClosed).toBe('/');
    unsubscribe();
    unregister();
  });

  it('stays put and reports failure when sign-out does not complete', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    mocked.signOut.mockResolvedValue({
      data: null,
      error: { status: 500 },
    } as unknown as Awaited<ReturnType<typeof authClient.signOut>>);
    const router = renderAt('/');
    await clickSignOut();
    await waitFor(() =>
      expect(screen.getByText(/Sign-out did not complete/)).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('sign-in page', () => {
  it('sends a magic link and confirms where it went', async () => {
    mocked.signIn.magicLink.mockResolvedValue({
      data: { status: true },
      error: null,
    } as unknown as MagicLinkResult);
    renderAt('/sign-in');
    const email = await screen.findByLabelText(/Email address/);
    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() =>
      expect(
        screen.getByText(/We sent a sign-in link to researcher@example.com/),
      ).toBeInTheDocument(),
    );
    expect(mocked.signIn.magicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'researcher@example.com',
        callbackURL: '/',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use a different email address' }),
    );
    expect(await screen.findByLabelText(/Email address/)).toBeInTheDocument();
  });

  it('rejects a malformed email before any request is made', async () => {
    renderAt('/sign-in');
    const email = await screen.findByLabelText(/Email address/);
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() =>
      expect(
        screen.getByText(/Enter a valid email address/),
      ).toBeInTheDocument(),
    );
    expect(mocked.signIn.magicLink).not.toHaveBeenCalled();
  });

  it('reports a failed send inside the form', async () => {
    mocked.signIn.magicLink.mockResolvedValue({
      data: null,
      error: { status: 500 },
    } as unknown as MagicLinkResult);
    renderAt('/sign-in');
    const email = await screen.findByLabelText(/Email address/);
    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() =>
      expect(
        screen.getByText(/The sign-in email could not be sent/),
      ).toBeInTheDocument(),
    );
  });

  it('reports a failed send when the request never completes', async () => {
    mocked.signIn.magicLink.mockRejectedValue(new Error('network down'));
    renderAt('/sign-in');
    const email = await screen.findByLabelText(/Email address/);
    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() =>
      expect(
        screen.getByText(/The sign-in email could not be sent/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/We sent a sign-in link/),
    ).not.toBeInTheDocument();
  });

  it('offers no email form when the server cannot send mail', async () => {
    currentStatus = {
      ...STATUS,
      auth: { ...STATUS.auth, magicLink: false, socialProviders: ['google'] },
    };
    renderAt('/sign-in');
    expect(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email address/)).not.toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });

  it('says so when no sign-in method is available at all', async () => {
    currentStatus = {
      ...STATUS,
      auth: { enabled: true, magicLink: false, socialProviders: [] },
    };
    renderAt('/sign-in');
    await waitFor(() =>
      expect(
        screen.getByText(/Sign-in is not available on this server/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Email address/)).not.toBeInTheDocument();
  });

  it('explains an expired link when the verify redirect carries an error', async () => {
    renderAt('/sign-in?error=EXPIRED_TOKEN');
    await waitFor(() =>
      expect(
        screen.getByText(/That sign-in link is no longer valid/),
      ).toBeInTheDocument(),
    );
  });
});

describe('OAuth sign-in', () => {
  const withProviders: Status = {
    ...STATUS,
    auth: { ...STATUS.auth, socialProviders: ['google', 'microsoft'] },
  };

  it('offers exactly the configured providers', async () => {
    currentStatus = withProviders;
    renderAt('/sign-in');
    expect(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toBeInTheDocument();
  });

  it('offers no provider buttons when none are configured', async () => {
    renderAt('/sign-in');
    await screen.findByLabelText(/Email address/);
    expect(
      screen.queryByRole('button', { name: /Continue with/ }),
    ).not.toBeInTheDocument();
  });

  it('starts the provider round trip', async () => {
    currentStatus = withProviders;
    mocked.signIn.social.mockResolvedValue({
      data: {
        url: 'https://accounts.google.com/o/oauth2/auth',
        redirect: true,
      },
      error: null,
    } as unknown as SocialResult);
    renderAt('/sign-in');
    // Held across the click: re-querying by role while the pending spinner
    // is mounted trips a jsdom bug resolving its calc() font-size.
    const button = await screen.findByRole('button', {
      name: 'Continue with Google',
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(mocked.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google', callbackURL: '/' }),
      ),
    );
    expect(button).toBeDisabled();
  });

  it('reports a failed start and re-enables the buttons', async () => {
    currentStatus = withProviders;
    mocked.signIn.social.mockResolvedValue({
      data: null,
      error: { status: 500 },
    } as unknown as SocialResult);
    renderAt('/sign-in');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue with Microsoft' }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Sign-in could not be started/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toBeEnabled();
  });

  it('re-enables the buttons when starting the round trip rejects outright', async () => {
    currentStatus = withProviders;
    mocked.signIn.social.mockRejectedValue(new Error('network down'));
    renderAt('/sign-in');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue with Microsoft' }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Sign-in could not be started/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toBeEnabled();
  });

  it('explains an OAuth error carried on the redirect back', async () => {
    renderAt('/sign-in?error=access_denied');
    await waitFor(() =>
      expect(screen.getByText(/Sign-in did not complete/)).toBeInTheDocument(),
    );
  });
});
