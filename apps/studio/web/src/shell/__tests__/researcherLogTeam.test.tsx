import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import { logResearcher } from '../../runtime/browserLogs.ts';
import { screenTeam, useResearcherLogTeam } from '../useResearcherLogTeam.ts';

const recorded = vi.hoisted(() => ({
  team: undefined as string | undefined,
  logs: [] as Array<string | undefined>,
}));

vi.mock('../../runtime/browserLogs.ts', () => ({
  setResearcherLogTeam: (teamId: string | undefined) => {
    recorded.team = teamId;
  },
  logResearcher: (_entry: ResearcherLogEntry) => {
    recorded.logs.push(recorded.team);
  },
}));

describe('the team a researcher log is attributed to', () => {
  it('is the team route on screen, whatever team was active before', () => {
    expect(screenTeam('team-b', undefined, undefined)).toBe('team-b');
  });

  it('is the open study’s own team on a study route', () => {
    expect(screenTeam(undefined, 'study-1', 'team-of-study')).toBe(
      'team-of-study',
    );
  });

  it('is no team until the study’s team is known, and none off team and study routes', () => {
    expect(screenTeam(undefined, 'study-1', undefined)).toBeUndefined();
    expect(screenTeam(undefined, undefined, 'team-of-study')).toBeUndefined();
  });

  it('is set before a screen beneath it logs from its first effect, on arrival and after moving team', async () => {
    recorded.team = undefined;
    recorded.logs.length = 0;

    function Shell() {
      useResearcherLogTeam();
      return <Outlet />;
    }

    function TeamScreen() {
      const { teamId } = useParams({ strict: false });
      useEffect(() => {
        logResearcher({
          message: 'Screen failed to render',
          level: 'Error',
          attributes: { error_code: 'unknown' },
        });
      }, [teamId]);
      return <h1>{teamId}</h1>;
    }

    const root = createRootRoute({ component: Shell });
    const team = createRoute({
      getParentRoute: () => root,
      path: '/team/$teamId',
      component: TeamScreen,
    });
    const router = createRouter({
      routeTree: root.addChildren([team]),
      history: createMemoryHistory({ initialEntries: ['/team/team-b'] }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'team-b' });

    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: 'team-c' } }),
    );
    await screen.findByRole('heading', { name: 'team-c' });

    await waitFor(() => expect(recorded.logs).toEqual(['team-b', 'team-c']));
  });
});
