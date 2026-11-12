// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Effect, Layer, Predicate, Redacted, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import { NotLockHolder } from '@codaco/protocol-builder-core/contract/errors';
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
import {
  BROWSER_LOG_PATHS,
  BROWSER_LOG_TEAM_ATTRIBUTE,
  BrowserLogsBody,
  browserLogRecords,
} from '@codaco/studio-contract/schema/browser-logs';
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
import { HostClient } from '../../runtime/hostClient.ts';
import { hostRuntime } from '../../runtime/hostSession.ts';
import {
  installFetchStub,
  requestBodyText,
  requestUrl,
} from '../../test/fetchStub.ts';
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

type Answer<Tag extends keyof StudioHandlers> = (
  payload: Parameters<StudioHandlers[Tag]>[0],
) => ReturnType<StudioHandlers[Tag]>;

const STAGE_A = '11111111-1111-4111-8111-111111111111';
const STAGE_B = '22222222-2222-4222-8222-222222222222';
const STAGE_C = '33333333-3333-4333-8333-333333333333';
const FINISH = '44444444-4444-4444-8444-444444444444';
const queryDraft = vi.hoisted(() => vi.fn<Answer<'protocols.draft'>>());
const addInformationStage = vi.fn<Answer<'protocols.addInformationStage'>>();
const moveStage = vi.fn<Answer<'protocols.moveStage'>>();

const PROTOCOL_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Text written in the only language the sample protocol declares. */
const enUS = (text: string) => ({ 'en-US': text });

const fetchStub = installFetchStub();

const decodeLogs = Schema.decodeUnknownSync(
  Schema.fromJsonString(BrowserLogsBody),
);

const lockLogsSent = () =>
  fetchStub.mock.calls
    .filter(
      ([input]) =>
        new URL(requestUrl(input), window.location.href).pathname ===
        BROWSER_LOG_PATHS.researcher,
    )
    .flatMap(([, init]) => browserLogRecords(decodeLogs(requestBodyText(init))))
    .filter((record) => record.body.stringValue === 'Editing lock refused')
    .map((record) =>
      record.attributes.find(
        (attribute) => attribute.key === BROWSER_LOG_TEAM_ATTRIBUTE,
      ),
    );

const lockAnswer = {
  requested: 0,
  gate: Promise.resolve(),
};

/** Whether the host now says every save is from somebody who no longer holds the lock. */
const lockTaken = { away: false };

const DRAFT_SECTIONS = {
  settings: {
    name: 'Shell proof',
    schemaVersion: 9,
    localization: { defaultLocale: 'en-US', locales: ['en-US'] },
  },
  stageOrder: { stages: [STAGE_A, STAGE_B] },
  [`stage:${STAGE_A}`]: {
    id: STAGE_A,
    type: 'Information',
    label: enUS('Welcome'),
    title: enUS('Welcome'),
    items: [],
  },
  [`stage:${STAGE_B}`]: {
    id: STAGE_B,
    type: 'Information',
    label: enUS('Follow-up'),
    title: enUS('Follow-up'),
    items: [],
  },
  assets: {},
};

const DRAFT = {
  protocol: {
    id: ProtocolId.make(PROTOCOL_UUID),
    draftId: DraftId.make('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    name: Redacted.make('Shell proof'),
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
  revision: { sequence: '2', hash: 'revision-2' },
  sections: Object.fromEntries(
    Object.entries(DRAFT_SECTIONS).map(([id, document]) => [
      id,
      Redacted.make(document),
    ]),
  ),
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
  ...DRAFT_SECTIONS,
  [`stage:${STAGE_A}`]: {
    ...DRAFT_SECTIONS[`stage:${STAGE_A}`],
    label: enUS('Welcome, from the host'),
  },
};

/**
 * The host's protocol as schema 9 requires it, ending at a finish stage — the
 * shape validation admits. The fixture above leaves it out, because what those
 * tests check is drawn the same either way.
 */
const ENDS_AT_FINISH: Readonly<Record<string, SectionDoc>> = {
  ...HOST_SECTIONS,
  stageOrder: { stages: [STAGE_A, STAGE_B, FINISH] },
  [`stage:${FINISH}`]: {
    id: FINISH,
    type: 'FinishSession',
    mode: 'confirmation',
    label: enUS('Finish'),
    content: enUS('# Thank you\n\nThe interview is complete.'),
    finishedContent: enUS(
      '# Interview Finished\n\nThank you for participating!',
    ),
    finishLabel: enUS('Finish'),
    finishConfirmation: enUS('Finish this interview?'),
    finishFailed: enUS('The interview could not be finished.'),
    outcome: 'completed',
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

const ME: Me = {
  userId: 'user-1',
  email: Redacted.make('researcher@example.org'),
  emailVerified: true,
  name: Redacted.make('Researcher'),
  locale: null,
  teams: [{ teamId: TeamId.make('team-a'), role: 'owner' }],
  canCreateTeam: false,
};

const telemetry = { on: false };

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
  telemetry: false,
  logLevel: 'Info',
};

/** The host these tests seed, kept so a second caller can be made from it. */
let host: ReturnType<typeof createInMemoryHost>;

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
          return {
            document: Redacted.make(written),
            revision: COMMAND_REVISION,
          };
        }
        return yield* handle.GetSection(input);
      }),
    AcquireLock: (input) => {
      lockAnswer.requested += 1;
      const written = commandWriteFor(input.sectionId);
      return Effect.andThen(
        Effect.promise(() => lockAnswer.gate),
        written === undefined
          ? handle.AcquireLock(input)
          : Effect.succeed({
              lock: 'held' as const,
              document: Redacted.make(written),
              revision: COMMAND_REVISION,
            }),
      );
    },
    Submit: (input) =>
      lockTaken.away
        ? Effect.fail(new NotLockHolder({ sectionId: input.sectionId }))
        : handle.Submit(input),
    ListSections: (input) =>
      Effect.map(handle.ListSections(input), ({ sectionIds }) => ({
        sectionIds: [
          ...sectionIds,
          ...[...commandWrote.keys()].filter((id) => !sectionIds.includes(id)),
        ],
      })),
  });
}

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

async function collaboratorAddsScreen(label: string): Promise<void> {
  await collaborator().rpcCall('Create', {
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    kind: 'stage',
    document: Redacted.make({
      type: 'Information',
      label: enUS(label),
      title: enUS(label),
      items: [],
    }),
  });
}

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
    document: Redacted.make({
      ...Redacted.value(held.document),
      label: enUS(label),
    }),
    revision: held.revision,
  });
  await client.rpcCall('ReleaseLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: target,
  });
}

/** The stage order, put back as it should be, by a collaborator's submit. */
async function collaboratorRepairsStageOrder(
  stages: readonly string[],
): Promise<void> {
  const client = collaborator();
  const held = await client.rpcCall('AcquireLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: STAGE_ORDER,
  });
  await client.rpcCall('Submit', {
    protocolId: DRAFT.protocol.id,
    requestId: nextRequestId(),
    sectionId: STAGE_ORDER,
    document: Redacted.make({ stages }),
    revision: held.revision,
  });
  await client.rpcCall('ReleaseLock', {
    protocolId: DRAFT.protocol.id,
    sectionId: STAGE_ORDER,
  });
}

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
  telemetry.on = false;
  lockAnswer.requested = 0;
  lockAnswer.gate = Promise.resolve();
  lockTaken.away = false;
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
  installRpcHarness({
    'me': () => Effect.succeed(ME),
    'status': () => Effect.succeed({ ...STATUS, telemetry: telemetry.on }),
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

/**
 * The same control, once the editor may actually write to it.
 *
 * The editor is drawn before the section lock is acquired, and every field is
 * disabled until it is — so a test that typed as soon as the control appeared
 * was racing the acquire, and the value it typed was refused.
 */
async function findStageNameField() {
  const field = await screen.findByRole('textbox', { name: 'Stage name' });
  await waitFor(() => expect(field).toBeEnabled());
  return field;
}

/**
 * A study URL is a canonical link (§2.2, §5.6): it names the study and nothing
 * else, so following one has to open that study whoever follows it and however
 * they got there. Everything here is a way of arriving that does NOT pass
 * through the owning team's screens first.
 */
await import('../Editor.tsx');

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
  it.each([
    [
      'its interface name',
      'NameGeneratorQuickAdd',
      'Name Generator (quick add)',
    ],
    ['an unknown screen', 'NoSuchInterface', 'Unknown screen'],
  ])(
    'names the kind of each screen in the outline by %s, never its type id',
    async (_, type, kind) => {
      await seedHost({
        ...ENDS_AT_FINISH,
        [`stage:${STAGE_B}`]: { ...DRAFT_SECTIONS[`stage:${STAGE_B}`], type },
      });
      renderEditor();

      expect(
        await screen.findByRole('button', { name: `Follow-up${kind}` }),
      ).toBeInTheDocument();
      expect(screen.queryByText(type)).toBeNull();
    },
  );

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
    // Names the researcher typed take their own direction, so in a
    // right-to-left interface a Latin name is cut at its end.
    expect(
      await screen.findByText('Follow-up', { selector: '[dir="auto"]' }),
    ).toBeInTheDocument();
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) expect(title).toHaveAttribute('dir', 'auto');

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
    // pointed at the form the package owns — the same form the name field
    // belongs to. Read off the `form` attribute rather than an ancestor,
    // because Studio draws the title in the editor's header slot, which is
    // outside the `<form>` element.
    const formId = stageNameField().getAttribute('form');
    expect(formId).not.toBeNull();
    expect(document.getElementById(formId ?? '')).toBeInstanceOf(
      HTMLFormElement,
    );
    expect(screen.getByRole('button', { name: 'Save screen' })).toHaveAttribute(
      'form',
      formId,
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
    // Unavailable but still focusable, and a press does nothing.
    expect(add).toBeEnabled();
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);

    const refresh = screen.getByRole('button', { name: 'Refresh outline' });
    refresh.focus();
    fireEvent.click(refresh);
    expect(refresh).toBeEnabled();
    expect(refresh).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(add).toHaveAttribute('aria-disabled', 'false'));
    // The alert, and the Refresh button in it, are gone; focus is not.
    expect(refresh).not.toBeInTheDocument();
    expect(add).toHaveFocus();
    // Counted only now, once the outline has been read back: the press while
    // Add was unavailable would have reached the server well before this.
    expect(addInformationStage).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on Add while the screen it asked for is being added', async () => {
    let finishAdd = () => {};
    addInformationStage.mockReturnValueOnce(
      Effect.promise(
        () =>
          new Promise<{ sequence: string; hash: string }>((resolve) => {
            finishAdd = () => resolve({ sequence: '3', hash: 'r3' });
          }),
      ),
    );
    renderEditor();
    await screen.findByRole('heading', { name: 'Protocol sections' });

    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();
    fireEvent.click(add);

    await waitFor(() => expect(add).toHaveAttribute('aria-disabled', 'true'));
    expect(add).toBeEnabled();
    expect(add).toHaveFocus();
    fireEvent.click(add);

    await act(async () => finishAdd());
    await waitFor(() => expect(add).toHaveAttribute('aria-disabled', 'false'));
    expect(addInformationStage).toHaveBeenCalledTimes(1);
  });

  /**
   * Studio's add and reorder write the draft through commands of its own,
   * which publish nothing on the protocol channel. Nothing else will ever tell
   * this tab what they did, so the outline they change is the one thing on
   * this screen that is READ back rather than subscribed to.
   */
  it('shows the order a reorder of this researcher’s left behind', async () => {
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

  it('shows the screen an add of this researcher’s left behind', async () => {
    addInformationStage.mockImplementation(({ stageId }) =>
      Effect.sync(() => {
        commandWrote.set(sectionId({ kind: 'stage', stageId }), {
          id: stageId,
          type: 'Information',
          title: enUS('Untitled screen'),
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
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }

    const refresh = screen.getByRole('button', { name: 'Refresh order' });
    refresh.focus();
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(moveUp).toHaveAttribute('aria-disabled', 'false'),
    );
    // The alert went with its Refresh button; focus heads the reread list.
    expect(refresh).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
  });

  it('offers no move that would put a screen after the finish stage', async () => {
    // The interview ends at its finish stage, and the server refuses a move
    // that leaves a screen after it, as Architect does.
    await seedHost(ENDS_AT_FINISH);
    renderEditor();
    const finishUp = await screen.findByRole('button', {
      name: 'Move Finish up',
    });

    expect(finishUp).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('button', { name: 'Move Finish down' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('button', { name: 'Move Follow-up down' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('button', { name: 'Move Follow-up up' }),
    ).toHaveAttribute('aria-disabled', 'false');
    expect(
      screen.getByRole('button', { name: 'Move Welcome, from the host down' }),
    ).toHaveAttribute('aria-disabled', 'false');
  });
});

/**
 * A screen's name is one translation per language of the protocol, so the
 * outline has to say which of them it is showing: the language the editor is
 * writing in, or the one a participant would be shown when that language has
 * no name for the screen.
 */
describe('a protocol written in two languages', () => {
  async function seedEnglishAndFrench() {
    await seedHost({
      ...DRAFT_SECTIONS,
      settings: {
        ...DRAFT_SECTIONS.settings,
        localization: { defaultLocale: 'en-US', locales: ['en-US', 'fr'] },
      },
      [`stage:${STAGE_A}`]: {
        ...DRAFT_SECTIONS[`stage:${STAGE_A}`],
        label: { 'en-US': 'Hello', 'fr': 'Bonjour' },
      },
      // Named in French alone, so English has nothing to show for it.
      [`stage:${STAGE_B}`]: {
        ...DRAFT_SECTIONS[`stage:${STAGE_B}`],
        label: { fr: 'Suite' },
      },
    });
  }

  it('names each screen in the default language, or in another when it has no name there', async () => {
    await seedEnglishAndFrench();
    renderEditor();

    expect(await findStageNameField()).toHaveValue('Hello');
    expect(outlineScreens()).toEqual(['HelloInformation', 'SuiteInformation']);
  });

  it('names each screen in the language the editor switches to', async () => {
    await seedEnglishAndFrench();
    renderEditor();
    await findStageNameField();

    // Every localized field draws a menu and they all move together, so any
    // one of them will do.
    const [languageMenu] = screen.getAllByRole('button', {
      name: /Editing language/,
    });
    if (languageMenu === undefined) throw new Error('The editor has no menu');
    fireEvent.click(languageMenu);
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: /^français/ }),
    );

    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'BonjourInformation',
        'SuiteInformation',
      ]),
    );
    expect(await findStageNameField()).toHaveValue('Bonjour');
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
        label: enUS('Closing'),
        title: enUS('Closing'),
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
      ...ENDS_AT_FINISH,
      stageOrder: { stages: [STAGE_A, STAGE_B, FINISH, 'no-such-stage'] },
    });
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });

    expect(
      await screen.findByText('The protocol document could not be assembled.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '1 validation problem' }),
    ).toBeInTheDocument();

    // And it is checked again against what the channel delivers, so the
    // researcher is not left reading a problem a collaborator has fixed.
    await act(async () => {
      await collaboratorRepairsStageOrder([STAGE_A, STAGE_B, FINISH]);
    });

    expect(
      await screen.findByRole('button', { name: 'Protocol valid' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No validation problems.')).toBeInTheDocument();
  });
});

describe('an editing lock refused after the researcher has moved on', () => {
  it('is logged under the team of the editor that asked for it', async () => {
    telemetry.on = true;
    fetchStub.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    await collaborator().rpcCall('AcquireLock', {
      protocolId: DRAFT.protocol.id,
      sectionId: sectionId({ kind: 'stage', stageId: STAGE_A }),
    });
    const { promise, resolve } = Promise.withResolvers<void>();
    lockAnswer.gate = promise;
    const { router } = renderEditor();
    await waitFor(() => expect(lockAnswer.requested).toBeGreaterThan(0));

    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: TEAM_B.id } }),
    );
    resolve();

    await waitFor(() => expect(lockLogsSent()).toHaveLength(1), {
      timeout: 5000,
    });
    expect(lockLogsSent()).toEqual([
      {
        key: BROWSER_LOG_TEAM_ATTRIBUTE,
        value: { stringValue: TEAM_A.id },
      },
    ]);
  });
});

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

  it.each([1000, 1001, 1005, 1006] as const)(
    'keeps editing across a %i close, and hears what changed during it',
    async (code) => {
      renderEditor();
      expect(await findStageNameField()).toHaveValue('Welcome, from the host');
      await waitFor(() => expect(watchesOn(1)).toHaveLength(1));

      FakeWebSocket.opened[0]?.drop(code);

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

  it('resumes the stream and asks again for the read a killed server had in flight', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Follow-upInformation' });
    await act(async () => {
      await collaboratorRenamesScreen(STAGE_B, 'Follow-up, renamed');
    });
    await screen.findByRole('button', {
      name: 'Follow-up, renamedInformation',
    });

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

    await waitFor(() => expect(watchesOn(2).length).toBeGreaterThan(0), {
      timeout: 10_000,
    });
    expect(watchesOn(2)[0]?.payload).toHaveProperty('since');
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

  it('never carries a call the ended session parked onto the next account’s socket', async () => {
    FakeWebSocket.openImmediately = false;
    askTheHost('AcquireLock');
    const parked = await socketNumber(1);

    await closeStudioEditorSessions();

    FakeWebSocket.openImmediately = true;
    FakeWebSocket.account = NEXT_ACCOUNT;
    askTheHost('ListSections');
    await socketNumber(2);
    parked.open();

    await new Promise((resolve) => setTimeout(resolve, PAST_RECONNECT_DELAY));
    expect(servedAs()).toEqual([
      { tag: 'ListSections', userId: NEXT_ACCOUNT.userId, socket: 2 },
    ]);
  });

  it('keeps one channel open while the screen around it re-renders', async () => {
    const { queryClient } = renderEditor();
    await findStageNameField();
    await waitFor(() => expect(watchesOn(1)).toHaveLength(1));
    const locksTaken = served.filter(({ tag }) => tag === 'AcquireLock').length;

    act(() => {
      queryClient.setQueriesData<typeof DRAFT>(
        { queryKey: ['rpc', 'protocols.draft'] },
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                protocol: {
                  ...current.protocol,
                  name: Redacted.make('Renamed'),
                },
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
 * Past `RpcClient`'s default reconnection delays: 500 ms, then 750 ms after that.
 */
const PAST_RECONNECT_DELAY = 1_500;

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

/**
 * What the screen-reader live regions on the page say right now, joined.
 *
 * Read from the DOM rather than from the code that writes them, so a message
 * that never reached a live region fails here however it was produced.
 */
function liveRegionText(): string {
  return [...document.querySelectorAll('[role="status"], [aria-live]')]
    .map((region) => region.textContent)
    .join(' ')
    .trim();
}

const THREE_SCREENS: Readonly<Record<string, SectionDoc>> = {
  ...HOST_SECTIONS,
  stageOrder: { stages: [STAGE_A, STAGE_B, STAGE_C] },
  [`stage:${STAGE_C}`]: {
    id: STAGE_C,
    type: 'Information',
    label: enUS('Third'),
    title: enUS('Third'),
    items: [],
  },
};

/**
 * Makes `protocols.moveStage` write the order it was asked for, but only once
 * the test lets it: the time between the request and the answer is where the
 * old outline disabled the focused button and dropped focus.
 */
function holdMoves() {
  let order = [STAGE_A, STAGE_B, STAGE_C];
  let gate = Promise.resolve();
  let open = () => {};
  moveStage.mockImplementation(({ stageId, toIndex }) =>
    Effect.promise(() => gate).pipe(
      Effect.map(() => {
        order = order.filter((id) => id !== stageId);
        order.splice(toIndex, 0, stageId);
        commandWrote.set(STAGE_ORDER, { stages: [...order] });
        return { sequence: '3', hash: 'r3' };
      }),
    ),
  );
  return {
    hold() {
      const { promise, resolve } = Promise.withResolvers<void>();
      gate = promise;
      open = resolve;
    },
    release() {
      open();
    },
  };
}

/**
 * After a move the server lost: refreshes the order, lets focus fall to the
 * page body, and has a collaborator move Welcome down a place, which is when a
 * control still waiting on the lost move would take focus.
 */
async function expectCollaboratorReorderLeavesFocusAlone(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh order' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Move Follow-up up' }),
    ).toHaveAttribute('aria-disabled', 'false'),
  );
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  await act(() => collaboratorRepairsStageOrder([STAGE_B, STAGE_A, STAGE_C]));
  await waitFor(() =>
    expect(outlineScreens()).toEqual([
      'Follow-upInformation',
      'Welcome, from the hostInformation',
      'ThirdInformation',
    ]),
  );
  await nextFrames();
  expect(document.activeElement).toBe(document.body);
}

/** Two animation frames: long enough for any refocus a reorder schedules to run. */
const nextFrames = async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

const nameButton = (name: string) =>
  screen.getByRole('button', { name: `${name}Information` });

describe('reordering screens in the outline', () => {
  // A browser blurs a focused element when its list item is repositioned in
  // the DOM; jsdom keeps focus where it was. Without standing in for that,
  // every "focus is still there afterwards" assertion below would hold with
  // no refocus at all.
  let blurMovedFocus: MutationObserver;
  beforeEach(async () => {
    blurMovedFocus = new MutationObserver((records) => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return;
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (removed.contains(focused)) focused.blur();
        }
      }
    });
    blurMovedFocus.observe(document.body, { childList: true, subtree: true });
    await seedHost(THREE_SCREENS);
  });
  afterEach(() => blurMovedFocus.disconnect());

  it('announces the new position, and keeps focus on the moved screen while the server answers and after the list reorders', async () => {
    const moves = holdMoves();
    moves.hold();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });
    const welcome = nameButton('Welcome, from the host');
    expect(welcome).toHaveAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
    welcome.focus();

    fireEvent.keyDown(welcome, { key: 'ArrowDown' });
    await waitFor(() => expect(moveStage).toHaveBeenCalledTimes(1));

    // The server has not answered: the list has not moved, nothing is said,
    // and the control the researcher is on is still the one they are on.
    expect(welcome).toHaveFocus();
    expect(liveRegionText()).not.toMatch(/Moved/);

    // A second press while the first is in flight is not a second move.
    fireEvent.keyDown(welcome, { key: 'ArrowDown' });
    expect(moveStage).toHaveBeenCalledTimes(1);

    await act(async () => moves.release());
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'Welcome, from the hostInformation',
        'ThirdInformation',
      ]),
    );
    expect(
      await screen.findByText(
        'Moved Welcome, from the host to position 2 of 3.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(welcome).toHaveFocus());
  });

  it('keeps focus on a screen that reaches either end of the list, and ignores a press that would leave it', async () => {
    holdMoves();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });
    const followUp = nameButton('Follow-up');
    followUp.focus();

    fireEvent.keyDown(followUp, { key: 'ArrowUp' });
    await waitFor(() =>
      expect(outlineScreens()[0]).toBe('Follow-upInformation'),
    );
    await waitFor(() => expect(followUp).toHaveFocus());

    // Already first: nothing is asked of the server, and focus does not move.
    fireEvent.keyDown(followUp, { key: 'ArrowUp' });
    expect(moveStage).toHaveBeenCalledTimes(1);
    expect(followUp).toHaveFocus();

    const third = nameButton('Third');
    third.focus();
    fireEvent.keyDown(third, { key: 'ArrowDown' });
    expect(moveStage).toHaveBeenCalledTimes(1);
    expect(third).toHaveFocus();

    // And a screen moved onto the last place keeps focus there too.
    const welcome = nameButton('Welcome, from the host');
    welcome.focus();
    fireEvent.keyDown(welcome, { key: 'ArrowDown' });
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'ThirdInformation',
        'Welcome, from the hostInformation',
      ]),
    );
    expect(
      await screen.findByText(
        'Moved Welcome, from the host to position 3 of 3.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(welcome).toHaveFocus());
  });

  it('leaves an unavailable move button focusable, so a press at the end of the list does not lose the researcher’s place', async () => {
    holdMoves();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });
    const moveDown = screen.getByRole('button', { name: 'Move Third down' });

    expect(moveDown).not.toBeDisabled();
    expect(moveDown).toHaveAttribute('aria-disabled', 'true');
    moveDown.focus();
    fireEvent.click(moveDown);

    expect(moveStage).not.toHaveBeenCalled();
    expect(moveDown).toHaveFocus();
  });

  it('keeps focus on the move button that was pressed, and says where the screen went', async () => {
    const moves = holdMoves();
    moves.hold();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });
    const moveDown = screen.getByRole('button', {
      name: 'Move Welcome, from the host down',
    });
    moveDown.focus();

    fireEvent.click(moveDown);
    await waitFor(() => expect(moveStage).toHaveBeenCalledTimes(1));
    // In flight: the button is unavailable but is still where focus is.
    expect(moveDown).toHaveAttribute('aria-disabled', 'true');
    expect(moveDown).toHaveFocus();

    await act(async () => moves.release());
    await waitFor(() =>
      expect(outlineScreens()[1]).toBe('Welcome, from the hostInformation'),
    );
    expect(
      await screen.findByText(
        'Moved Welcome, from the host to position 2 of 3.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(moveDown).toHaveFocus());
    expect(moveDown).toHaveAttribute('aria-disabled', 'false');
  });

  /**
   * A move the server did not keep leaves the screen where it was, so its
   * control has nothing to wait for. Still waiting, it would take focus the
   * next time anything shifted the screen, here a collaborator's reorder
   * landing while focus is on the page body (the one place a waiting control
   * takes it back from).
   */
  it('stops waiting to take focus back after a move the server did not keep, when using the buttons', async () => {
    moveStage.mockReturnValueOnce(Effect.die(new Error('response lost')));
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });

    const welcomeDown = screen.getByRole('button', {
      name: 'Move Welcome, from the host down',
    });
    welcomeDown.focus();
    fireEvent.click(welcomeDown);
    await expectCollaboratorReorderLeavesFocusAlone();
    expect(welcomeDown).not.toHaveFocus();
  });

  it('stops waiting to take focus back after a move the server did not keep, when using the arrow keys', async () => {
    moveStage.mockReturnValueOnce(Effect.die(new Error('response lost')));
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });

    const welcome = nameButton('Welcome, from the host');
    welcome.focus();
    fireEvent.keyDown(welcome, { key: 'ArrowDown' });
    await expectCollaboratorReorderLeavesFocusAlone();
    expect(welcome).not.toHaveFocus();
  });

  /**
   * The move lands while the researcher is somewhere else: they moved on
   * deliberately, and the control they left does not call them back.
   */
  it('leaves focus where the researcher put it while a move was landing, when using the buttons', async () => {
    const moves = holdMoves();
    moves.hold();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });

    const welcomeDown = screen.getByRole('button', {
      name: 'Move Welcome, from the host down',
    });
    welcomeDown.focus();
    fireEvent.click(welcomeDown);
    await waitFor(() => expect(moveStage).toHaveBeenCalledTimes(1));
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();

    await act(async () => moves.release());
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'Welcome, from the hostInformation',
        'ThirdInformation',
      ]),
    );
    await nextFrames();
    expect(add).toHaveFocus();
  });

  it('leaves focus where the researcher put it while a move was landing, when using the arrow keys', async () => {
    const moves = holdMoves();
    moves.hold();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });

    const welcome = nameButton('Welcome, from the host');
    welcome.focus();
    fireEvent.keyDown(welcome, { key: 'ArrowDown' });
    await waitFor(() => expect(moveStage).toHaveBeenCalledTimes(1));
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();

    await act(async () => moves.release());
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'Welcome, from the hostInformation',
        'ThirdInformation',
      ]),
    );
    await nextFrames();
    expect(add).toHaveFocus();
  });

  it('does not leave another screen waiting for focus when its key is pressed during a move', async () => {
    const moves = holdMoves();
    moves.hold();
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });

    const welcome = nameButton('Welcome, from the host');
    welcome.focus();
    fireEvent.keyDown(welcome, { key: 'ArrowDown' });
    await waitFor(() => expect(moveStage).toHaveBeenCalledTimes(1));
    // Third asks to move while Welcome's move is still with the server: no
    // move of Third is sent, so Third has nothing to wait for.
    const third = nameButton('Third');
    third.focus();
    fireEvent.keyDown(third, { key: 'ArrowUp' });
    await act(async () => moves.release());
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'Welcome, from the hostInformation',
        'ThirdInformation',
      ]),
    );
    expect(moveStage).toHaveBeenCalledTimes(1);

    // Welcome then moves down past Third, which shifts Third up a place. The
    // control that made THIS move is the one to get focus back; Third, still
    // waiting from its press, would take it first.
    await nextFrames();
    const welcomeDown = screen.getByRole('button', {
      name: 'Move Welcome, from the host down',
    });
    welcomeDown.focus();
    fireEvent.click(welcomeDown);
    await waitFor(() =>
      expect(outlineScreens()).toEqual([
        'Follow-upInformation',
        'ThirdInformation',
        'Welcome, from the hostInformation',
      ]),
    );
    await waitFor(() => expect(welcomeDown).toHaveFocus());
    await nextFrames();
    expect(welcomeDown).toHaveFocus();
  });

  it('does not announce a move the server did not keep', async () => {
    moveStage.mockReturnValueOnce(Effect.die(new Error('response lost')));
    renderEditor();
    await screen.findByRole('button', { name: 'ThirdInformation' });
    const followUp = nameButton('Follow-up');
    followUp.focus();

    fireEvent.keyDown(followUp, { key: 'ArrowUp' });

    expect(
      await screen.findByText(/could not confirm the new screen order/i),
    ).toBeInTheDocument();
    expect(liveRegionText()).not.toMatch(/Moved/);
    expect(followUp).toHaveFocus();
  });

  it('says why a key press that would leave a screen after the finish screen did nothing', async () => {
    await seedHost(ENDS_AT_FINISH);
    renderEditor();
    const followUp = await screen.findByRole('button', {
      name: 'Follow-upInformation',
    });
    followUp.focus();

    fireEvent.keyDown(followUp, { key: 'ArrowDown' });

    expect(
      await screen.findByText(
        'Follow-up cannot move there, because the interview has to end with its finish screen.',
      ),
    ).toBeInTheDocument();
    expect(moveStage).not.toHaveBeenCalled();
    expect(followUp).toHaveFocus();
  });
});

const BLANK_TITLE: Readonly<Record<string, SectionDoc>> = {
  ...ENDS_AT_FINISH,
  [`stage:${STAGE_B}`]: {
    ...DRAFT_SECTIONS[`stage:${STAGE_B}`],
    title: enUS(''),
  },
};

const inspector = async () =>
  within(await screen.findByRole('complementary', { name: 'Inspector' }));

/** The visible label of the control that has focus, as a screen reader reads it. */
function focusedLabel(): string {
  const ids = document.activeElement?.getAttribute('aria-labelledby') ?? '';
  return ids
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

describe('the validation problems', () => {
  it('are controls that open the screen they are about and focus the field', async () => {
    await seedHost(BLANK_TITLE);
    renderEditor();
    // The first screen is open; the problem is in the second.
    await findStageNameField();

    fireEvent.click(
      await (await inspector()).findByRole('button', { name: /Follow-up$/ }),
    );

    await waitFor(() => expect(focusedLabel()).toMatch(/^Page heading/));
    expect(
      screen.getByRole('button', { name: 'Follow-upInformation' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('focus the field of the screen they open after unsaved changes are discarded', async () => {
    await seedHost(BLANK_TITLE);
    renderEditor();
    // The open screen has a field of the same name as the one the problem is
    // about, and it is that screen which is dirty.
    const openField = await findStageNameField();
    fireEvent.change(openField, { target: { value: 'Unsaved welcome' } });

    fireEvent.click(
      await (await inspector()).findByRole('button', { name: /Follow-up$/ }),
    );
    const discard = await screen.findByRole('button', {
      name: 'Discard changes',
    });
    // Everything focus passes through on the way. A field of the screen being
    // closed would be focused and then taken off the page with its screen,
    // even if something put focus right again afterwards.
    const focused: Element[] = [];
    const record = (event: FocusEvent) => {
      if (event.target instanceof Element) focused.push(event.target);
    };
    document.addEventListener('focusin', record);
    try {
      fireEvent.click(discard);
      await waitFor(() => expect(focusedLabel()).toMatch(/^Page heading/));
    } finally {
      document.removeEventListener('focusin', record);
    }

    expect(focused.filter((element) => !element.isConnected)).toEqual([]);
    expect(openField).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Follow-upInformation' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('open a section after unsaved changes are discarded, and focus it', async () => {
    await seedHost({
      ...ENDS_AT_FINISH,
      settings: { ...DRAFT_SECTIONS.settings, name: '' },
    });
    renderEditor();
    const openField = await findStageNameField();
    fireEvent.change(openField, { target: { value: 'Unsaved welcome' } });

    fireEvent.click(
      await (await inspector()).findByRole('button', { name: /Settings$/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Protocol settings' }),
      ).toHaveFocus(),
    );
  });

  it('stop waiting for a field once the researcher opens something else', async () => {
    await seedHost(BLANK_TITLE);
    // Follow-up is somebody else's, so its fields stay disabled and the
    // problem's field is waited for.
    await collaborator().rpcCall('AcquireLock', {
      protocolId: DRAFT.protocol.id,
      sectionId: sectionId({ kind: 'stage', stageId: STAGE_B }),
    });
    renderEditor();
    await findStageNameField();

    fireEvent.click(
      await (await inspector()).findByRole('button', { name: /Follow-up$/ }),
    );
    expect(
      await screen.findByText(/is editing this stage, so you can read it/),
    ).toBeInTheDocument();

    // The researcher moves on, to a screen with a field of the same name that
    // can be edited, before the wait is over.
    const welcome = screen.getByRole('button', {
      name: 'Welcome, from the hostInformation',
    });
    welcome.focus();
    fireEvent.click(welcome);
    await waitFor(() =>
      expect(welcome).toHaveAttribute('aria-current', 'page'),
    );
    await waitFor(async () =>
      expect(await findStageNameField()).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(welcome).toHaveFocus();
  });

  it('focus the field at once when its screen is already open', async () => {
    await seedHost({
      ...ENDS_AT_FINISH,
      [`stage:${STAGE_A}`]: {
        ...HOST_SECTIONS[`stage:${STAGE_A}`],
        title: enUS(''),
      },
    });
    renderEditor();
    await findStageNameField();

    fireEvent.click(
      await (
        await inspector()
      ).findByRole('button', {
        name: /Welcome, from the host$/,
      }),
    );

    await waitFor(() => expect(focusedLabel()).toMatch(/^Page heading/));
  });

  it('open a section of the protocol that is not a screen', async () => {
    await seedHost({
      ...ENDS_AT_FINISH,
      settings: { ...DRAFT_SECTIONS.settings, name: '' },
    });
    renderEditor();
    await findStageNameField();

    fireEvent.click(
      await (await inspector()).findByRole('button', { name: /Settings$/ }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Protocol settings' }),
      ).toHaveFocus(),
    );
  });

  it('go to the screen entry when the problem is about the screen and no field', async () => {
    renderEditor();
    await findStageNameField();

    // No finish screen: the schema anchors this at the last screen, not at
    // any one of its fields.
    fireEvent.click(
      await (
        await inspector()
      ).findByRole('button', {
        name: /must end with a finish stage.*Follow-up$/,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Follow-upInformation' }),
      ).toHaveFocus(),
    );
  });

  // The validator describes a shape, in English whatever the reader's
  // language: "Invalid input: expected string, received undefined".
  it.each([
    ['has no heading at all', undefined],
    ['has a blank heading', ''],
  ])(
    'say in the editor’s own words that a value is missing when a screen %s',
    async (_, title) => {
      const { title: _title, ...untitled } = DRAFT_SECTIONS[`stage:${STAGE_B}`];
      await seedHost({
        ...ENDS_AT_FINISH,
        [`stage:${STAGE_B}`]:
          title === undefined ? untitled : { ...untitled, title: enUS(title) },
      });
      renderEditor();

      expect(
        await (
          await inspector()
        ).findByRole('button', {
          name: 'Something required is missing.Follow-up',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Invalid input|expected/)).toBeNull();
    },
  );

  it('keep what the protocol’s own rules say about it', async () => {
    renderEditor();

    // No finish screen: a rule written about this protocol, not a shape.
    expect(
      await (
        await inspector()
      ).findByRole('button', {
        name: /must end with a finish stage.*Follow-up$/,
      }),
    ).toBeInTheDocument();
  });

  it('go to the outline when the problem is about the interview as a whole', async () => {
    await seedHost({
      ...ENDS_AT_FINISH,
      stageOrder: { stages: [STAGE_A, STAGE_B, FINISH, 'no-such-stage'] },
    });
    renderEditor();

    fireEvent.click(
      await (
        await inspector()
      ).findByRole('button', {
        name: 'The protocol document could not be assembled.',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('navigation', { name: 'Protocol sections' }),
      ).toHaveFocus(),
    );
  });

  it('are counted aloud once the number has settled, and not for the number the editor opened with', async () => {
    await seedHost({
      ...ENDS_AT_FINISH,
      stageOrder: { stages: [STAGE_A, STAGE_B, FINISH, 'no-such-stage'] },
    });
    renderEditor();
    expect(
      await screen.findByRole('button', { name: '1 validation problem' }),
    ).toBeInTheDocument();
    // Opening on a protocol with a problem says nothing aloud: the button
    // beside the title already does, and the editor has only just opened.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(liveRegionText()).not.toMatch(/validation problem/);

    // A collaborator puts it right.
    await act(async () => {
      await collaboratorRepairsStageOrder([STAGE_A, STAGE_B, FINISH]);
    });
    await waitFor(
      () => expect(liveRegionText()).toMatch(/No validation problems\./),
      { timeout: 3000 },
    );

    // And then breaks it again.
    await act(async () => {
      await collaboratorRepairsStageOrder([
        STAGE_A,
        'gone',
        FINISH,
        'also-gone',
      ]);
    });
    await waitFor(
      () => expect(liveRegionText()).toMatch(/1 validation problem\./),
      { timeout: 3000 },
    );
  });
});

describe('the editing lock', () => {
  it('is announced when it is lost in the middle of an edit, by a region that was already on the page', async () => {
    // A first screen that is complete, so a save is refused for the lock and
    // not for what is missing from it.
    await seedHost({
      ...HOST_SECTIONS,
      [`stage:${STAGE_A}`]: {
        ...HOST_SECTIONS[`stage:${STAGE_A}`],
        items: [{ id: 'item-1', type: 'text', content: enUS('Hello') }],
      },
    });
    renderEditor();
    const nameField = await findStageNameField();
    // The regions exist, empty, before anything has happened: one that is
    // added together with its text is often not read out.
    const regions = [
      ...document.querySelectorAll('output[aria-live="polite"]'),
    ];
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.map((each) => each.textContent).join('')).toBe('');

    // The host takes the stage away: the researcher's next save is refused.
    lockTaken.away = true;
    fireEvent.change(nameField, { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save screen' }));

    await waitFor(
      () =>
        expect(liveRegionText()).toMatch(
          /You can no longer edit Welcome, from the host\. It is now read-only\./,
        ),
      { timeout: 3000 },
    );
    // The very element that was there before, with its text changed.
    expect(
      regions.some(
        (each) => each.isConnected && /no longer edit/.test(each.textContent),
      ),
    ).toBe(true);
    // And the screen really is read-only now.
    expect(
      await screen.findByText(/is editing this stage, so you can read it/),
    ).toBeInTheDocument();
  });

  it('is announced when a screen the researcher opens is held by somebody else', async () => {
    await collaborator().rpcCall('AcquireLock', {
      protocolId: DRAFT.protocol.id,
      sectionId: sectionId({ kind: 'stage', stageId: STAGE_A }),
    });
    renderEditor();

    await waitFor(
      () =>
        expect(liveRegionText()).toMatch(
          /Welcome, from the host is read-only, because somebody else is editing it\./,
        ),
      { timeout: 3000 },
    );
  });

  it('says nothing old about a screen reopened after somebody else let it go', async () => {
    const stageA = sectionId({ kind: 'stage', stageId: STAGE_A });
    await collaborator().rpcCall('AcquireLock', {
      protocolId: DRAFT.protocol.id,
      sectionId: stageA,
    });
    renderEditor();
    await waitFor(
      () => expect(liveRegionText()).toMatch(/somebody else is editing it/),
      { timeout: 3000 },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Protocol settings' });
    await collaborator().rpcCall('ReleaseLock', {
      protocolId: DRAFT.protocol.id,
      sectionId: stageA,
    });
    // The screen is slow to arrive this time: longer than an announcement
    // takes to settle. Nothing known about it yet is worth saying.
    unreadableSections.set(stageA, 'withheld');
    fireEvent.click(nameButton('Welcome, from the host'));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(liveRegionText()).not.toMatch(/read-only|edit/);

    act(() => answerWithheldSections());
    await findStageNameField();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(liveRegionText()).not.toMatch(/read-only|edit/);
  });

  it('says nothing about a screen that simply opens and can be edited', async () => {
    renderEditor();
    await findStageNameField();

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(liveRegionText()).not.toMatch(/read-only|edit/);
  });
});
