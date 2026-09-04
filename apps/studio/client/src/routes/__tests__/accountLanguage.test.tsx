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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';

/**
 * `/account/language` (2026-09-04 localization design §5.3).
 *
 * Three things have to be true of this screen and none of them implies the
 * others: it shows the preference the researcher actually has, choosing takes
 * effect on the spot rather than on a save that does not exist, and the choice
 * reaches the account so it follows them to their other devices.
 */

const fixtures = vi.hoisted(() => ({
  meLocale: null as string | null,
  /**
   * Held open to stage the window before identity resolves: the app shell's
   * guard reads the team list, not `me`, so the screen renders while identity
   * is still in flight.
   */
  meGate: Promise.resolve(),
  updateLocale: vi.fn(),
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
    organization: { setActive: fixtures.setActive, list: fixtures.listTeams },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    me: {
      queryOptions: () => ({
        queryKey: ['me'],
        queryFn: async () => {
          await fixtures.meGate;
          return {
            userId: 'user-1',
            email: 'researcher@example.org',
            emailVerified: true,
            name: 'Researcher',
            locale: fixtures.meLocale,
            teams: [{ teamId: 'team-a', role: 'owner' }],
          };
        },
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
  rpcClient: {
    account: { updateLocale: fixtures.updateLocale },
    protocols: {},
    team: {},
  },
}));

const MIRROR_KEY = 'studio.locale';

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  );
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

function renderLanguagePage() {
  return renderAt('/account/language');
}

function languageSelect() {
  return screen.getByRole('combobox', { name: /Studio language/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  fixtures.meLocale = null;
  fixtures.meGate = Promise.resolve();
  fixtures.updateLocale.mockResolvedValue({ locale: 'en-GB' });
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
  Object.defineProperty(window.navigator, 'languages', {
    value: ['en-US', 'en'],
    configurable: true,
  });
});

describe('the language screen', () => {
  it('is a real screen, not the unbuilt placeholder', async () => {
    renderLanguagePage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Language' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/This screen has not been built yet/),
    ).not.toBeInTheDocument();
    // One h1, spread with the route's focus target, is the shell's contract
    // for every screen (§11.2).
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.querySelectorAll('[data-route-focus-target]')).toHaveLength(
      1,
    );
  });

  it('offers the automatic entry alongside every declared locale', async () => {
    renderLanguagePage();
    await screen.findByRole('heading', { level: 1, name: 'Language' });

    const select = screen.getByRole('combobox', { name: /Studio language/ });
    const labels = Array.from(
      select.querySelectorAll('option'),
      (option) => option.textContent,
    );
    expect(labels).toContain('Automatic (browser language)');
    expect(labels).toContain('English');
    expect(labels).toContain('English (UK)');
  });

  it('shows the researcher the preference their account holds', async () => {
    fixtures.meLocale = 'en-GB';

    renderLanguagePage();
    await screen.findByRole('heading', { level: 1, name: 'Language' });

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /Studio language/ }),
      ).toHaveValue('en-GB');
    });
  });

  it('applies the choice, stores it on the account, and moves the document language', async () => {
    renderLanguagePage();
    await screen.findByRole('heading', { level: 1, name: 'Language' });

    // The before/after pair is the assertion: a screen that saved the
    // preference but did not apply it would pass on the RPC call alone.
    expect(document.documentElement.lang).toBe('en');

    fireEvent.change(
      screen.getByRole('combobox', { name: /Studio language/ }),
      { target: { value: 'en-GB' } },
    );

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-GB');
    });
    expect(fixtures.updateLocale).toHaveBeenCalledWith({ locale: 'en-GB' });
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en-GB');
    expect(
      await screen.findByText(/Language saved/, { selector: '[role=status]' }),
    ).toBeInTheDocument();
  });

  it('keeps the local change when the account write fails, and says so', async () => {
    fixtures.updateLocale.mockRejectedValue(new Error('offline'));

    renderLanguagePage();
    await screen.findByRole('heading', { level: 1, name: 'Language' });

    fireEvent.change(
      screen.getByRole('combobox', { name: /Studio language/ }),
      { target: { value: 'en-GB' } },
    );

    expect(
      await screen.findByText(/could not save it to your account/),
    ).toBeInTheDocument();
    // The device honours the choice regardless: the write failing is a fact
    // about the account, not about what this browser can render.
    expect(document.documentElement.lang).toBe('en-GB');
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en-GB');
  });

  it('keeps a choice made before identity has answered, and stores it', async () => {
    // The shell's guard reads the team list, not `me`, so this screen is on
    // the page while identity is still in flight — and a researcher reading it
    // has every reason to use it. A choice made in that window used to reach
    // nothing at all: no request went out, and the payload that arrived a
    // moment later put them back on the language they had just left.
    fixtures.meLocale = 'en';
    let admitIdentity = () => undefined as void;
    fixtures.meGate = new Promise<void>((resolve) => {
      admitIdentity = resolve;
    });

    const { queryClient } = renderAt('/account/language');
    await screen.findByRole('heading', { level: 1, name: 'Language' });

    fireEvent.change(languageSelect(), { target: { value: 'en-GB' } });
    await waitFor(() => {
      expect(fixtures.updateLocale).toHaveBeenCalledWith({ locale: 'en-GB' });
    });

    // Identity answers with the preference the account held BEFORE the write.
    // Query notifications reach their observers on a macrotask, so the flush
    // below is what lets the payload through `applyServerPreference` — without
    // it this would assert on a screen the answer had not reached yet.
    admitIdentity();
    await waitFor(() => {
      expect(queryClient.getQueryData(['me'])).toBeDefined();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(languageSelect()).toHaveValue('en-GB');
    expect(document.documentElement.lang).toBe('en-GB');
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en-GB');
  });
});

describe('a researcher who belongs to no team', () => {
  beforeEach(() => {
    fixtures.listTeams.mockResolvedValue({ data: [], error: null });
    fixtures.useListOrganizations.mockReturnValue({
      data: [],
      isPending: false,
      error: null,
    });
  });

  it('can still choose the language, on the screen every route sends them to', async () => {
    // Every app route redirects a teamless session to `/no-team` (§6.4), the
    // account area included, so the language screen is one of the addresses
    // they cannot open. The preference is theirs and has nothing to do with
    // teams, which is why the control is on the screen they are held on —
    // the same reason sign-out is.
    renderAt('/account/language');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No team yet' }),
    ).toBeInTheDocument();

    fireEvent.change(languageSelect(), { target: { value: 'en-GB' } });

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-GB');
    });
    expect(fixtures.updateLocale).toHaveBeenCalledWith({ locale: 'en-GB' });
    expect(
      await screen.findByText(/Language saved/, { selector: '[role=status]' }),
    ).toBeInTheDocument();
  });
});
