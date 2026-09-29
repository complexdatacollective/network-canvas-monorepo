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
import { Effect, Layer, Predicate } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import {
  HostSession,
  HostUnauthorized,
} from '@codaco/protocol-builder-core/contract/session';
import {
  createInMemoryHost,
  hostSessionFor,
  type HandlersLayer,
  type InMemoryHandlers,
} from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import type { Me } from '@codaco/studio-contract/schema/account';
import { Forbidden } from '@codaco/studio-contract/schema/errors';
import {
  DraftId,
  ProtocolId,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';
import { type StudyDetail } from '@codaco/studio-contract/schema/study';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { closeStudioEditorSessions } from '../../editor/sessionLifecycle.ts';
import { authClient } from '../../lib/auth.ts';
import { reportUnauthorizedResponse } from '../../lib/session.ts';
import { createAppRouter } from '../../router.tsx';
import { hostRuntime } from '../../runtime/hostSession.ts';
import { HostClient } from '../../runtime/runtime.ts';
import {
  FakeWebSocket,
  installInProcessHost,
  installSocketHost,
  type HostAccount,
  type ServedCall,
} from '../../test/hostHarness.ts';
import {
  installRpcHarness,
  type StudioHandlers,
} from '../../test/rpcHarness.ts';

/**
 * Each procedure's own handler, minus the options argument the harness passes
 * it: a fixture that has drifted from the contract fails `tsc` rather than
 * passing here.
 */
type Answer<Tag extends keyof StudioHandlers> = (
  payload: Parameters<StudioHandlers[Tag]>[0],
) => ReturnType<StudioHandlers[Tag]>;

const STAGE_A = '11111111-1111-4111-8111-111111111111';
const STAGE_B = '22222222-2222-4222-8222-222222222222';
const STAGE_C = '33333333-3333-4333-8333-333333333333';
const queryDraft = vi.hoisted(() => vi.fn<Answer<'protocols.draft'>>());
const addInformationStage = vi.fn<Answer<'protocols.addInformationStage'>>();
const moveStage = vi.fn<Answer<'protocols.moveStage'>>();

/**
 * The study and the protocol line it points at share this identifier here, the
 * way `TeamStudies` mints them: one UUID, two brands.
 */
const PROTOCOL_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const DRAFT = {
  protocol: {
    id: ProtocolId.make(PROTOCOL_UUID),
    draftId: DraftId.make('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
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

const STUDY_ID = StudyId.make(PROTOCOL_UUID);

/**
 * The study as `studies.get` answers it, for the team that owns it. The schema
 * module exports no type alias, so the shape is read off the schema itself.
 */
function studyDetail(owner: string): (typeof StudyDetail)['Type'] {
  return {
    teamId: TeamId.make(owner),
    study: {
      id: STUDY_ID,
      name: DRAFT.protocol.name,
      state: 'draft',
      participationMode: 'managed',
      protocolId: DRAFT.protocol.id,
      createdAt: DRAFT.protocol.createdAt,
      waveCount: 0,
      participantCount: 0,
    },
    protocolDraftId: DRAFT.protocol.draftId,
  };
}

/** The signed-in researcher; nothing here turns on any of it. */
const ME: Me = {
  userId: 'user-1',
  email: 'researcher@example.org',
  emailVerified: true,
  name: 'Researcher',
  // `me` carries the account's UI-language preference; null means
  // "follow the browser" (2026-09-04 localization design §5.2).
  locale: null,
  teams: [{ teamId: TeamId.make('team-a'), role: 'owner' }],
};

const STATUS: InstanceStatus = {
  name: 'Studio',
  version: 'test',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: [],
  },
  deployment: { mode: 'managed', billing: false },
  setup: { required: false },
};

/** The host these tests seed, kept so a second caller can be made from it. */
let host: ReturnType<typeof createInMemoryHost>;

/** Who this tab's editor is to the host. */
const EDITOR = { sessionId: 'session-1', userId: 'user-1', displayName: 'Ada' };

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

function commandWriteFor(id: string): SectionDoc | undefined {
  return commandWrote.get(sectionId(parseSectionId(id)));
}

/**
 * The seeded host's procedures, with the reads answered the way a host that
 * Studio's own commands have written to — and that has not answered for every
 * section it listed — answers them.
 */
function servedBy(handle: InMemoryHandlers): HandlersLayer {
  return ProtocolBuilderGroup.toLayer({
    ...handle,
    GetSection: (input) =>
      Effect.gen(function* () {
        const refusal = unreadableSections.get(
          sectionId(parseSectionId(input.sectionId)),
        );
        if (refusal === 'rejected') {
          return yield* Effect.die(new Error('the section is unreadable'));
        }
        if (refusal === 'withheld') {
          yield* Effect.promise(
            () => new Promise<void>((resolve) => withheldReads.push(resolve)),
          );
        }
        const written = commandWriteFor(input.sectionId);
        if (written !== undefined) {
          return { document: written, revision: COMMAND_REVISION };
        }
        return yield* handle.GetSection(input);
      }),
    AcquireLock: (input) => {
      const written = commandWriteFor(input.sectionId);
      return written === undefined
        ? handle.AcquireLock(input)
        : Effect.succeed({
            lock: 'held' as const,
            document: written,
            revision: COMMAND_REVISION,
          });
    },
    ListSections: (input) =>
      Effect.map(handle.ListSections(input), ({ sectionIds }) => ({
        sectionIds: [
          ...sectionIds,
          ...[...commandWrote.keys()].filter((id) => !sectionIds.includes(id)),
        ],
      })),
  });
}

/** Seeds the host the editor is served by, in process, as this tab's editor. */
async function seedHost(sections: Readonly<Record<string, SectionDoc>>) {
  host = createInMemoryHost({ protocolId: DRAFT.protocol.id, sections });
  await installInProcessHost(servedBy(host.handle), hostSessionFor(EDITOR));
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

/** A screen a collaborator adds, through the contract's own `Create`. */
async function collaboratorAddsScreen(label: string): Promise<void> {
  await collaborator().rpcCall('Create', {
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    kind: 'stage',
    document: { type: 'Information', label, title: label, items: [] },
  });
}

/** A screen a collaborator renames, through the contract's own `Submit`. */
async function collaboratorRenamesScreen(
  stageId: string,
  label: string,
): Promise<void> {
  const client = collaborator();
  const target = sectionId({ kind: 'stage', stageId });
  const held = await client.rpcCall('AcquireLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: target,
  });
  await client.rpcCall('Submit', {
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    sectionId: target,
    document: { ...held.document, label },
    revision: held.revision,
  });
  await client.rpcCall('ReleaseLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: target,
  });
}

/** The stage order, put back as it should be, by a collaborator's submit. */
async function collaboratorRepairsStageOrder(): Promise<void> {
  const client = collaborator();
  const held = await client.rpcCall('AcquireLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: STAGE_ORDER,
  });
  await client.rpcCall('Submit', {
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    sectionId: STAGE_ORDER,
    document: { stages: [STAGE_A, STAGE_B] },
    revision: held.revision,
  });
  await client.rpcCall('ReleaseLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: STAGE_ORDER,
  });
}

/** A screen a collaborator removes, through the contract's own `Delete`. */
async function collaboratorDeletesScreen(stageId: string): Promise<void> {
  await collaborator().rpcCall('Delete', {
    protocolId: DRAFT.protocol.id,
    sectionId: sectionId({ kind: 'stage', stageId }),
  });
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

beforeEach(async () => {
  tenancy.teams = [TEAM_A, TEAM_B];
  tenancy.activeTeam = TEAM_A;
  tenancy.owner = TEAM_A.id;
  writes = 0;
  commandWrote.clear();
  unreadableSections.clear();
  withheldReads.length = 0;
  await seedHost(HOST_SECTIONS);
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
  queryDraft.mockReturnValue(Effect.succeed(DRAFT));
  addInformationStage.mockReset();
  addInformationStage.mockReturnValue(
    Effect.succeed({ sequence: '3', hash: 'r3' }),
  );
  moveStage.mockReset();
  moveStage.mockReturnValue(Effect.succeed({ sequence: '3', hash: 'r3' }));
  // The in-process rpc client for Studio's own procedures. `tenancy.owner`
  // being null is the server refusing the study altogether, which is what the
  // URL of a study in somebody else's team looks like from here (§6.3).
  installRpcHarness({
    'me': () => Effect.succeed(ME),
    'status': () => Effect.succeed(STATUS),
    'studies.get': () =>
      tenancy.owner === null
        ? Effect.fail(new Forbidden({}))
        : Effect.succeed(studyDetail(tenancy.owner)),
    'studies.list': () =>
      tenancy.owner === null
        ? Effect.fail(new Forbidden({}))
        : Effect.succeed([studyDetail(tenancy.owner).study]),
    'protocols.draft': (payload) => queryDraft(payload),
    'protocols.addInformationStage': (payload) => addInformationStage(payload),
    'protocols.moveStage': (payload) => moveStage(payload),
  });
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
      expect(moveStage).toHaveBeenCalledWith(
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

  it('follows the expired-session flow when the host refuses the session', async () => {
    const { router } = renderEditor();
    await findStageNameField();

    // `/ws` rechecks the session on every call, so an ended session is first
    // heard of as the host's refusal, not as a 401 from `/rpc`.
    vi.mocked(authClient.getSession).mockResolvedValue({
      data: null,
      error: null,
    });
    await installInProcessHost(
      servedBy(host.handle),
      Layer.succeed(HostSession)(
        HostSession.of(() => Effect.fail(new HostUnauthorized({}))),
      ),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
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
    expect(addInformationStage).not.toHaveBeenCalled();
    expect(label).toHaveValue('Unsaved welcome');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() => expect(addInformationStage).toHaveBeenCalledTimes(1));
  });

  it('blocks another add attempt until an ambiguous failure is reconciled', async () => {
    addInformationStage.mockReturnValueOnce(
      Effect.die(new Error('response lost')),
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
    moveStage.mockImplementation(() =>
      Effect.sync(() => {
        commandWrote.set(STAGE_ORDER, { stages: [STAGE_B, STAGE_A] });
        return { sequence: '3', hash: 'r3' };
      }),
    );
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
    addInformationStage.mockImplementation(({ stageId }) =>
      Effect.sync(() => {
        commandWrote.set(sectionId({ kind: 'stage', stageId }), {
          id: stageId,
          type: 'Information',
          title: '',
          items: [],
        });
        commandWrote.set(STAGE_ORDER, { stages: [STAGE_A, STAGE_B, stageId] });
        return { sequence: '3', hash: 'r3' };
      }),
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
    moveStage.mockReturnValueOnce(Effect.die(new Error('response lost')));
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
  async function seedThreeScreens(
    missing: string,
    how: 'withheld' | 'rejected',
  ) {
    await seedHost({
      ...HOST_SECTIONS,
      stageOrder: { stages: [STAGE_A, STAGE_B, STAGE_C] },
      [`stage:${STAGE_C}`]: {
        id: STAGE_C,
        type: 'Information',
        label: 'Closing',
        title: 'Closing',
        items: [],
      },
    });
    unreadableSections.set(sectionId({ kind: 'stage', stageId: missing }), how);
  }

  it('draws no outline, and offers no move, until all of it is here', async () => {
    // The FIRST screen is the one still on its way, so a list drawn from what
    // has arrived would show Follow-up and Closing at positions 0 and 1 —
    // "move Closing up" would ask for index 0, the front of the interview,
    // when Closing's own place is 2 and one step up from it is 1.
    await seedThreeScreens(STAGE_A, 'withheld');
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
      expect(moveStage).toHaveBeenCalledWith(
        expect.objectContaining({ stageId: STAGE_C, toIndex: 1 }),
      ),
    );
  }, 20_000);

  it('says a section could not be read, rather than checking for ever', async () => {
    await seedThreeScreens(STAGE_B, 'rejected');
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
      expect(moveStage).toHaveBeenCalledWith(
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
    await seedHost({
      ...HOST_SECTIONS,
      stageOrder: { stages: [STAGE_A, STAGE_B, 'no-such-stage'] },
    });
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

/**
 * The editor over the socket it really opens: the shipped `HostClient.layer`,
 * through a WebSocket stand-in whose far end is an rpc server on `/ws`'s own
 * serialization. The server authenticates a socket once, at its handshake, as
 * whoever the browser's cookie says — which is the whole reason a socket must
 * never outlive the session that opened it.
 */
describe('the socket the editor opens', () => {
  const RESEARCHER: HostAccount = { userId: 'user-1', displayName: 'Ada' };
  const NEXT_ACCOUNT: HostAccount = { userId: 'user-9', displayName: 'Cy' };

  let served: ReadonlyArray<ServedCall>;

  beforeEach(async () => {
    FakeWebSocket.opened = [];
    FakeWebSocket.openImmediately = true;
    FakeWebSocket.account = RESEARCHER;
    ({ served } = await installSocketHost(servedBy(host.handle)));
  });

  /** What the server ran, and as whom. */
  const servedAs = () =>
    served.map(({ tag, userId, socket }) => ({ tag, userId, socket }));

  const watchesOn = (socket: number) =>
    served.filter(
      (call) => call.tag === 'WatchProtocol' && call.socket === socket,
    );

  const readsOf = (stageId: string) =>
    served.filter(
      (call) =>
        call.tag === 'GetSection' &&
        Predicate.hasProperty(call.payload, 'sectionId') &&
        call.payload.sectionId === sectionId({ kind: 'stage', stageId }),
    );

  it('opens a new one after a drop, rather than answering from the closed one', async () => {
    askTheHost('ListSections');
    const dropped = await socketNumber(1);
    await waitFor(() =>
      expect(servedAs()).toEqual([
        { tag: 'ListSections', userId: RESEARCHER.userId, socket: 1 },
      ]),
    );

    dropped.drop(1006);
    await socketNumber(2);

    await waitFor(async () => {
      await callTheHost('ListSections');
      expect(servedAs().at(-1)).toEqual({
        tag: 'ListSections',
        userId: RESEARCHER.userId,
        socket: 2,
      });
    });
  });

  /**
   * No close code is a signal. A deploy closes the socket with no status code
   * (1005) and a killed container or a dropped network with none at all
   * (1006); both are a blip the researcher must not notice, and neither is the
   * end of their session — only `closeStudioEditorSessions()` is.
   */
  it.each([1005, 1006] as const)(
    'keeps editing across a %i close, and hears what changed during it',
    async (code) => {
      renderEditor();
      expect(await findStageNameField()).toHaveValue('Welcome, from the host');
      await waitFor(() => expect(watchesOn(1)).toHaveLength(1));

      FakeWebSocket.opened[0]?.drop(code);

      // The channel resumes on the socket that replaced it, as the same
      // researcher: the session did not end.
      await waitFor(() => expect(watchesOn(2)).toHaveLength(1), {
        timeout: 10_000,
      });
      expect(watchesOn(2)[0]?.userId).toBe(RESEARCHER.userId);

      await act(async () => {
        await collaboratorRenamesScreen(STAGE_B, 'Follow-up, renamed');
      });
      expect(
        await screen.findByRole('button', {
          name: 'Follow-up, renamedInformation',
        }),
      ).toBeInTheDocument();
      expect(stageNameField()).toHaveValue('Welcome, from the host');
    },
    20_000,
  );

  /**
   * A server killed mid-call fails everything that was in flight on it. The
   * stream is resumed by the package's channel from the last cursor it saw,
   * and a section read — a query — is asked again by the query's own retry, on
   * the socket that replaced the dead one. Nothing is replayed by the
   * transport: the read the dead server was holding is not the one that
   * answers.
   */
  it('resumes the stream and asks again for the read a killed server had in flight', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });
    // An event with a cursor, so the resumed stream has a place to resume from.
    await act(async () => {
      await collaboratorRenamesScreen(STAGE_B, 'Follow-up, renamed');
    });
    await screen.findByRole('button', {
      name: 'Follow-up, renamedInformation',
    });

    // A reorder reads the protocol back, and the server sits on one screen of
    // that read — so the read is in flight, beside the open stream, when the
    // server dies.
    unreadableSections.set(
      sectionId({ kind: 'stage', stageId: STAGE_B }),
      'withheld',
    );
    const readsBefore = readsOf(STAGE_B).length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Move Follow-up, renamed up' }),
    );
    await waitFor(() =>
      expect(readsOf(STAGE_B).length).toBeGreaterThan(readsBefore),
    );

    FakeWebSocket.opened[0]?.drop(1006);

    // The stream resumes on the socket that replaced the dead one, from the
    // last cursor it was given …
    await waitFor(() => expect(watchesOn(2).length).toBeGreaterThan(0), {
      timeout: 10_000,
    });
    expect(watchesOn(2)[0]?.payload).toHaveProperty('since');
    // … and the read is asked again there, by the query's own retry.
    await waitFor(
      () =>
        expect(
          readsOf(STAGE_B).filter(({ socket }) => socket === 2),
        ).not.toEqual([]),
      { timeout: 10_000 },
    );

    await act(async () => {
      answerWithheldSections();
    });
    await act(async () => {
      await collaboratorAddsScreen('Consent');
    });
    expect(
      await screen.findByRole('button', { name: 'ConsentInformation' }),
    ).toBeInTheDocument();
    // The re-read answered, so the reorder is confirmed rather than left in
    // doubt.
    expect(
      screen.queryByText(/could not confirm the new screen order/i),
    ).toBeNull();
  }, 30_000);

  /**
   * And it is closed when the session ends.
   *
   * The server reads the principal once, at the upgrade, and authorises and
   * audits every message on the socket as them: a socket left open across
   * sign-out is one the next account to sign in on this tab would be editing
   * through, under the previous researcher's name.
   */
  it('is closed when the editor sessions end, so the next account opens its own', async () => {
    askTheHost('ListSections');
    const signedIn = await socketNumber(1);
    await waitFor(() => expect(served).toHaveLength(1));

    await closeStudioEditorSessions();
    expect(signedIn.readyState).toBe(FakeWebSocket.CLOSED);

    // The next account's first call opens a socket of its own, whose
    // handshake carries whatever cookie the browser holds by then.
    FakeWebSocket.account = NEXT_ACCOUNT;
    askTheHost('ListSections');
    await socketNumber(2);
    await waitFor(() =>
      expect(servedAs()).toEqual([
        { tag: 'ListSections', userId: RESEARCHER.userId, socket: 1 },
        { tag: 'ListSections', userId: NEXT_ACCOUNT.userId, socket: 2 },
      ]),
    );
  });

  /**
   * And the reconnection stops with it, not just the socket.
   *
   * A call in flight when the researcher signs out is waiting inside the
   * transport — on a socket that is still connecting, or on the delay before
   * the next attempt — and `shell/useSignOut.ts` ends the editor's sessions
   * while the cookie is still valid, so the socket such an attempt opened
   * would be upgraded as the researcher who just left.
   */
  it('opens nothing more once the sessions have ended, with the cookie still valid', async () => {
    FakeWebSocket.openImmediately = false;
    askTheHost('AcquireLock');
    const opening = await socketNumber(1);
    expect(opening.readyState).toBe(FakeWebSocket.CONNECTING);

    await closeStudioEditorSessions();

    await new Promise((resolve) => setTimeout(resolve, PAST_RECONNECT_DELAY));
    expect(opening.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.opened).toHaveLength(1);
    expect(served).toEqual([]);
  });

  /**
   * And a call the ended session was holding is never carried on the next
   * one. Each session is a runtime of its own, and ending it interrupts every
   * call that ran on it, so the parked call has nothing left to wake up in —
   * least of all the socket the next account has just opened.
   */
  it('never carries a call the ended session parked onto the next account’s socket', async () => {
    FakeWebSocket.openImmediately = false;
    askTheHost('AcquireLock');
    const parked = await socketNumber(1);

    await closeStudioEditorSessions();

    // The next account opens the editor inside the delay the parked call
    // would be waiting out, which is exactly what it would wake up into.
    FakeWebSocket.openImmediately = true;
    FakeWebSocket.account = NEXT_ACCOUNT;
    askTheHost('ListSections');
    await socketNumber(2);
    // And the ended session's handshake completing late changes nothing.
    parked.open();

    await new Promise((resolve) => setTimeout(resolve, PAST_RECONNECT_DELAY));
    expect(servedAs()).toEqual([
      { tag: 'ListSections', userId: NEXT_ACCOUNT.userId, socket: 2 },
    ]);
  });

  /**
   * One host for the life of the tab. `ProtocolBuilder` keys its channel and
   * every lock on the adapter's identity, so an adapter minted per render
   * would reopen the channel and take the locks again each time the route
   * re-rendered.
   */
  it('keeps one channel open while the screen around it re-renders', async () => {
    const { queryClient } = renderEditor();
    await findStageNameField();
    await waitFor(() => expect(watchesOn(1)).toHaveLength(1));
    const locksTaken = served.filter(({ tag }) => tag === 'AcquireLock').length;

    // A fresh reading of Studio's own draft re-renders the route that holds
    // the protocol builder.
    act(() => {
      queryClient.setQueriesData<typeof DRAFT>(
        { queryKey: ['rpc', 'protocols.draft'] },
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                protocol: { ...current.protocol, name: 'Renamed' },
              },
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(served.filter(({ tag }) => tag === 'WatchProtocol')).toHaveLength(1);
    expect(served.filter(({ tag }) => tag === 'AcquireLock')).toHaveLength(
      locksTaken,
    );
  });
});

/**
 * Long enough for the transport's next reconnection attempts to have happened.
 *
 * After a failure the socket protocol retries 500 ms later, then 750 ms after
 * that (`RpcClient`'s default retry policy), so a shorter wait would answer
 * "nothing reconnected" before anything could have.
 */
const PAST_RECONNECT_DELAY = 1_500;

/** A host call through the editor's own runtime, whatever the session in force. */
function callTheHost(tag: 'AcquireLock' | 'ListSections'): Promise<unknown> {
  const protocolId = DRAFT.protocol.id;
  if (tag === 'AcquireLock') {
    return hostRuntime.runPromise(
      Effect.flatMap(HostClient, (client) =>
        client('AcquireLock', {
          protocolId,
          sectionId: sectionId({ kind: 'stage', stageId: STAGE_A }),
        }),
      ),
    );
  }
  return hostRuntime.runPromise(
    Effect.flatMap(HostClient, (client) =>
      client('ListSections', { protocolId }),
    ),
  );
}

/**
 * A call that opens the session's socket. Its answer is not the subject, and
 * it is abandoned rather than awaited: a session ended under it rejects it,
 * which is swallowed here so it is not reported as unhandled.
 */
function askTheHost(tag: 'AcquireLock' | 'ListSections'): void {
  void callTheHost(tag).catch(() => undefined);
}

/** The nth socket the transport has opened, once it has opened it. */
async function socketNumber(count: number): Promise<FakeWebSocket> {
  await waitFor(() => expect(FakeWebSocket.opened).toHaveLength(count));
  const socket = FakeWebSocket.opened.at(-1);
  if (socket === undefined) throw new Error('no socket was opened');
  return socket;
}
