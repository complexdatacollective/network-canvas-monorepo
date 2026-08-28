import type { InferContractRouterOutputs } from '@orpc/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

import { authClient } from '../../lib/auth.ts';
import { createAppRouter } from '../../router.tsx';

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn(),
    useSession: vi.fn(),
    useListOrganizations: vi.fn(),
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

const SESSION = {
  user: {
    id: 'user-1',
    email: 'researcher@example.com',
    emailVerified: true,
    name: 'Researcher',
  },
  session: { id: 'session-1' },
};

const signedIn = { data: SESSION, error: null } as unknown as GetSessionResult;
const signedOut = { data: null, error: null } as unknown as GetSessionResult;
const sessionLive = {
  data: SESSION,
  isPending: false,
  error: null,
} as unknown as UseSessionResult;
const sessionNone = {
  data: null,
  isPending: false,
  error: null,
} as unknown as UseSessionResult;

function renderAt(path: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
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
    mocked.useSession.mockReturnValue(sessionLive);
    renderAt('/');
    await waitFor(() =>
      expect(screen.getByText(/Signed in as Researcher/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
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

  it('bounces an already-signed-in visitor off the sign-in page', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    mocked.useSession.mockReturnValue(sessionLive);
    const router = renderAt('/sign-in');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('sign-out', () => {
  it('stays put and reports failure when sign-out does not complete', async () => {
    mocked.getSession.mockResolvedValue(signedIn);
    mocked.useSession.mockReturnValue(sessionLive);
    mocked.signOut.mockResolvedValue({
      data: null,
      error: { status: 500 },
    } as unknown as Awaited<ReturnType<typeof authClient.signOut>>);
    const router = renderAt('/');
    const button = await screen.findByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
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
