// @vitest-environment jsdom
// First-run setup as the operator drives it (#1909): the form is filled in and
// submitted, and what the procedure answers decides what happens next. The
// screen is the only way into an instance nobody owns, so each refusal has to
// say something different and none of them may look like success.
import { ORPCError } from '@orpc/client';
import type { InferContractRouterOutputs } from '@orpc/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

import { sessionQueryOptions } from '../../lib/session.ts';
import { createAppRouter } from '../../router.tsx';

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    // A signed-out visitor: setting an instance up is what creates the first
    // account, so there is no session until this screen makes one.
    getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    useSession: vi
      .fn()
      .mockReturnValue({ data: null, isPending: false, error: null }),
    useListOrganizations: vi
      .fn()
      .mockReturnValue({ data: [], isPending: false, error: null }),
    useActiveOrganization: vi.fn().mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveMember: vi.fn().mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn(),
      list: vi.fn(() => Promise.resolve({ data: [], error: null })),
    },
    signOut: vi.fn(),
  },
}));

type Status = InferContractRouterOutputs<typeof contract>['status'];

const fixtures = vi.hoisted(() => ({
  complete: vi.fn(),
  // Read at call time: completing setup is what turns this over, and the
  // screen invalidates the query that carries it.
  setup: { required: true },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      // The caller's options are carried through — `staleTime: Infinity`, in
      // `lib/deployment.ts`. Dropping them would make every `fetchQuery` go
      // back to the queryFn, and the cases below could not tell a screen that
      // invalidates status from one that does not.
      queryOptions: (options?: { staleTime?: number }) => ({
        ...options,
        queryKey: ['status'],
        queryFn: (): Status => ({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          auth: {
            enabled: true,
            magicLink: true,
            emailAndPassword: true,
            socialProviders: [],
          },
          deployment: { mode: 'self-hosted', billing: false },
          setup: fixtures.setup,
        }),
      }),
    },
    me: {
      queryOptions: () => ({ queryKey: ['me'], queryFn: vi.fn() }),
      key: () => ['me'],
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
  rpcClient: { setup: { complete: fixtures.complete } },
}));

const OWNER = {
  token: 'a-bootstrap-token',
  instanceName: 'Department of Social Research',
  name: 'Ada Owner',
  email: 'ada@example.org',
  password: 'correct horse battery staple',
};

function renderSetup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/setup'] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

async function fillAndSubmit() {
  fireEvent.change(await screen.findByLabelText(/Setup token/), {
    target: { value: OWNER.token },
  });
  fireEvent.change(screen.getByLabelText(/Name of this instance/), {
    target: { value: OWNER.instanceName },
  });
  fireEvent.change(screen.getByLabelText(/Your name/), {
    target: { value: OWNER.name },
  });
  fireEvent.change(screen.getByLabelText(/Your email address/), {
    target: { value: OWNER.email },
  });
  fireEvent.change(screen.getByLabelText(/Choose a password/), {
    target: { value: OWNER.password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Set up this instance' }));
}

beforeEach(() => {
  fixtures.setup = { required: true };
  fixtures.complete.mockReset();
});

describe('completing first-run setup', () => {
  it('sends what the operator typed and leaves them signed in', async () => {
    fixtures.complete.mockImplementation(() => {
      // The server state this call changes. The screen has to go back for it:
      // the status query is `staleTime: Infinity`, so an answer cached before
      // setup completed would stand for the life of the page.
      fixtures.setup = { required: false };
      return Promise.resolve({ instanceName: OWNER.instanceName });
    });
    const { queryClient, router } = renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(fixtures.complete).toHaveBeenCalledWith({
        token: OWNER.token,
        instanceName: OWNER.instanceName,
        owner: {
          name: OWNER.name,
          email: OWNER.email,
          password: OWNER.password,
        },
      }),
    );
    // The response carried the session cookie, so the screen records the
    // session rather than asking for it — and hands the researcher on to the
    // landing resolution, which for an owner with no team yet is `/no-team`.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/no-team'),
    );
    expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toBe(
      'signedIn',
    );
    // Status was asked again, and the cache carries the new answer rather than
    // the one the route guard resolved a moment ago.
    await waitFor(() =>
      expect(
        (queryClient.getQueryData(['status']) as Status | undefined)?.setup,
      ).toEqual({ required: false }),
    );
  });

  it('says the token was refused, and stays on the form', async () => {
    fixtures.complete.mockRejectedValue(new ORPCError('UNAUTHORIZED'));
    const { queryClient, router } = renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(/That setup token is not valid/),
      ).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/setup');
    // A refusal establishes no session. Only the auth endpoint may say what
    // the session is, and it has said nobody is signed in.
    expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).not.toBe(
      'signedIn',
    );
    expect(screen.getByLabelText(/Setup token/)).toBeInTheDocument();
  });

  it('says so when somebody else set the instance up first', async () => {
    fixtures.complete.mockRejectedValue(new ORPCError('NOT_FOUND'));
    renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(/This instance has already been set up/),
      ).toBeInTheDocument(),
    );
  });

  it('says so when the address already has an account', async () => {
    fixtures.complete.mockRejectedValue(new ORPCError('CONFLICT'));
    renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(/already has an account here/),
      ).toBeInTheDocument(),
    );
  });

  it('reports a failure the procedure did not name', async () => {
    fixtures.complete.mockRejectedValue(new Error('network down'));
    renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Setup did not complete/)).toBeInTheDocument(),
    );
  });
});
