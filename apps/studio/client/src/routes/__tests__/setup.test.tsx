// @vitest-environment jsdom
// First-run setup as the operator drives it (#1909): the form is filled in and
// submitted, and what the procedure answers decides what happens next. The
// screen is the only way into an instance nobody owns, so each refusal has to
// say something different and none of them may look like success.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Conflict,
  NotFound,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';

import { sessionQueryOptions } from '../../lib/session.ts';
import { createAppRouter } from '../../router.tsx';
import { rpcKey } from '../../runtime/rpc.ts';
import {
  installRpcHarness,
  type RpcHarness,
  type StudioHandlers,
} from '../../test/rpcHarness.ts';

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

const STATUS: Omit<InstanceStatus, 'setup'> = {
  name: 'Network Canvas Studio',
  version: '0.1.0',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: [],
  },
  deployment: { mode: 'self-hosted', billing: false },
};

/**
 * Read at call time by the `status` handler: completing setup is what turns
 * this over, and the screen invalidates the query that carries it. The status
 * query is `staleTime: Infinity`, so an answer cached before setup completed
 * would stand for the life of the page — which is what lets the cases below
 * tell a screen that invalidates status from one that does not.
 */
let setupRequired = true;

/**
 * The harness in the shape this file needs it: a real `status` answer, and
 * whatever `setup.complete` is being made to do for one case.
 */
function installSetupHarness(
  complete: StudioHandlers['setup.complete'],
): RpcHarness {
  return installRpcHarness({
    'status': () =>
      Effect.succeed({ ...STATUS, setup: { required: setupRequired } }),
    'setup.complete': complete,
  });
}

/** What the screen sent to one procedure, in the order it sent it. */
function payloadsFor(harness: RpcHarness, tag: string): unknown[] {
  return harness.calls
    .filter((call) => call.tag === tag)
    .map((call) => call.payload);
}

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
  setupRequired = true;
});

describe('completing first-run setup', () => {
  it('sends what the operator typed and leaves them signed in', async () => {
    const harness = installSetupHarness(() =>
      Effect.sync(() => {
        // The server state this call changes. The screen has to go back for
        // it, which is what the status assertion below watches for.
        setupRequired = false;
        // `signedIn` is what says the response also carried the new owner's
        // session cookie; the screen records the session rather than asking
        // for it only when it did.
        return { instanceName: OWNER.instanceName, signedIn: true };
      }),
    );
    const { queryClient, router } = renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(payloadsFor(harness, 'setup.complete')).toEqual([
        {
          token: OWNER.token,
          instanceName: OWNER.instanceName,
          owner: {
            name: OWNER.name,
            email: OWNER.email,
            password: OWNER.password,
          },
        },
      ]),
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
        queryClient.getQueryData<InstanceStatus>(rpcKey('status'))?.setup,
      ).toEqual({ required: false }),
    );
  });

  it('says the token was refused, and stays on the form', async () => {
    installSetupHarness(() => Effect.fail(new Unauthorized({})));
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
    installSetupHarness(() => Effect.fail(new NotFound({})));
    renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(/This instance has already been set up/),
      ).toBeInTheDocument(),
    );
  });

  it('says so when the address already has an account', async () => {
    installSetupHarness(() => Effect.fail(new Conflict({})));
    renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(/already has an account here/),
      ).toBeInTheDocument(),
    );
  });

  it('reports a failure the procedure did not name', async () => {
    // A failure the contract does not declare is a defect rather than one of
    // the three refusals, which is exactly what the screen's catch-all is for.
    installSetupHarness(() => Effect.die(new Error('network down')));
    renderSetup();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Setup did not complete/)).toBeInTheDocument(),
    );
  });
});
