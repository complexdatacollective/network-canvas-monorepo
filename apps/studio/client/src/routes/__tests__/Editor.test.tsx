// @vitest-environment jsdom
import { ORPCError } from '@orpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

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
        queryOptions: () => ({
          queryKey: ['draft'],
          queryFn: queryDraft,
        }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: {
    protocols: {
      acquireSection: vi.fn().mockResolvedValue({
        mode: 'editable',
        leaseEpoch: '1',
        nextClientSequence: '1',
      }),
      renewSection: vi.fn().mockResolvedValue({ renewed: true }),
      releaseSection: vi.fn().mockResolvedValue(undefined),
      draft: vi.fn(),
      commitSection: vi
        .fn()
        .mockResolvedValue({ sequence: '3', hash: 'revision-3' }),
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
  vi.mocked(rpcClient.protocols.acquireSection).mockReset();
  vi.mocked(rpcClient.protocols.acquireSection).mockResolvedValue({
    mode: 'editable',
    leaseEpoch: '1',
    nextClientSequence: '1',
  });
  vi.mocked(rpcClient.protocols.renewSection).mockReset();
  vi.mocked(rpcClient.protocols.renewSection).mockResolvedValue({
    renewed: true,
  });
  vi.mocked(rpcClient.protocols.releaseSection).mockReset();
  vi.mocked(rpcClient.protocols.releaseSection).mockResolvedValue(undefined);
  vi.mocked(rpcClient.protocols.commitSection).mockReset();
  vi.mocked(rpcClient.protocols.commitSection).mockResolvedValue({
    sequence: '3',
    hash: 'revision-3',
  });
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
  vi.mocked(rpcClient.protocols.draft).mockReset();
  vi.mocked(rpcClient.protocols.draft).mockResolvedValue(DRAFT);
});

afterEach(() => {
  vi.useRealTimers();
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
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
        'Welcome',
      ),
    );
    // And it opened against the team that owns it, which is what every editing
    // procedure is authorized against.
    await waitFor(() =>
      expect(rpcClient.protocols.acquireSection).toHaveBeenCalledWith(
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
      expect(rpcClient.protocols.acquireSection).toHaveBeenCalledWith(
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

  it('sends a coalesced screen-name command through the leased session', async () => {
    renderEditor();
    const input = await screen.findByRole('textbox', { name: 'Screen name' });
    fireEvent.change(input, { target: { value: 'Welcome screen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save screen' }));

    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: `stage:${STAGE_A}`,
          commands: [{ op: 'set', key: 'label', value: 'Welcome screen' }],
        }),
      ),
    );
  });

  it('updates the screen fields when undoing and redoing a saved change', async () => {
    const firstCommit = deferred<{ sequence: string; hash: string }>();
    const undoCommit = deferred<{ sequence: string; hash: string }>();
    const redoCommit = deferred<{ sequence: string; hash: string }>();
    vi.mocked(rpcClient.protocols.commitSection)
      .mockReturnValueOnce(firstCommit.promise)
      .mockReturnValueOnce(undoCommit.promise)
      .mockReturnValueOnce(redoCommit.promise);
    renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
    const title = screen.getByRole('textbox', { name: 'Page heading' });

    fireEvent.change(label, { target: { value: 'Changed screen' } });
    fireEvent.change(title, { target: { value: 'Changed heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save screen' }));

    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      firstCommit.resolve({ sequence: '3', hash: 'revision-3' });
      await firstCommit.promise;
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
        'Welcome',
      );
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Welcome',
      );
    });
    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(2),
    );
    await act(async () => {
      undoCommit.resolve({ sequence: '4', hash: 'revision-4' });
      await undoCommit.promise;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
        'Changed screen',
      );
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Changed heading',
      );
    });
    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(3),
    );
    await act(async () => {
      redoCommit.resolve({ sequence: '5', hash: 'revision-5' });
      await redoCommit.promise;
    });
  });

  it('keeps non-screen outline sections selectable', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: 'Welcome' });
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
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
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
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
        'Follow-up',
      ),
    );
  });

  it('rebases the dirty baseline after a successful save', async () => {
    const commit = deferred<{ sequence: string; hash: string }>();
    vi.mocked(rpcClient.protocols.commitSection).mockReturnValueOnce(
      commit.promise,
    );
    renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
    fireEvent.change(label, { target: { value: 'Saved welcome' } });
    const save = screen.getByRole('button', { name: 'Save screen' });
    fireEvent.click(save);

    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      commit.resolve({ sequence: '3', hash: 'revision-3' });
      await commit.promise;
    });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(
      screen.getByRole('button', { name: 'Follow-upInformation' }),
    );

    expect(
      screen.queryByRole('heading', {
        name: 'Discard unsaved screen changes?',
      }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('textbox', { name: 'Screen name' }),
    ).toHaveValue('Follow-up');
  });

  it('preserves focus on the save control when a successful save rebases the form', async () => {
    const commit = deferred<{ sequence: string; hash: string }>();
    vi.mocked(rpcClient.protocols.commitSection).mockReturnValueOnce(
      commit.promise,
    );
    renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
    fireEvent.change(label, { target: { value: 'Saved welcome' } });
    const save = screen.getByRole('button', { name: 'Save screen' });
    save.focus();
    expect(save).toHaveFocus();
    fireEvent.click(save);

    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      commit.resolve({ sequence: '3', hash: 'revision-3' });
      await commit.promise;
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save screen' })).toHaveFocus(),
    );
  });

  it.each(['Screen name', 'Page heading'] as const)(
    'preserves focus on %s when an Enter-submitted save rebases the form',
    async (fieldName) => {
      const commit = deferred<{ sequence: string; hash: string }>();
      vi.mocked(rpcClient.protocols.commitSection).mockReturnValueOnce(
        commit.promise,
      );
      renderEditor();
      const field = await screen.findByRole('textbox', { name: fieldName });
      fireEvent.change(field, { target: { value: 'Saved value' } });
      field.focus();
      expect(field).toHaveFocus();
      const form = field.closest('form');
      expect(form).not.toBeNull();
      if (form === null) throw new Error('Screen form was not rendered.');
      fireEvent.submit(form);

      await waitFor(() =>
        expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(1),
      );
      await act(async () => {
        commit.resolve({ sequence: '3', hash: 'revision-3' });
        await commit.promise;
      });

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: fieldName })).toHaveFocus(),
      );
    },
  );

  it.each([
    { action: 'Undo', expectedCommitCount: 1 },
    { action: 'Redo', expectedCommitCount: 2 },
  ] as const)(
    'disables $action while the screen form has unsaved values',
    async ({ action, expectedCommitCount }) => {
      const saveCommit = deferred<{ sequence: string; hash: string }>();
      const undoCommit = deferred<{ sequence: string; hash: string }>();
      vi.mocked(rpcClient.protocols.commitSection)
        .mockReturnValueOnce(saveCommit.promise)
        .mockReturnValueOnce(undoCommit.promise);
      renderEditor();
      const initialLabel = await screen.findByRole('textbox', {
        name: 'Screen name',
      });
      fireEvent.change(initialLabel, {
        target: { value: 'First saved change' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save screen' }));
      await waitFor(() =>
        expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(1),
      );
      await act(async () => {
        saveCommit.resolve({ sequence: '3', hash: 'revision-3' });
        await saveCommit.promise;
      });

      if (action === 'Redo') {
        const undo = await screen.findByRole('button', { name: 'Undo' });
        await waitFor(() => expect(undo).toBeEnabled());
        fireEvent.click(undo);
        await waitFor(() =>
          expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(2),
        );
        await act(async () => {
          undoCommit.resolve({ sequence: '4', hash: 'revision-4' });
          await undoCommit.promise;
        });
      }

      const historyAction = await screen.findByRole('button', { name: action });
      await waitFor(() => expect(historyAction).toBeEnabled());
      const label = screen.getByRole('textbox', { name: 'Screen name' });
      fireEvent.change(label, { target: { value: 'Unsaved typing' } });

      await waitFor(() => expect(historyAction).toBeDisabled());
      expect(historyAction).toHaveAccessibleDescription(
        'Save or discard your screen changes to use Undo and Redo.',
      );
      fireEvent.click(historyAction);
      expect(label).toHaveValue('Unsaved typing');
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(
        expectedCommitCount,
      );
    },
  );

  it('asks before leaving the editor with unsaved screen values', async () => {
    const { router } = renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
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

  it('keeps the editor session open when dirty sign-out is cancelled', async () => {
    const { router } = renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
    fireEvent.change(label, { target: { value: 'Unsaved welcome' } });
    vi.mocked(rpcClient.protocols.releaseSection).mockClear();

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
    expect(rpcClient.protocols.releaseSection).not.toHaveBeenCalled();
    expect(authClient.signOut).not.toHaveBeenCalled();
  });

  it('does not revive a cancelled sign-out when a later navigation commits', async () => {
    const { router } = renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
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
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
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
    await waitFor(() =>
      expect(rpcClient.protocols.releaseSection).toHaveBeenCalledTimes(1),
    );
  });

  it('keeps a dirty editor mounted when the session cannot be re-read', async () => {
    const { queryClient } = renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
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
    expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
      'Unsaved welcome',
    );
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
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
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

  it('disables the old screen form while a confirmed add is in flight', async () => {
    const add = deferred<{ sequence: string; hash: string }>();
    const refresh = deferred<typeof DRAFT>();
    vi.mocked(rpcClient.protocols.addInformationStage).mockReturnValueOnce(
      add.promise,
    );
    renderEditor();
    const label = await screen.findByRole('textbox', { name: 'Screen name' });
    fireEvent.change(label, { target: { value: 'Discard this value' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(rpcClient.protocols.addInformationStage).toHaveBeenCalledTimes(1),
    );

    expect(label).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Page heading' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save screen' })).toBeDisabled();
    expect(label.closest('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Adding a new screen…')).toBeInTheDocument();

    const queryCountBeforeRefresh = queryDraft.mock.calls.length;
    queryDraft.mockReturnValueOnce(refresh.promise);
    await act(async () => {
      add.resolve({ sequence: '3', hash: 'revision-3' });
      await add.promise;
    });
    await waitFor(() =>
      expect(queryDraft.mock.calls.length).toBeGreaterThan(
        queryCountBeforeRefresh,
      ),
    );

    expect(label).toBeDisabled();
    expect(label.closest('form')).toHaveAttribute('aria-busy', 'true');
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
    const moveUp = await screen.findByRole('button', {
      name: 'Move Follow-up up',
    });
    await waitFor(() =>
      expect(queryDraft.mock.calls.length).toBeGreaterThan(1),
    );
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

  it('disables editing when another session holds the screen lease', async () => {
    vi.mocked(rpcClient.protocols.acquireSection).mockResolvedValueOnce({
      mode: 'readOnly',
    });
    renderEditor();

    expect(
      await screen.findByText(/read-only while another editor holds its lock/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Screen name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save screen' })).toBeDisabled();
  });

  it('publishes recurring spectator refreshes to the outline and canvas', async () => {
    vi.useFakeTimers();
    const refreshed = {
      ...DRAFT,
      revision: { sequence: '3', hash: 'revision-3' },
      sections: {
        ...DRAFT.sections,
        [`stage:${STAGE_A}`]: {
          ...DRAFT.sections[`stage:${STAGE_A}`],
          label: 'Changed by collaborator',
          title: 'Changed page heading',
        },
      },
    };
    vi.mocked(rpcClient.protocols.acquireSection).mockResolvedValue({
      mode: 'readOnly',
    });
    vi.mocked(rpcClient.protocols.draft)
      .mockResolvedValueOnce(DRAFT)
      .mockResolvedValueOnce(refreshed);

    const { queryClient } = renderEditor();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
      'Welcome',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByRole('textbox', { name: 'Screen name' })).toHaveValue(
      'Changed by collaborator',
    );
    expect(queryClient.getQueryData(['draft'])).toEqual(refreshed);
    expect(
      screen.getByRole('button', {
        name: 'Changed by collaboratorInformation',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Changed by collaborator' }),
    ).toBeInTheDocument();
  });
});
