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
    signIn: { magicLink: vi.fn() },
    signOut: vi.fn(),
  },
}));

// The mock payload is derived from the real contract, so a schema change
// here fails the tests instead of silently drifting.
const STATUS = {
  name: 'Network Canvas Studio',
  version: '0.1.0',
  auth: { enabled: true, magicLink: true },
} satisfies InferContractRouterOutputs<typeof contract>['status'];

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: () => STATUS,
      }),
    },
  },
}));

const mocked = vi.mocked(authClient, true);

type GetSessionResult = Awaited<ReturnType<typeof authClient.getSession>>;
type UseSessionResult = ReturnType<typeof authClient.useSession>;
type MagicLinkResult = Awaited<ReturnType<typeof authClient.signIn.magicLink>>;

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
  mocked.getSession.mockResolvedValue(signedOut);
  mocked.useSession.mockReturnValue(sessionNone);
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
    // A possibly-authenticated user must not be bounced to sign-in.
    expect(router.state.location.pathname).toBe('/');
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
    // The escape hatch back to the form for a mistyped-but-deliverable
    // address.
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

  it('explains an expired link when the verify redirect carries an error', async () => {
    renderAt('/sign-in?error=EXPIRED_TOKEN');
    await waitFor(() =>
      expect(
        screen.getByText(/That sign-in link is no longer valid/),
      ).toBeInTheDocument(),
    );
  });
});
