import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateMemberships } from '../../lib/landing.ts';
import { useActiveTeamReconciler } from '../useActiveTeamReconciler.ts';

type Query = {
  data: { id: string } | undefined;
  error: Error | null;
  refetch: () => Promise<void>;
};

const fixtures = vi.hoisted(() => ({
  committedTeamId: undefined as string | undefined,
  activeTeam: undefined as unknown,
  activeMember: undefined as unknown,
  setActive: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ teamId: fixtures.committedTeamId }),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    useActiveOrganization: () => fixtures.activeTeam,
    useActiveMember: () => fixtures.activeMember,
    organization: { setActive: fixtures.setActive },
  },
}));

vi.mock('../../lib/landing.ts', () => ({
  invalidateMemberships: vi.fn().mockResolvedValue(undefined),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

/**
 * The two Better Auth queries the reconciler reads. A refetch changes what
 * they hold only through `onRefetch`, as in production, where the hooks
 * re-render the component with whatever the refresh left behind.
 */
function installQueries(onRefetch: (query: Query) => void = () => undefined) {
  const makeQuery = (): Query => {
    const query: Query = {
      data: { id: 'team-a' },
      error: null,
      refetch: async () => {
        onRefetch(query);
      },
    };
    return query;
  };
  fixtures.activeTeam = makeQuery();
  fixtures.activeMember = makeQuery();
}

beforeEach(() => {
  vi.mocked(invalidateMemberships).mockClear();
  fixtures.committedTeamId = 'team-b';
  fixtures.setActive.mockReset();
  fixtures.setActive.mockResolvedValue({ error: null });
});

describe('making the active team follow the URL', () => {
  it('writes the team the URL names once, and not again when the settings still read stale', async () => {
    // `disableSignal` means nothing re-reads the active team after the write,
    // so the query can go on naming the old team: only the record of the
    // completed reconciliation stops a second write.
    installQueries();
    const { result, rerender } = renderHook(() => useActiveTeamReconciler(), {
      wrapper,
    });

    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(1));
    expect(fixtures.setActive).toHaveBeenCalledWith(
      { organizationId: 'team-b' },
      { disableSignal: true },
    );

    // The memberships are invalidated once the refresh has been given its
    // chance, which is when the reconciliation is read as settled or failed.
    await waitFor(() => expect(invalidateMemberships).toHaveBeenCalled());
    await act(async () => undefined);
    rerender();
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);
    expect(result.current).toBeUndefined();
  });

  it('writes nothing for a route that names no team', async () => {
    fixtures.committedTeamId = undefined;
    installQueries();
    renderHook(() => useActiveTeamReconciler(), { wrapper });

    expect(fixtures.setActive).not.toHaveBeenCalled();
  });

  it('offers a retry when the refresh after the write failed, and writes again when asked', async () => {
    let failing = true;
    installQueries((query) => {
      query.error = failing ? new Error('refresh failed') : null;
    });
    const { result } = renderHook(() => useActiveTeamReconciler(), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBeDefined());
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);

    // Nothing retries on its own.
    await act(async () => undefined);
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);

    failing = false;
    act(() => result.current?.retry());
    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current).toBeUndefined());
  });

  it('offers a retry when the write was refused', async () => {
    fixtures.setActive.mockResolvedValue({ error: { message: 'refused' } });
    installQueries();
    const { result } = renderHook(() => useActiveTeamReconciler(), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBeDefined());
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);
  });

  it('waits for a write on the wire before writing a different team', async () => {
    let finishFirst: () => void = () => undefined;
    fixtures.setActive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve({ error: null });
        }),
    );
    installQueries();
    const { rerender } = renderHook(() => useActiveTeamReconciler(), {
      wrapper,
    });
    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(1));

    fixtures.committedTeamId = 'team-c';
    rerender();
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishFirst();
    });
    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(2));
    expect(fixtures.setActive).toHaveBeenLastCalledWith(
      { organizationId: 'team-c' },
      { disableSignal: true },
    );
  });
});
