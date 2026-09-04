// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';

/**
 * Which language Studio paints in, and when it knows (2026-09-04 localization
 * design §5.1, invariant 7).
 *
 * The chain has three links and each of them is a different moment: the device
 * mirror decides the FIRST paint, browser negotiation decides it when there is
 * no mirror, and the account preference overrides both as soon as `me`
 * answers. The cases below are written so that a break in any one link leaves
 * the others passing — a test that only ever saw the end state would go green
 * on an app that flashed English at every returning researcher.
 */

const fixtures = vi.hoisted(() => ({
  /** The account's stored preference, as `me` reports it. */
  meLocale: null as string | null,
  /** True while identity has not answered — the first-paint window. */
  meUnresolved: false,
  listTeams: vi.fn(),
  setActive: vi.fn(),
  useListOrganizations: vi.fn(),
  useActiveOrganization: vi.fn(),
  useActiveMember: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: fixtures.useListOrganizations,
    useActiveOrganization: fixtures.useActiveOrganization,
    useActiveMember: fixtures.useActiveMember,
    organization: {
      setActive: fixtures.setActive,
      list: fixtures.listTeams,
    },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    me: {
      queryOptions: () => ({
        queryKey: ['me'],
        queryFn: () =>
          fixtures.meUnresolved
            ? // Identity that never answers: the window the mirror exists for.
              new Promise(() => undefined)
            : Promise.resolve({
                userId: 'user-1',
                email: 'researcher@example.org',
                emailVerified: true,
                name: 'Researcher',
                locale: fixtures.meLocale,
                teams: [{ teamId: 'team-a', role: 'owner' }],
              }),
      }),
      key: () => ['me'],
    },
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: vi.fn().mockResolvedValue({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          auth: {
            enabled: true,
            magicLink: true,
            emailAndPassword: true,
            socialProviders: [],
          },
          deployment: { mode: 'managed', billing: false },
        }),
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
  rpcClient: { account: { updateLocale: vi.fn() }, protocols: {}, team: {} },
}));

const MIRROR_KEY = 'studio.locale';

/** What the browser asks for, which jsdom does not otherwise let a test say. */
function setBrowserLanguages(languages: readonly string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = '';
  fixtures.meLocale = null;
  fixtures.meUnresolved = false;
  fixtures.listTeams.mockResolvedValue({
    data: [{ id: 'team-a', name: 'Alpha research team' }],
    error: null,
  });
  fixtures.useListOrganizations.mockReturnValue({
    data: [{ id: 'team-a', name: 'Alpha research team', slug: 'alpha' }],
    isPending: false,
    error: null,
  });
  fixtures.useActiveOrganization.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  fixtures.useActiveMember.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  fixtures.setActive.mockResolvedValue({ data: null, error: null });
  setBrowserLanguages(['en-US', 'en']);
});

describe('the locale a researcher lands in', () => {
  it('honours the device mirror before identity has answered', async () => {
    // The whole point of the mirror: this researcher's account preference is
    // unreachable for as long as `me` is in flight, and English would be the
    // wrong first paint for a device that already knows better.
    fixtures.meUnresolved = true;
    window.localStorage.setItem(MIRROR_KEY, 'en-GB');

    renderAt('/account');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('negotiates from the browser when no mirror has been written', async () => {
    setBrowserLanguages(['en-GB', 'en']);

    renderAt('/account');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-GB');
    // Negotiation is not a choice, so nothing is stored: a researcher whose
    // browser changes its mind gets the new answer rather than a preference
    // they never made.
    expect(window.localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it('falls back to English when the browser asks for nothing Studio has', async () => {
    setBrowserLanguages(['fr-FR', 'de']);

    renderAt('/account');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('LocaleSync, once identity answers', () => {
  it('applies a differing server preference and mirrors it to the device', async () => {
    // The device negotiated English; the account says otherwise. The server
    // wins, and the mirror is brought into line so the next first paint on
    // this device is already right.
    setBrowserLanguages(['en-US', 'en']);
    fixtures.meLocale = 'en-GB';

    renderAt('/account');

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-GB');
    });
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en-GB');
  });

  it('clears a mirror the account no longer agrees with', async () => {
    // "Automatic" is a real answer, and a stale mirror is exactly what it has
    // to overrule: this device was pinned to en-GB, and the account has since
    // been set back to following the browser.
    window.localStorage.setItem(MIRROR_KEY, 'en-GB');
    setBrowserLanguages(['en-US', 'en']);
    fixtures.meLocale = null;

    renderAt('/account');

    await waitFor(() => {
      expect(window.localStorage.getItem(MIRROR_KEY)).toBeNull();
    });
    expect(document.documentElement.lang).toBe('en');
  });

  it('leaves a matching preference alone', async () => {
    window.localStorage.setItem(MIRROR_KEY, 'en-GB');
    fixtures.meLocale = 'en-GB';

    renderAt('/account');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-GB');
    });
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en-GB');
  });

  it('applies it on a focused route outside the app shell', async () => {
    // `/no-team` is in the focused branch, a sibling of `AppLayout`, and a
    // researcher who belongs to no team can spend their entire visit on it.
    // While the synchroniser was mounted inside the app shell it never ran
    // here, so a preference set on another device was silently ignored for
    // that whole visit.
    fixtures.useListOrganizations.mockReturnValue({
      data: [],
      isPending: false,
      error: null,
    });
    fixtures.listTeams.mockResolvedValue({ data: [], error: null });
    setBrowserLanguages(['en-US', 'en']);
    fixtures.meLocale = 'en-GB';

    renderAt('/no-team');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No team yet' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-GB');
    });
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en-GB');
  });
});

describe('a signed-out screen', () => {
  it('renders in the negotiated locale, with no session to read a preference from', async () => {
    // Sign-in is below the same provider as the rest of the app (it is mounted
    // on the root route), so a researcher whose browser asks for British
    // English meets Studio in it before they have an account to store it on.
    setBrowserLanguages(['en-GB', 'en']);

    renderAt('/sign-in');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-GB');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
