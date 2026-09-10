// @vitest-environment jsdom
import { ORPCError } from '@orpc/client';
import type { ClientLink } from '@orpc/client';
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
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { rpcClient } from '../../lib/api.ts';
import { authClient } from '../../lib/auth.ts';
import { reportUnauthorizedResponse } from '../../lib/session.ts';
import { createAppRouter } from '../../router.tsx';

const STAGE_A = '11111111-1111-4111-8111-111111111111';
const STAGE_B = '22222222-2222-4222-8222-222222222222';
const STAGE_C = '33333333-3333-4333-8333-333333333333';
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
 * in each, and the draft query is two revisions ahead of the host.
 *
 * Seeding the two apart is what tells them apart. Everything the editor draws
 * of the protocol — the stage's fields, the outline, the validation, the
 * revision a reorder is fenced on — is the HOST's, so a screen named
 * "Welcome" anywhere on this page would mean that part of it is still being
 * drawn from a second reading nothing keeps current (#1810).
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

/** The host these tests seed, kept so a second caller can be made from it. */
let host: ReturnType<typeof createInMemoryHost>;
type HostClient = ReturnType<typeof createInMemoryHost>['client'];

const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

/**
 * What Studio's OWN commands did to the draft.
 *
 * `protocols.addInformationStage` and `protocols.moveStage` are Studio's, not
 * the protocol contract's: they write the draft and publish nothing on the
 * protocol channel. A client that only listens never hears about them, so the
 * editor has to read the protocol back — and a host whose answers have changed
 * with no event to announce it is the only thing that can tell a re-read from
 * a subscription.
 */
const commandWrote = new Map<ProtocolSectionId, SectionDoc>();

const COMMAND_REVISION = { sequence: 3n, contentHash: 'written-by-command' };

/**
 * Sections this host will not answer for, and how it declines: `withheld` is a
 * section still on its way, `rejected` one whose read has failed.
 */
const unreadableSections = new Map<
  ProtocolSectionId,
  'withheld' | 'rejected'
>();

/** The reads parked by `withheld`, waiting for the test to let them through. */
const withheldReads: (() => void)[] = [];

/** Lets every parked read through, as the host finally answering would. */
function answerWithheldSections(): void {
  unreadableSections.clear();
  for (const release of withheldReads.splice(0)) release();
}

/**
 * The seeded host with some of its procedures answered differently.
 *
 * A proxy rather than a copy: the contract client is itself a proxy, so
 * spreading it yields an object with none of the procedures on it.
 */
function overriding(
  client: HostClient,
  overrides: Partial<HostClient>,
): HostClient {
  return new Proxy(client, {
    get: (target, key, receiver) =>
      Object.hasOwn(overrides, key)
        ? overrides[key as keyof HostClient]
        : Reflect.get(target, key, receiver),
  });
}

/** A host that has not answered for every section it listed. */
function hostRefusingSomeSections(client: HostClient): HostClient {
  return overriding(client, {
    getSection: async (...args: Parameters<HostClient['getSection']>) => {
      const refusal = unreadableSections.get(
        sectionId(parseSectionId(args[0].sectionId)),
      );
      if (refusal === 'rejected') throw new Error('the section is unreadable');
      if (refusal === 'withheld') {
        await new Promise<void>((resolve) => withheldReads.push(resolve));
      }
      return client.getSection(...args);
    },
  });
}

function commandWriteFor(id: string): SectionDoc | undefined {
  return commandWrote.get(sectionId(parseSectionId(id)));
}

/** A host Studio's own commands have written to, with no event to say so. */
function hostAnsweringCommandWrites(client: HostClient): HostClient {
  const overrides: Partial<HostClient> = {
    getSection: async (...args: Parameters<HostClient['getSection']>) => {
      const written = commandWriteFor(args[0].sectionId);
      if (written === undefined) return client.getSection(...args);
      return { document: written, revision: COMMAND_REVISION };
    },
    acquireLock: async (...args: Parameters<HostClient['acquireLock']>) => {
      const written = commandWriteFor(args[0].sectionId);
      if (written === undefined) return client.acquireLock(...args);
      return {
        lock: 'held' as const,
        document: written,
        revision: COMMAND_REVISION,
      };
    },
    listSections: async (...args: Parameters<HostClient['listSections']>) => {
      const { sectionIds } = await client.listSections(...args);
      return {
        sectionIds: [
          ...sectionIds,
          ...[...commandWrote.keys()].filter((id) => !sectionIds.includes(id)),
        ],
      };
    },
  };
  return overriding(client, overrides);
}

let writes = 0;
const nextRequestId = (): string => `write-${(writes += 1)}`;

/**
 * A second connection to the same protocol, which is a second lock owner and a
 * second editor: what a collaborator's screen, rename, deletion or reorder
 * looks like from here.
 */
function collaborator() {
  return host.asCollaborator({
    sessionId: 'session-2',
    userId: 'user-2',
    displayName: 'Bo',
  });
}

/** A screen a collaborator adds, through the contract's own `create`. */
async function collaboratorAddsScreen(label: string): Promise<void> {
  await collaborator().create({
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    kind: 'stage',
    document: { type: 'Information', label, title: label, items: [] },
  });
}

/** A screen a collaborator renames, through the contract's own `submit`. */
async function collaboratorRenamesScreen(
  stageId: string,
  label: string,
): Promise<void> {
  const client = collaborator();
  const target = sectionId({ kind: 'stage', stageId });
  const held = await client.acquireLock({
    protocolId: DRAFT.protocol.id,
    sectionId: target,
  });
  await client.submit({
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    sectionId: target,
    document: { ...held.document, label },
    revision: held.revision,
  });
  await client.releaseLock({
    protocolId: DRAFT.protocol.id,
    sectionId: target,
  });
}

/** The stage order, put back as it should be, by a collaborator's submit. */
async function collaboratorRepairsStageOrder(): Promise<void> {
  const client = collaborator();
  const order = sectionId({ kind: 'stageOrder' });
  const held = await client.acquireLock({
    protocolId: DRAFT.protocol.id,
    sectionId: order,
  });
  await client.submit({
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    sectionId: order,
    document: { stages: [STAGE_A, STAGE_B] },
    revision: held.revision,
  });
  await client.releaseLock({ protocolId: DRAFT.protocol.id, sectionId: order });
}

/** A screen a collaborator removes, through the contract's own `delete`. */
async function collaboratorDeletesScreen(stageId: string): Promise<void> {
  await collaborator().delete({
    protocolId: DRAFT.protocol.id,
    sectionId: sectionId({ kind: 'stage', stageId }),
  });
}

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
        // draft was asked for. No `key`: nothing invalidates this query any
        // more, because nothing on the screen is drawn from it beyond the
        // draft's existence and the protocol's name.
        queryOptions: ({ input }: { input: Record<string, string> }) => ({
          queryKey: ['draft'],
          queryFn: () => queryDraft(input),
        }),
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
  writes = 0;
  commandWrote.clear();
  unreadableSections.clear();
  withheldReads.length = 0;
  host = createInMemoryHost({
    protocolId: DRAFT.protocol.id,
    sections: HOST_SECTIONS,
  });
  protocolBuilderHost.client = hostRefusingSomeSections(
    hostAnsweringCommandWrites(host.client),
  );
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

/** The interview screens the outline is showing, in the order it shows them. */
function outlineScreens(): (string | null)[] {
  return screen
    .queryAllByRole('button', { name: /Information$/ })
    .map((entry) => entry.textContent);
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

    fireEvent.click(
      await screen.findByRole('button', { name: 'Move Follow-up up' }),
    );
    // The seeded host is at revision 0 and the draft query says 2. The order
    // this move was computed from is the one on screen, so the revision it is
    // fenced on is the host's.
    await waitFor(() =>
      expect(rpcClient.protocols.moveStage).toHaveBeenCalledWith(
        expect.objectContaining({
          stageId: STAGE_B,
          toIndex: 0,
          expectedRevision: '0',
        }),
      ),
    );
  });

  it('edits the selected screen through the protocol-builder host contract', async () => {
    renderEditor();

    // The stage's own fields, and the outline entry beside them, are both the
    // HOST's copy — one reading of one protocol. The draft query still calls
    // this screen "Welcome".
    expect(await findStageNameField()).toHaveValue('Welcome, from the host');
    expect(
      screen.getByRole('button', { name: 'Welcome, from the hostInformation' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'WelcomeInformation' }),
    ).toBeNull();

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

  /**
   * Studio's add and reorder write the draft through commands of its own,
   * which publish nothing on the protocol channel. Nothing else will ever tell
   * this tab what they did, so the outline they change is the one thing on
   * this screen that is READ back rather than subscribed to.
   */
  it('shows the order a reorder of this researcher\u2019s left behind', async () => {
    vi.mocked(rpcClient.protocols.moveStage).mockImplementation(async () => {
      commandWrote.set(STAGE_ORDER, { stages: [STAGE_B, STAGE_A] });
      return { sequence: '3', hash: 'r3' };
    });
    renderEditor();
    const moveUp = await screen.findByRole('button', {
      name: 'Move Follow-up up',
    });
    expect(outlineScreens()).toEqual([
      'Welcome, from the hostInformation',
      'Follow-upInformation',
    ]);

    fireEvent.click(moveUp);

    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'Welcome, from the hostInformation',
      ]),
    );
  });

  it('shows the screen an add of this researcher\u2019s left behind', async () => {
    vi.mocked(rpcClient.protocols.addInformationStage).mockImplementation(
      async ({ stageId }) => {
        commandWrote.set(sectionId({ kind: 'stage', stageId }), {
          id: stageId,
          type: 'Information',
          title: '',
          items: [],
        });
        commandWrote.set(STAGE_ORDER, { stages: [STAGE_A, STAGE_B, stageId] });
        return { sequence: '3', hash: 'r3' };
      },
    );
    renderEditor();
    await findStageNameField();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Named for its position, because the researcher has not named it yet, and
    // selected, because adding a screen is asking to edit it.
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Welcome, from the hostInformation',
        'Follow-upInformation',
        'Screen 3Information',
      ]),
    );
    expect(
      screen.getByRole('button', { name: 'Screen 3Information' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('blocks another reorder until an ambiguous failure is reconciled', async () => {
    // Studio's reorder is a command of its own, outside the protocol
    // contract, so a lost answer leaves the new order unknown to this tab.
    vi.mocked(rpcClient.protocols.moveStage).mockRejectedValueOnce(
      new Error('response lost'),
    );
    renderEditor();
    const moveUp = await screen.findByRole('button', {
      name: 'Move Follow-up up',
    });

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

/**
 * What a collaborator does reaches this screen because the screen is drawn
 * from the protocol the package holds, which one channel keeps current.
 *
 * Nothing in any of these tests touches the editor: no save, no add, no
 * navigation, nothing that would refetch anything. That is the whole point —
 * the outline, the labels and the reorder's fence used to sit on a second
 * reading of the protocol that only a local action ever refreshed, so a
 * collaborator's work was invisible here until something unrelated happened
 * to ask for the draft again (#1810).
 */
/**
 * The outline, the position a reorder points at and the validation panel are
 * readings of the protocol as a WHOLE, so a protocol that is not all here yet
 * is not a smaller protocol: an index in a list with a hole in it is not an
 * index in the interview, and an empty list is not a protocol with no screens.
 */
describe('a protocol that is not all here', () => {
  /** The three-screen protocol these tests need, with one screen unanswered. */
  function seedThreeScreens(missing: string, how: 'withheld' | 'rejected') {
    host = createInMemoryHost({
      protocolId: DRAFT.protocol.id,
      sections: {
        ...HOST_SECTIONS,
        stageOrder: { stages: [STAGE_A, STAGE_B, STAGE_C] },
        [`stage:${STAGE_C}`]: {
          id: STAGE_C,
          type: 'Information',
          label: 'Closing',
          title: 'Closing',
          items: [],
        },
      },
    });
    unreadableSections.set(sectionId({ kind: 'stage', stageId: missing }), how);
    protocolBuilderHost.client = hostRefusingSomeSections(
      hostAnsweringCommandWrites(host.client),
    );
  }

  it('draws no outline, and offers no move, until all of it is here', async () => {
    // The FIRST screen is the one still on its way, so a list drawn from what
    // has arrived would show Follow-up and Closing at positions 0 and 1 —
    // "move Closing up" would ask for index 0, the front of the interview,
    // when Closing's own place is 2 and one step up from it is 1.
    seedThreeScreens(STAGE_A, 'withheld');
    renderEditor();

    expect(
      await screen.findByText('Reading the protocol…'),
    ).toBeInTheDocument();
    expect(outlineScreens()).toEqual([]);
    expect(screen.queryAllByRole('button', { name: /^Move / })).toEqual([]);
    // Never this: the protocol has three screens in it.
    expect(
      screen.queryByText('Add a screen to begin the interview flow.'),
    ).toBeNull();

    // And once the last of it arrives, the position on screen is the position
    // in the interview.
    await act(async () => {
      answerWithheldSections();
    });
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Welcome, from the hostInformation',
        'Follow-upInformation',
        'ClosingInformation',
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move Closing up' }));
    await waitFor(() =>
      expect(rpcClient.protocols.moveStage).toHaveBeenCalledWith(
        expect.objectContaining({ stageId: STAGE_C, toIndex: 1 }),
      ),
    );
  }, 20_000);

  it('says a section could not be read, rather than checking for ever', async () => {
    seedThreeScreens(STAGE_B, 'rejected');
    renderEditor();

    // Past the query's own retries. Nothing asks again after them — the
    // package's cache never refetches — so "still checking" here is a wait
    // with no end rather than an answer on its way.
    expect(
      await screen.findByText(
        'Part of this protocol could not be read, so its screens are not shown.',
        {},
        { timeout: 15_000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Protocol not checked' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Part of this protocol could not be read, so it has not been checked.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Checking this protocol…')).toBeNull();
    expect(outlineScreens()).toEqual([]);

    // And the researcher can ask for it again.
    unreadableSections.clear();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Welcome, from the hostInformation',
        'Follow-upInformation',
        'ClosingInformation',
      ]),
    );
  }, 30_000);
});

describe('what a collaborator changes', () => {
  it('adds their new screen to the outline', async () => {
    renderEditor();
    await findStageNameField();
    expect(
      screen.getAllByRole('button', { name: /Information$/ }),
    ).toHaveLength(2);

    await act(async () => {
      await collaboratorAddsScreen('Consent');
    });

    expect(
      await screen.findByRole('button', { name: 'ConsentInformation' }),
    ).toBeInTheDocument();
  });

  it('renames the screen they renamed', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });

    await act(async () => {
      await collaboratorRenamesScreen(STAGE_B, 'Follow-up, renamed');
    });

    expect(
      await screen.findByRole('button', {
        name: 'Follow-up, renamedInformation',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Follow-upInformation' }),
    ).toBeNull();
    // The control that moves it is named after it too, so a screen reader is
    // not offering to move a screen by a name nobody can see any more.
    expect(
      screen.getByRole('button', { name: 'Move Follow-up, renamed up' }),
    ).toBeInTheDocument();
  });

  it('takes the screen they deleted out of the outline', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });

    await act(async () => {
      await collaboratorDeletesScreen(STAGE_B);
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Follow-upInformation' }),
      ).toBeNull(),
    );
    expect(
      screen.getAllByRole('button', { name: /Information$/ }),
    ).toHaveLength(1);
  });

  it('is what a reorder is then fenced on', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });

    // Their save takes the protocol to revision 1. The draft query still says
    // 2 and never hears about this at all, so quoting it would fence this
    // reorder on a revision that never existed.
    await act(async () => {
      await collaboratorRenamesScreen(STAGE_B, 'Follow-up, renamed');
    });
    await screen.findByRole('button', {
      name: 'Follow-up, renamedInformation',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Move Follow-up, renamed up' }),
    );

    await waitFor(() =>
      expect(rpcClient.protocols.moveStage).toHaveBeenCalledWith(
        expect.objectContaining({
          stageId: STAGE_B,
          toIndex: 0,
          expectedRevision: '1',
        }),
      ),
    );
  });

  it('is what the validation panel is checking', async () => {
    // A protocol whose stage order names a screen it does not have. Nothing is
    // wrong with any one section of it, which is what the panel is there to
    // catch — and Studio's draft query answers with a consistent protocol, so
    // a panel drawn from that one reports nothing here at all.
    host = createInMemoryHost({
      protocolId: DRAFT.protocol.id,
      sections: {
        ...HOST_SECTIONS,
        stageOrder: { stages: [STAGE_A, STAGE_B, 'no-such-stage'] },
      },
    });
    protocolBuilderHost.client = hostRefusingSomeSections(
      hostAnsweringCommandWrites(host.client),
    );
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });

    expect(
      await screen.findByText('stageOrder names missing stage no-such-stage'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '1 validation problem' }),
    ).toBeInTheDocument();

    // And it is checked again against what the channel delivers, so the
    // researcher is not left reading a problem a collaborator has fixed.
    await act(async () => {
      await collaboratorRepairsStageOrder();
    });

    expect(
      await screen.findByRole('button', { name: 'Protocol valid' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No validation problems.')).toBeInTheDocument();
  });
});

describe('the socket the editor opens', () => {
  // The session is module state, as a tab's is. Each of these tests is a fresh
  // tab, so whatever the one before it left open is ended first.
  beforeEach(async () => {
    const { closeStudioEditorSessions } =
      await import('../../editor/sessionLifecycle.ts');
    await closeStudioEditorSessions();
    FakeSocket.opened = [];
  });

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
    const { currentHostSession } = await import('../Editor.tsx');
    const session = currentHostSession();

    ask(session, 'lockTheStage');
    const dropped = await socketNumber(1);
    dropped.close();

    ask(session, 'lockTheStage');
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
    const { currentHostSession } = await import('../Editor.tsx');
    const { closeStudioEditorSessions } =
      await import('../../editor/sessionLifecycle.ts');

    ask(currentHostSession(), 'lockTheStage');
    const signedIn = await socketNumber(1);

    await closeStudioEditorSessions();

    expect(signedIn.readyState).toBe(FakeSocket.CLOSED);
    // The next account's first call opens a socket of its own, whose
    // handshake carries whatever cookie the browser holds by then.
    ask(currentHostSession(), 'lockTheStage');
    await socketNumber(2);
  });

  /**
   * And the reconnection stops with it, not just the socket.
   *
   * A call in flight when the researcher signs out is parked inside the
   * transport's own reconnect loop — on a socket that is still connecting, or
   * on the delay before the next attempt — and it wakes up after the closer
   * has finished and before `authClient.signOut()` has cleared the cookie,
   * because `shell/useSignOut.ts` releases the editor's lease while the
   * session is still valid. The socket that attempt opens is upgraded as the
   * researcher who just left, and there is no closer left to close it.
   */
  it('opens nothing more once the sessions have ended, with the cookie still valid', async () => {
    const { currentHostSession } = await import('../Editor.tsx');
    const { closeStudioEditorSessions } =
      await import('../../editor/sessionLifecycle.ts');

    // A real socket is CONNECTING for a round trip, and a call made in that
    // window is parked inside the transport waiting on it.
    FakeSocket.openImmediately = false;
    ask(currentHostSession(), 'lockTheStage');
    const opening = await socketNumber(1);
    expect(opening.readyState).toBe(FakeSocket.CONNECTING);

    await closeStudioEditorSessions();

    await new Promise((resolve) => setTimeout(resolve, PAST_RECONNECT_DELAY));
    expect(opening.readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.opened).toHaveLength(1);
  });

  /**
   * And a call the ended session parked is never carried on the next one.
   *
   * Refusing to open a socket does not settle that call: an `RPCLink` with
   * reconnection enabled swallows what `connect` throws and tries again. On
   * one transport shared across sessions it would wake into the socket the
   * next account had just opened and send the previous researcher's lock or
   * save through it — authorised and audited as the account that is signed in
   * now. Each session has a transport of its own for that reason: the parked
   * call has no way to reach the next one.
   */
  it('never carries a call the ended session parked onto the next account’s socket', async () => {
    const { currentHostSession } = await import('../Editor.tsx');
    const { closeStudioEditorSessions } =
      await import('../../editor/sessionLifecycle.ts');

    FakeSocket.openImmediately = false;
    ask(currentHostSession(), PARKED_CALL);
    await socketNumber(1);

    await closeStudioEditorSessions();

    // The next account opens the editor inside the delay the parked call is
    // waiting out, which is exactly what it would wake up into.
    FakeSocket.openImmediately = true;
    ask(currentHostSession(), NEXT_ACCOUNTS_CALL);

    await new Promise((resolve) => setTimeout(resolve, PAST_RECONNECT_DELAY));
    const onTheWire = FakeSocket.opened
      .flatMap((socket) => socket.sent)
      .join(' ');
    expect(onTheWire).toContain(NEXT_ACCOUNTS_CALL);
    expect(onTheWire).not.toContain(PARKED_CALL);
  });
});

/** The two procedures these tests tell one session's calls apart by. */
const PARKED_CALL = 'aCallTheEndedSessionParked';
const NEXT_ACCOUNTS_CALL = 'aCallTheNextAccountMade';

/**
 * Long enough for the transport's next reconnection attempt to have happened.
 *
 * `@orpc/client` waits two seconds before every attempt after the first, so a
 * shorter wait would answer "nothing reconnected" before anything could have.
 */
const PAST_RECONNECT_DELAY = 2500;

/**
 * A call over one host session, which is what opens its socket.
 *
 * Nothing answers it — there is no host on the other end of a stubbed
 * socket — so the promise is abandoned rather than awaited, and its rejection
 * when the socket closes is swallowed here so it is not reported as an
 * unhandled one. The procedure name travels in the encoded message, so a
 * socket can be asked whose call it carried.
 */
function ask(
  session: Readonly<{ link: ClientLink<Record<never, never>> }>,
  procedure: string,
): void {
  void session.link
    .call([procedure], undefined, { context: {} })
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

  readonly sent: string[] = [];

  send(message: unknown): void {
    // The host is what would answer, and there is none; what was put on the
    // wire is still what a test about which socket a call travels on needs.
    this.sent.push(String(message));
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
    for (const listener of this.#listeners.get('close') ?? []) {
      listener({ code: 1000, reason: 'the socket dropped' });
    }
  }
}
