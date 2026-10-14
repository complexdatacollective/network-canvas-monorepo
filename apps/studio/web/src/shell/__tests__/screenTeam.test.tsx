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
import { describe, expect, it } from 'vitest';

import { ScreenTeamProvider, screenTeam } from '../screenTeam.tsx';
import { useScreenTeam } from '../screenTeamContext.ts';

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

  it('is the route’s team for a screen beneath it from its first effect, on arrival and after moving team', async () => {
    const seen: Array<string | undefined> = [];

    function Shell() {
      return (
        <ScreenTeamProvider>
          <Outlet />
        </ScreenTeamProvider>
      );
    }

    function TeamScreen() {
      const { teamId } = useParams({ strict: false });
      const team = useScreenTeam();
      useEffect(() => {
        seen.push(team.teamId);
      }, [teamId, team]);
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

    await waitFor(() => expect(seen).toEqual(['team-b', 'team-c']));
  });
});
