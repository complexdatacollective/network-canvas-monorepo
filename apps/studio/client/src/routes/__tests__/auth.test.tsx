import type { InferContractRouterOutputs } from '@orpc/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  cleanup,
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
    organization: { setActive: vi.fn(), list: vi.fn() },
    signIn: { magicLink: vi.fn(), social: vi.fn(), email: vi.fn() },
    signOut: vi.fn(),
  },
}));

type Status = InferContractRouterOutputs<typeof contract>['status'];
const STATUS: Status = {
  name: 'Network Canvas Studio',
  version: '0.1.0',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: [],
  },
  deployment: { mode: 'managed', billing: false },
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
    studies: {
      list: {
        queryOptions: () => ({ queryKey: ['studies'], queryFn: () => [] }),
        key: () => ['studies'],
      },
      get: {
        queryOptions: () => ({ queryKey: ['study'], queryFn: () => null }),
        key: () => ['study'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
    protocols: {
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
type EmailPasswordResult = Awaited<ReturnType<typeof authClient.signIn.email>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const TEAM = { id: 'team-a', name: 'Alpha research team' };

const SESSION = {
  user: {
    id: 'user-1',
    email: 'researcher@example.com',
    emailVerified: true,
    name: 'Researcher',
  },
  session: { id: 'session-1', activeOrganizationId: TEAM.id },
};

/** The team route the one-team fixture below lands on (§6.4). */
const LANDING = `/team/${TEAM.id}`;

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
  mocked.organization.list.mockResolvedValue({
    data: [TEAM],
    error: null,
  } as unknown as Awaited<ReturnType<typeof authClient.organization.list>>);
  mocked.organization.setActive.mockResolvedValue({
    data: null,
    error: null,
  } as unknown as Awaited<
    ReturnType<typeof authClient.organization.setActive>
  >);
  mocked.useSession.mockReturnValue(sessionNone);
  mocked.useListOrganizations.mockReturnValue({
    data: [TEAM],
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof authClient.useListOrganizations>);
  mocked.useActiveOrganization.mockReturnValue({
    data: TEAM,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof authClient.useActiveOrganization>);
  mocked.useActiveMember.mockReturnValue({
    data: { id: 'member-1', organizationId: TEAM.id, role: 'owner' },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof authClient.useActiveMember>);
});

describe('route guard', () => {
  it('redirects signed-out visitors to the sign-in page', async () => {
    const router = renderAt(LANDING);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Sign in' }),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('renders the app shell for a signed-in researcher', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    renderAt(LANDING);
    expect(await findAppShell()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument();
  });

  it('costs one call to the auth client, from the guard alone', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    renderAt(LANDING);
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
    const router = renderAt(LANDING);
    await waitFor(() =>
      expect(
        screen.getByText(/The server could not be reached/),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe(LANDING);
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
      auth: {
        enabled: false,
        magicLink: false,
        emailAndPassword: false,
        socialProviders: [],
      },
    };
    const router = renderAt(LANDING);
    await waitFor(() =>
      expect(
        screen.getByText(/Sign-in is not available on this server/),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('asks the auth endpoint once, however many times the tree is entered', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt(LANDING);
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
      await act(() =>
        router.navigate({ to: '/team/$teamId', params: { teamId: TEAM.id } }),
      );
    }

    await findAppShell();
    expect(mocked.getSession).toHaveBeenCalledTimes(1);
  });

  it('re-asks the auth endpoint when a procedure refuses with 401', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt(LANDING);
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

  it('bounces an already-signed-in visitor off their sign-in page', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt('/sign-in');
    // §6.4's landing resolution, not `/`, which is marketing under the
    // managed topology and a redirect under self-hosted (§10.4).
    await waitFor(() => expect(router.state.location.pathname).toBe(LANDING));
  });

  it('leaves a signed-in visitor on the sign-in page when their teams cannot be read', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    mocked.organization.list.mockRejectedValue(new Error('network down'));
    const router = renderAt('/sign-in');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Sign in' }),
      ).toBeInTheDocument(),
    );
    // Not knowing where they belong is no reason to replace the page they
    // are standing on with the error screen, and no reason to guess
    // `/no-team` — which would be a lie about their memberships.
    expect(router.state.location.pathname).toBe('/sign-in');
  });
});

describe('sign-out', () => {
  it('clears private queries when a live session expires', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    const { queryClient, router } = renderWithClientAt(LANDING);
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
    const { queryClient } = renderWithClientAt(LANDING);
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
    const { queryClient, router } = renderWithClientAt(LANDING);
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
    // `/account`, not `/`: `/` is marketing under managed and a redirect
    // under self-hosted, and a redirect would make "did we actually leave?"
    // compare against a URL the router never commits (§10.4).
    expect(pathnameWhenEditorClosed).toBe('/account');
    unsubscribe();
    unregister();
  });

  it('signs out from the account area itself', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    mocked.signOut.mockImplementation(() => {
      // The cookie is gone from here on, which is what makes the sign-in page
      // the end of this sequence rather than a bounce back to the landing.
      mocked.getSession.mockResolvedValue(signedOut);
      return Promise.resolve({
        data: { success: true },
        error: null,
      }) as ReturnType<typeof authClient.signOut>;
    });
    const router = renderAt('/account');
    await findAppShell();

    // The sequence navigates to `/account` to settle the editor's blocker,
    // and a researcher who is already there is the case where "did my own
    // navigation commit?" is hardest to answer: the address does not change,
    // so nothing about the location distinguishes arriving from staying. The
    // generation token the navigation carries is what does.
    await clickSignOut();

    await waitFor(() => expect(mocked.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
  });

  it('stays put and reports failure when sign-out does not complete', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    mocked.signOut.mockResolvedValue({
      data: null,
      error: { status: 500 },
    } as unknown as Awaited<ReturnType<typeof authClient.signOut>>);
    const router = renderAt(LANDING);
    await clickSignOut();
    await waitFor(() =>
      expect(screen.getByText(/Sign-out did not complete/)).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/account');
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
        callbackURL: '/sign-in',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use a different email address' }),
    );
    expect(await screen.findByLabelText(/Email address/)).toBeInTheDocument();
  });

  it('sends the researcher where they belong when the link is opened', async () => {
    // The end of the sign-in journey, walked rather than asserted about: the
    // page hands better-auth a URL, better-auth's verify redirect is a full
    // document load at it, and this follows the one the page actually gave.
    //
    // `/` cannot be that URL. On a managed deployment it renders marketing
    // signed in or out (§10.4), so a researcher who has just proved who they
    // are lands back on the public page and has to press "Sign in" again —
    // and no assertion about the callback string alone would have said so.
    mocked.signIn.magicLink.mockResolvedValue({
      data: { status: true },
      error: null,
    } as unknown as MagicLinkResult);
    renderAt('/sign-in');
    const email = await screen.findByLabelText(/Email address/);
    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    await waitFor(() => expect(mocked.signIn.magicLink).toHaveBeenCalled());

    const callbackURL = mocked.signIn.magicLink.mock.calls[0]?.[0].callbackURL;
    if (typeof callbackURL !== 'string') {
      throw new Error('the sign-in page passed no callback URL');
    }

    cleanup();
    mocked.getSession.mockResolvedValue(signedIn);
    const router = renderAt(callbackURL);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe(LANDING);
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

  it('offers no email form when neither magic-link nor a password is available', async () => {
    currentStatus = {
      ...STATUS,
      auth: {
        ...STATUS.auth,
        magicLink: false,
        emailAndPassword: false,
        socialProviders: ['google'],
      },
    };
    renderAt('/sign-in');
    expect(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email address/)).not.toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });

  it('falls back to the password form when the server cannot send mail', async () => {
    // magicLink is gated on the mailer being configured; emailAndPassword is
    // not (app.ts), so a broken mailer alone leaves password sign-in intact
    // — the researcher gets the password form directly, with no toggle back
    // to a magic link that is not actually offered.
    currentStatus = {
      ...STATUS,
      auth: { ...STATUS.auth, magicLink: false, socialProviders: [] },
    };
    renderAt('/sign-in');
    // Password-only is the RESOLVED state; the optimistic pre-resolution
    // render shows the magic-link form instead (magicLink defaults true
    // while `auth` is undefined), so waiting on the email field alone would
    // resolve against that transient render instead of this one.
    expect(await screen.findByLabelText(/Password/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /magic link instead/ }),
    ).not.toBeInTheDocument();
  });

  it('says so when no sign-in method is available at all', async () => {
    currentStatus = {
      ...STATUS,
      auth: {
        enabled: true,
        magicLink: false,
        emailAndPassword: false,
        socialProviders: [],
      },
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

describe('password sign-in', () => {
  it('switches to the password form and back', async () => {
    renderAt('/sign-in');
    // Both `magicLink` and `emailAndPassword` default conservatively before
    // the status query resolves ('Send sign-in link' renders optimistically,
    // the toggle does not) — findByRole here is what waits for that data.
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Sign in with a password instead',
      }),
    );
    expect(await screen.findByLabelText(/Password/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send sign-in link' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sign in with a magic link instead',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Send sign-in link' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
  });

  it('signs in with a password and lands where the researcher belongs', async () => {
    mocked.signIn.email.mockResolvedValue({
      data: { token: 'session-token' },
      error: null,
    } as unknown as EmailPasswordResult);
    const router = renderAt('/sign-in');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Sign in with a password instead',
      }),
    );
    const email = await screen.findByLabelText(/Email address/);
    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(LANDING));
    expect(mocked.signIn.email).toHaveBeenCalledWith({
      email: 'researcher@example.com',
      password: 'correct horse battery staple',
    });
  });

  it('reports a generic error for a wrong password', async () => {
    mocked.signIn.email.mockResolvedValue({
      data: null,
      error: { status: 401 },
    } as unknown as EmailPasswordResult);
    renderAt('/sign-in');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Sign in with a password instead',
      }),
    );
    fireEvent.change(await screen.findByLabelText(/Email address/), {
      target: { value: 'researcher@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(
        screen.getByText(/That email or password is not correct/),
      ).toBeInTheDocument(),
    );
  });

  it('reports a failed sign-in when the request never completes', async () => {
    mocked.signIn.email.mockRejectedValue(new Error('network down'));
    renderAt('/sign-in');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Sign in with a password instead',
      }),
    );
    fireEvent.change(await screen.findByLabelText(/Email address/), {
      target: { value: 'researcher@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: 'whatever' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText(/Sign-in did not complete/)).toBeInTheDocument(),
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
        // The same callback the magic link uses, and for the same reason: the
        // provider's redirect back is a document load, and it has to land
        // somewhere that reads the new session (§6.4, §10.4).
        expect.objectContaining({
          provider: 'google',
          callbackURL: '/sign-in',
        }),
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
