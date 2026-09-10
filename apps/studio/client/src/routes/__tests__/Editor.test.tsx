// @vitest-environment jsdom
import { ORPCError } from '@orpc/client';
import { WebSocketLinkTransport } from '@orpc/client/websocket';
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

import { createInMemoryHost } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { rpcClient } from '../../lib/api.ts';
import { authClient } from '../../lib/auth.ts';
import { reportUnauthorizedResponse } from '../../lib/session.ts';
import { createAppRouter } from '../../router.tsx';

const STAGE_A = '11111111-1111-4111-8111-111111111111';
const STAGE_B = '22222222-2222-4222-8222-222222222222';
const queryDraft = vi.hoisted(() => vi.fn());
const DRAFT = {
  protocol: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    draftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Shell proof',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
  revision: { sequence: '2', hash: 'revision-2' },
  sections: {
    settings: { name: 'Shell proof', schemaVersion: 8 },
    stageOrder: { stages: [STAGE_A, STAGE_B] },
    [`stage:${STAGE_A}`]: {
      id: STAGE_A,
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [],
    },
    [`stage:${STAGE_B}`]: {
      id: STAGE_B,
      type: 'Information',
      label: 'Follow-up',
      title: 'Follow-up',
      items: [],
    },
    assets: {},
  },
};

/**
 * What the protocol-builder host holds, which is deliberately NOT what
 * Studio's own draft query answers: the first screen carries a different name
 * in each. The outline is drawn from the draft query and the editor's fields
 * are read over the host contract, so seeding the two apart is what tells them
 * apart — a field showing the outline's name would mean the editor never
 * reached the host at all.
 */
const HOST_SECTIONS: Readonly<Record<string, SectionDoc>> = {
  ...DRAFT.sections,
  [`stage:${STAGE_A}`]: {
    ...DRAFT.sections[`stage:${STAGE_A}`],
    label: 'Welcome, from the host',
  },
};

const TEAM_A = { id: 'team-a', name: 'Alpha research team' };
const TEAM_B = { id: 'team-b', name: 'Beta research team' };

/**
 * The tenancy the editor has to resolve, read at call time so a test can move
 * it before it renders. `owner` is the team `studies.get` answers with; `null`
 * is the server refusing the study altogether, which is what the URL of a
 * study in somebody else's team looks like from here — one FORBIDDEN, with no
 * way to tell "not yours" from "no such study" (§6.3).
 */
const tenancy = {
  teams: [TEAM_A, TEAM_B] as { id: string; name: string }[],
  activeTeam: TEAM_A as { id: string; name: string } | null,
  owner: TEAM_A.id as string | null,
};

const STUDY_ID = DRAFT.protocol.id;

function studyDetail() {
  if (tenancy.owner === null) throw new ORPCError('FORBIDDEN');
  return {
    teamId: tenancy.owner,
    study: {
      id: STUDY_ID,
      name: DRAFT.protocol.name,
      state: 'draft' as const,
      participationMode: 'managed' as const,
      protocolId: DRAFT.protocol.id,
      createdAt: DRAFT.protocol.createdAt,
      waveCount: 0,
      participantCount: 0,
    },
    protocolDraftId: DRAFT.protocol.draftId,
  };
}

const protocolBuilderHost = vi.hoisted((): { client: unknown } => ({
  client: undefined,
}));

vi.mock('@orpc/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orpc/client')>();
  return {
    ...actual,
    // The route builds its host client over `/ws`, which nothing serves yet.
    // The package's in-memory host serves the same contract in process. A
    // getter rather than a value, because the route builds its client while
    // this module is being evaluated — long before a test has seeded a host.
    createORPCClient: () => ({
      get protocolBuilder() {
        return protocolBuilderHost.client;
      },
    }),
  };
});

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'r@example.com' } },
      isPending: false,
    }),
    // The editor resolves the study's OWNING team from the study id, over the
    // teams this researcher belongs to — a study route names no team, and the
    // active-team setting is whichever team route was left last.
    useListOrganizations: vi.fn(() => ({
      data: tenancy.teams,
      error: null,
      isPending: false,
    })),
    useActiveOrganization: vi.fn(() => ({
      data: tenancy.activeTeam,
      error: null,
      isPending: false,
      refetch: vi.fn(),
    })),
    useActiveMember: vi.fn().mockReturnValue({
      data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn(),
    },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    me: {
      queryOptions: () => ({
        queryKey: ['me'],
        queryFn: () => ({
          userId: 'user-1',
          email: 'researcher@example.org',
          emailVerified: true,
          name: 'Researcher',
          // `me` carries the account's UI-language preference; null means
          // "follow the browser" (2026-09-04 localization design §5.2).
          locale: null,
          teams: [{ teamId: 'team-a', role: 'owner' }],
        }),
      }),
      key: () => ['me'],
    },
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: async () => ({
          name: 'Studio',
          version: 'test',
          deployment: { mode: 'managed', billing: false },
        }),
      }),
    },
    studies: {
      // The editor's owning team and draft id both come from here: one
      // procedure, addressed by the study id the URL carries, which resolves
      // the tenant server-side (§6.3).
      get: {
        queryOptions: ({ input }: { input: { studyId: string } }) => ({
          queryKey: ['study', input.studyId],
          queryFn: () => Promise.resolve(studyDetail()),
        }),
        key: ({ input }: { input: { studyId: string } }) => [
          'study',
          input.studyId,
        ],
      },
      list: {
        queryOptions: ({ input }: { input: { teamId: string } }) => ({
          queryKey: ['studies', input.teamId],
          queryFn: () => Promise.resolve([studyDetail().study]),
        }),
        key: ({ input }: { input: { teamId: string } }) => [
          'studies',
          input.teamId,
        ],
      },
      create: { mutationOptions: vi.fn() },
    },
    protocols: {
      draft: {
        // The address travels into the mock so a test can read which team the
        // draft was asked for; the key stays flat, because `refreshDraft`
        // invalidates by exactly this one.
        queryOptions: ({ input }: { input: Record<string, string> }) => ({
          queryKey: ['draft'],
          queryFn: () => queryDraft(input),
        }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: {
    protocols: {
      addInformationStage: vi
        .fn()
        .mockResolvedValue({ sequence: '3', hash: 'r3' }),
      moveStage: vi.fn().mockResolvedValue({ sequence: '3', hash: 'r3' }),
    },
  },
}));

beforeEach(() => {
  tenancy.teams = [TEAM_A, TEAM_B];
  tenancy.activeTeam = TEAM_A;
  tenancy.owner = TEAM_A.id;
  protocolBuilderHost.client = createInMemoryHost({
    protocolId: DRAFT.protocol.id,
    sections: HOST_SECTIONS,
  }).client;
  vi.mocked(authClient.getSession).mockReset();
  vi.mocked(authClient.getSession).mockResolvedValue({
    data: { user: {} },
    error: null,
  });
  vi.mocked(authClient.useSession).mockReset();
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: { name: 'Researcher', email: 'r@example.com' } },
    isPending: false,
  } as ReturnType<typeof authClient.useSession>);
  vi.mocked(authClient.signOut).mockReset();
  queryDraft.mockReset();
  queryDraft.mockResolvedValue(DRAFT);
  vi.mocked(rpcClient.protocols.addInformationStage).mockReset();
  vi.mocked(rpcClient.protocols.addInformationStage).mockResolvedValue({
    sequence: '3',
    hash: 'r3',
  });
  vi.mocked(rpcClient.protocols.moveStage).mockReset();
  vi.mocked(rpcClient.protocols.moveStage).mockResolvedValue({
    sequence: '3',
    hash: 'r3',
  });
  // Nothing in jsdom serves `/ws`, and the socket tests below are about which
  // sockets the transport opens rather than about what a host answers.
  FakeSocket.opened = [];
  FakeSocket.openImmediately = true;
  vi.stubGlobal('WebSocket', FakeSocket);
});

function renderEditor() {
  // One client behind both the router's guards and the components: the
  // session guard reads what a component's `queryClient.clear()` removes.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({
      initialEntries: [`/study/${DRAFT.protocol.id}/editor`],
    }),
    queryClient,
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}

/** The stage-name control every `@codaco/protocol-builder` editor opens with. */
function stageNameField() {
  return screen.getByRole('textbox', { name: 'Stage name' });
}

function findStageNameField() {
  return screen.findByRole('textbox', { name: 'Stage name' });
}

/**
 * A study URL is a canonical link (§2.2, §5.6): it names the study and nothing
 * else, so following one has to open that study whoever follows it and however
 * they got there. Everything here is a way of arriving that does NOT pass
 * through the owning team's screens first.
 */
describe('opening a study by its URL', () => {
  it('opens one owned by a team that is not the active one', async () => {
    // A bookmark, or a link a colleague sent. The setting still names the team
    // this researcher was last acting in, and a study route names no team, so
    // §6.6's reconciler will never move it.
    tenancy.owner = TEAM_B.id;
    tenancy.activeTeam = TEAM_A;
    renderEditor();

    // The editor OPENED — the draft is on screen, not an explanation of why it
    // is not.
    expect(
      await screen.findByRole('heading', { name: 'Protocol sections' }),
    ).toBeInTheDocument();
    expect(await findStageNameField()).toHaveValue('Welcome, from the host');
    // And it opened against the team that owns it, which is what every editing
    // procedure is authorized against.
    await waitFor(() =>
      expect(queryDraft).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: TEAM_B.id }),
      ),
    );
  });

  it('opens one when the session names no active team at all', async () => {
    // Nothing sets `activeOrganizationId` when a session is created, so this
    // is what a first sign-in reads — and with nothing to ask, the editor used
    // to sit on its spinner for as long as the researcher left it there.
    tenancy.activeTeam = null;
    tenancy.owner = TEAM_A.id;
    renderEditor();

    expect(
      await screen.findByRole('heading', { name: 'Protocol sections' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(queryDraft).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: TEAM_A.id }),
      ),
    );
  });

  it('says so, rather than spinning, when the study is refused', async () => {
    // The server refuses a study this researcher cannot reach, whatever the
    // reason, so the one read the screen makes has come back — an unresolved
    // spinner here is not "still working", it is the screen having nothing
    // left to wait for.
    tenancy.owner = null;
    tenancy.activeTeam = null;
    renderEditor();

    // The one thing the researcher can act on: the study is not theirs, so
    // the way forward is being given access rather than a team switch.
    expect(await screen.findByText(/not one of yours/i)).toBeInTheDocument();
    expect(screen.queryByText('Opening protocol editor…')).toBeNull();
  });
});

describe('Studio editor shell', () => {
  it('provides the outline, editing canvas, inspector, and keyboard reorder actions', async () => {
    renderEditor();

    expect(
      await screen.findByRole('heading', { name: 'Protocol sections' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Protocol sections' }),
    ).toBeInTheDocument();
    // The area's own sidebar, which replaced the study's (§5.3): the editor's
    // section selector inside `<main>` is a different region with a different
    // name, and neither is the other's duplicate.
    expect(
      screen.getByRole('navigation', { name: 'Protocol outline' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(
      screen.getByRole('heading', { name: 'Inspector' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Viewers')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Follow-up up' }));
    await waitFor(() =>
      expect(rpcClient.protocols.moveStage).toHaveBeenCalledWith(
        expect.objectContaining({
          stageId: STAGE_B,
          toIndex: 0,
          expectedRevision: DRAFT.revision.sequence,
        }),
      ),
    );
  });

  it('edits the selected screen through the protocol-builder host contract', async () => {
    renderEditor();

    // The stage's own fields, read over the contract: the name on screen is
    // the HOST's copy, which is not the one Studio's outline is drawn from.
    expect(await findStageNameField()).toHaveValue('Welcome, from the host');
    expect(
      screen.getByRole('button', { name: 'WelcomeInformation' }),
    ).toBeInTheDocument();

    // Studio's own save control, rendered through the editor's action slot and
    // pointed at the form the package owns.
    const form = stageNameField().closest('form');
    expect(form).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save screen' })).toHaveAttribute(
      'form',
      form?.id,
    );
  });

  it('keeps non-screen outline sections selectable', async () => {
    renderEditor();
    await findStageNameField();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
      await screen.findByRole('heading', { name: 'Protocol settings' }),
    ).toBeInTheDocument();

    const validationButton = await screen.findByRole('button', {
      name: /protocol valid|validation problems?/i,
    });
    fireEvent.click(validationButton);
    expect(document.getElementById('protocol-problems')).toHaveFocus();
  });

  it('asks before discarding unsaved screen values during outline navigation', async () => {
    renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Follow-upInformation' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Discard unsaved screen changes?',
      }),
    ).toBeInTheDocument();
    expect(label).toHaveValue('Unsaved welcome');

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Discard unsaved screen changes?',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(label).toHaveValue('Unsaved welcome');

    fireEvent.click(
      screen.getByRole('button', { name: 'Follow-upInformation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() => expect(stageNameField()).toHaveValue('Follow-up'));
  });

  it('asks before leaving the editor with unsaved screen values', async () => {
    const { router } = renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });

    // The way out belongs to the area's outline now (§5.5), and it is an
    // ordinary router navigation, so the blocker applies to it without the
    // sidebar knowing anything about the editor (§6.5).
    fireEvent.click(screen.getByRole('link', { name: 'Back to study' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Discard unsaved screen changes?',
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toContain('/editor'),
    );
    expect(label).toHaveValue('Unsaved welcome');

    fireEvent.click(screen.getByRole('link', { name: 'Back to study' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/study/${DRAFT.protocol.id}`,
      ),
    );
  });

  it('keeps the editor open when dirty sign-out is cancelled', async () => {
    const { router } = renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });

    // Sign out lives in the account menu now (§5.5).
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Discard unsaved screen changes?',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Discard unsaved screen changes?',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toContain('/editor');
    expect(label).toHaveValue('Unsaved welcome');
    expect(authClient.signOut).not.toHaveBeenCalled();
  });

  it('does not revive a cancelled sign-out when a later navigation commits', async () => {
    const { router } = renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });

    // Sign out, then think better of it. A blocked navigation's promise does
    // not reject — it parks, and resolves later when some OTHER navigation
    // commits (§6.5) — so the sign-out's continuation is still waiting after
    // this, with nothing to tell it that it was abandoned.
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Discard unsaved screen changes?',
        }),
      ).not.toBeInTheDocument(),
    );

    // Later — a separate decision, minutes later in real time — the
    // researcher goes to their profile, and discards the draft on the way.
    // This is the navigation the parked promise resumes on, and it commits at
    // exactly the pathname the abandoned sign-out was waiting to see.
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Profile' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeInTheDocument();

    // The researcher asked to see their profile, not to be signed out.
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sign-out did not complete/)).toBeNull();
    expect(router.state.resolvedLocation?.pathname).toBe('/account');
  });

  it('bypasses the dirty blocker when the session expires', async () => {
    const { queryClient, router } = renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });
    queryClient.setQueryData(['private-draft'], { name: 'Private draft' });

    // A procedure answers 401, which is the one thing that can report the
    // session ending now that the shell holds no second live channel to
    // `/api/auth/get-session`. The guard re-asks, is told the session is
    // gone, and leaves — past the dirty blocker, because there is no editor
    // state left worth keeping.
    vi.mocked(authClient.getSession).mockResolvedValue({
      data: null,
      error: null,
    });
    await act(() => reportUnauthorizedResponse());

    await waitFor(() =>
      expect(queryClient.getQueryData(['private-draft'])).toBeUndefined(),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
    expect(
      screen.queryByRole('heading', {
        name: 'Discard unsaved screen changes?',
      }),
    ).not.toBeInTheDocument();
  });

  it('keeps a dirty editor mounted when the session cannot be re-read', async () => {
    const { queryClient } = renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });
    queryClient.setQueryData(['private-draft'], { name: 'Private draft' });
    const readsBefore = vi.mocked(authClient.getSession).mock.calls.length;

    // The researcher went to another tab and came back, and while they were
    // away `/api/auth/*` stopped answering. Re-entering the tab re-asks the
    // session (§6.2), and the answer this time is "we could not ask".
    vi.mocked(authClient.getSession).mockResolvedValue({
      data: null,
      error: { status: 500, message: 'unavailable' },
    } as unknown as Awaited<ReturnType<typeof authClient.getSession>>);
    fireEvent(document, new Event('visibilitychange'));

    // The revalidation RAN — the guard re-asked and threw — so the assertions
    // below are about what the shell did with that, not about a listener that
    // never fired.
    await waitFor(() =>
      expect(
        vi.mocked(authClient.getSession).mock.calls.length,
      ).toBeGreaterThan(readsBefore),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // An unreachable server has not said the session is gone, so nothing may
    // be taken away on the strength of it: the editor is STILL THE MOUNTED
    // SCREEN, with the values the researcher typed still in it. Replacing the
    // app match with the error screen unmounts the editor, and `invalidate`
    // runs no blocker, so the work goes without anybody being asked.
    expect(stageNameField()).toHaveValue('Unsaved welcome');
    expect(
      screen.queryByRole('heading', { name: 'Something went wrong' }),
    ).toBeNull();
    // And this researcher's cache is still theirs: clearing it belongs to a
    // CONFIRMED signed-out answer.
    expect(queryClient.getQueryData(['private-draft'])).toEqual({
      name: 'Private draft',
    });
  });

  it('does not add a screen when dirty-edit confirmation is cancelled', async () => {
    renderEditor();
    const label = await findStageNameField();
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Discard unsaved screen changes?',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: 'Discard unsaved screen changes?',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(rpcClient.protocols.addInformationStage).not.toHaveBeenCalled();
    expect(label).toHaveValue('Unsaved welcome');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(rpcClient.protocols.addInformationStage).toHaveBeenCalledTimes(1),
    );
  });

  it('blocks another add attempt until an ambiguous failure is reconciled', async () => {
    vi.mocked(rpcClient.protocols.addInformationStage).mockRejectedValueOnce(
      new Error('response lost'),
    );
    renderEditor();
    await screen.findByRole('heading', { name: 'Protocol sections' });

    const add = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(add);

    expect(
      await screen.findByText(
        /could not confirm whether the screen was added/i,
      ),
    ).toBeInTheDocument();
    expect(add).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh outline' }));
    await waitFor(() => expect(add).toBeEnabled());
  });

  it('blocks another reorder until an ambiguous refresh failure is reconciled', async () => {
    renderEditor();
    // The outline is drawn, so the first read has already been answered and
    // the next one is the refresh the reorder asks for.
    const moveUp = await screen.findByRole('button', {
      name: 'Move Follow-up up',
    });
    queryDraft.mockRejectedValueOnce(new Error('refresh failed'));

    fireEvent.click(moveUp);

    expect(
      await screen.findByText(/could not confirm the new screen order/i),
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /^Move / })) {
      expect(button).toBeDisabled();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Refresh order' }));
    await waitFor(() => expect(moveUp).toBeEnabled());
  });
});

describe('the socket the editor opens', () => {
  it('names this tab on the upgrade URL, so its locks survive a reconnect', async () => {
    const { hostSocketUrl } = await import('../Editor.tsx');
    const { clientSessionId } = await import('../../lib/clientSession.ts');

    const url = new URL(hostSocketUrl());

    expect(url.pathname).toBe('/ws');
    // The id this tab presents everywhere else, not one minted for the socket:
    // a second id would be a second lock owner, and the section this tab is
    // holding would be somebody else's the moment it reconnected.
    expect(url.searchParams.get('clientSession')).toBe(clientSessionId());
    expect(clientSessionId()).not.toBe('');
  });

  /**
   * A socket that has dropped is opened again, rather than answered from.
   *
   * `@orpc/client` does not reconnect unless it is told to: without it the
   * transport hands every later call the peer of the closed socket, so one
   * blip leaves the researcher unable to lock, save or watch anything until
   * they reload — and the host's grace for a tab that comes back, which is
   * what keeps the section they are editing theirs across a drop, is never
   * reached.
   */
  it('opens a new one after a drop, rather than answering from the closed one', async () => {
    const { hostSocketLinkOptions } = await import('../Editor.tsx');
    const transport = new WebSocketLinkTransport(hostSocketLinkOptions);

    ask(transport);
    const dropped = await socketNumber(1);
    dropped.close();

    ask(transport);
    await socketNumber(2);
  });

  /**
   * And it is closed when the session ends.
   *
   * The server reads the principal once, at the upgrade, and authorises and
   * audits every message on the socket as them: a socket left open across
   * sign-out is one the next account to sign in on this tab would be editing
   * through, under the previous researcher's name.
   */
  it('is closed when the editor sessions end, so the next account opens its own', async () => {
    const { hostSocketLinkOptions, beginHostSocketSession } =
      await import('../Editor.tsx');
    const { closeStudioEditorSessions } =
      await import('../../editor/sessionLifecycle.ts');
    const transport = new WebSocketLinkTransport(hostSocketLinkOptions);

    ask(transport);
    const signedIn = await socketNumber(1);

    await closeStudioEditorSessions();

    expect(signedIn.readyState).toBe(FakeSocket.CLOSED);
    // The next account opens a socket of its own, whose handshake carries
    // whatever cookie the browser holds by then — from the moment they open
    // the editor, which is what begins a session again.
    beginHostSocketSession();
    ask(transport);
    await socketNumber(2);
  });

  /**
   * And the reconnection is what has to stop, not just the socket.
   *
   * A call in flight when the researcher signs out is parked inside the
   * transport's own reconnect loop — on a socket that is still connecting, or
   * on the two seconds before the next attempt — and it wakes up after the
   * closer has finished and before `authClient.signOut()` has cleared the
   * cookie, because `shell/useSignOut.ts` releases the editor's lease while
   * the session is still valid. The socket that attempt opens is upgraded as
   * the researcher who just left, and there is no closer left to close it.
   */
  it('opens nothing more once the sessions have ended, with the cookie still valid', async () => {
    const { hostSocketLinkOptions, beginHostSocketSession: beginAgain } =
      await import('../Editor.tsx');
    const { closeStudioEditorSessions } =
      await import('../../editor/sessionLifecycle.ts');
    const transport = new WebSocketLinkTransport(hostSocketLinkOptions);

    // A real socket is CONNECTING for a round trip, and a call made in that
    // window is parked inside the transport waiting on it.
    FakeSocket.openImmediately = false;
    ask(transport);
    const opening = await socketNumber(1);
    expect(opening.readyState).toBe(FakeSocket.CONNECTING);

    await closeStudioEditorSessions();

    await new Promise((resolve) => setTimeout(resolve, PAST_RECONNECT_DELAY));
    expect(opening.readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.opened).toHaveLength(1);

    // The session is module state, so it is left as the next test finds it.
    beginAgain();
  });
});

/**
 * A call over the transport, which is what opens the socket.
 *
 * Nothing answers it — there is no host on the other end of a stubbed socket —
 * so the promise is abandoned rather than awaited, and its rejection when the
 * socket closes is swallowed here so it is not reported as an unhandled one.
 */
/**
 * Long enough for the transport's next reconnection attempt to have happened.
 *
 * `@orpc/client` waits two seconds before every attempt after the first, so a
 * shorter wait would answer "nothing reconnected" before anything could have.
 */
const PAST_RECONNECT_DELAY = 2500;

function ask(transport: WebSocketLinkTransport<Record<never, never>>): void {
  void transport
    .send(
      {
        method: 'POST',
        url: '/ws',
        headers: {},
        body: undefined,
        signal: undefined,
      },
      [],
      { context: {} },
    )
    .catch(() => undefined);
}

/** The nth socket the transport has opened, once it has opened it. */
async function socketNumber(count: number): Promise<FakeSocket> {
  await waitFor(() => expect(FakeSocket.opened).toHaveLength(count));
  const socket = FakeSocket.opened.at(-1);
  if (socket === undefined) throw new Error('no socket was opened');
  return socket;
}

/**
 * A WebSocket that connects to nothing, so the transport's own behaviour is
 * what these tests watch: which sockets it opens, and when.
 */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  /**
   * Whether a socket is open the moment it is constructed.
   *
   * A real one is not — it is CONNECTING for a round trip, which is the window
   * the transport parks a call inside.
   */
  static openImmediately = true;
  static opened: FakeSocket[] = [];
  readyState = FakeSocket.openImmediately
    ? FakeSocket.OPEN
    : FakeSocket.CONNECTING;
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor() {
    FakeSocket.opened.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  send(): void {
    // The host is what would answer, and there is none.
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
    for (const listener of this.#listeners.get('close') ?? []) {
      listener({ code: 1000, reason: 'the socket dropped' });
    }
  }
}
