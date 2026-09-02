// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';
import type { NavManifestEntry } from '../../shell/navigationManifest.ts';
import type { PlaceholderProps } from '../../shell/Placeholder.tsx';

/**
 * What a route's error state does to the landmarks around it.
 *
 * TanStack Router replaces the match that failed and NOTHING above it, so where
 * `ErrorScreen` lands is decided by which match threw. Below an area layout it
 * renders inside the `<main>` that layout is still supplying; at an area layout
 * it renders where no `<main>` exists at all. Both have to end with exactly one
 * main landmark, and it has to be the one the skip link targets — a rule
 * nothing about the route tree states, so each case is rendered.
 *
 * Two mocks put the failure where each case needs it. `Placeholder` is the
 * component of a route in every one of the four areas, and `ManifestNav` is
 * rendered by all four area layouts themselves, so one flag each covers the set
 * rather than whichever area somebody thought to name.
 */

const fixtures = vi.hoisted(() => ({
  TEAM: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  /** Which of the two mocked components throws, if either. */
  failing: undefined as 'area' | 'screen' | undefined,
  STUDY: {
    id: 'study-1',
    draftId: 'draft-1',
    name: 'Shell proof',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
}));

vi.mock('../../shell/Placeholder.tsx', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    default: (props: PlaceholderProps) => ReactElement;
  };
  return {
    ...actual,
    default: (props: PlaceholderProps) => {
      if (fixtures.failing === 'screen') {
        throw new Error('this screen could not be rendered');
      }
      return actual.default(props);
    },
  };
});

type ManifestNavProps = { entries: NavManifestEntry[] };

vi.mock('../../shell/ManifestNav.tsx', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    default: (props: ManifestNavProps) => ReactElement;
  };
  return {
    ...actual,
    default: (props: ManifestNavProps) => {
      if (fixtures.failing === 'area') {
        throw new Error('this area could not be rendered');
      }
      return actual.default(props);
    },
  };
});

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({
      data: { user: {}, session: { activeOrganizationId: 'team-a' } },
      error: null,
    }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [fixtures.TEAM],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn().mockReturnValue({
      data: { ...fixtures.TEAM, members: [], invitations: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveMember: vi.fn().mockReturnValue({
      data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn().mockResolvedValue({ error: null }),
      list: vi.fn().mockResolvedValue({ data: [fixtures.TEAM], error: null }),
    },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: () => ({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          auth: { enabled: true, magicLink: true, socialProviders: [] },
          deployment: { mode: 'managed', billing: false },
        }),
      }),
    },
    protocols: {
      list: {
        queryOptions: () => ({
          queryKey: ['protocols'],
          queryFn: () => [fixtures.STUDY],
        }),
        key: () => ['protocols'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      draft: {
        queryOptions: () => ({ queryKey: ['draft'], queryFn: vi.fn() }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: { protocols: {}, team: {} },
}));

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** One route inside each of the four areas, all of them placeholders. */
const AREA_ROUTES = [
  ['the account area', '/account/language'],
  ['the team area', '/team/team-a/roles'],
  ['the study area', '/study/study-1/versions'],
  ['the protocol outline', '/study/study-1/editor/codebook'],
] as const;

beforeEach(() => {
  fixtures.failing = undefined;
});

describe('a screen that throws inside an area', () => {
  it.each(AREA_ROUTES)('keeps one main landmark in %s', async (_name, url) => {
    fixtures.failing = 'screen';
    renderAt(url);
    await screen.findByRole('heading', {
      level: 1,
      name: 'Something went wrong',
    });

    // The area layout is still mounted, so its `<main id="main-content">` is
    // still there. An error screen that brought its own would nest one inside
    // the other, and the skip link resolves to the outer one (§7.1) — visibly
    // broken for nobody, wrong for everybody using it.
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    // The area's own navigation region survives too, which is what makes the
    // researcher's way out of the failure the sidebar they already had.
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });
});

describe('an area layout that throws', () => {
  it.each(AREA_ROUTES)(
    'still gives the skip link a target in %s',
    async (_name, url) => {
      fixtures.failing = 'area';
      renderAt(url);
      await screen.findByRole('heading', {
        level: 1,
        name: 'Something went wrong',
      });

      // Nothing above the area renders a `<main>` — `AppFrame` deliberately
      // renders neither landmark (§5.3) — so the error screen owns it here,
      // and the shell's bypass has somewhere to go. Without the id the header
      // is a block the keyboard has to walk through with no way past it.
      const mains = screen.getAllByRole('main');
      expect(mains).toHaveLength(1);
      expect(mains[0]).toHaveAttribute('id', 'main-content');

      fireEvent.click(
        screen.getByRole('link', { name: 'Skip to main content' }),
      );
      expect(document.activeElement).toBe(mains[0]);
    },
  );
});

describe('a screen that throws outside the app shell', () => {
  it('owns the main landmark itself', async () => {
    fixtures.failing = 'screen';
    renderAt('/pricing');
    await screen.findByRole('heading', {
      level: 1,
      name: 'Something went wrong',
    });

    // A site route's `<main>` is the screen's own (§7.1), and the error screen
    // replaces the screen — `ScreenMain` and all. So it has to render one.
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });
});

describe('navigating into a route that fails', () => {
  it('lands focus on the error and announces it', async () => {
    fixtures.failing = 'screen';
    const router = renderAt('/team/team-a');
    await screen.findByRole('heading', { level: 1, name: 'Studies' });

    await act(() =>
      router.navigate({
        to: '/team/$teamId/roles',
        params: { teamId: 'team-a' },
      }),
    );

    // A route that fails is still a route change: the link the researcher
    // activated is gone, focus is on `<body>`, and a screen reader is owed the
    // same account of where they now are as on any other arrival.
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Something went wrong',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen
        .queryAllByRole('status')
        .map((region) => region.textContent?.trim() ?? '')
        .filter((text) => text !== ''),
    ).toContain('Something went wrong');
  });
});
