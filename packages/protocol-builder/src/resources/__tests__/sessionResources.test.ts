import { describe, expect, it, vi } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../../compound-edit/InMemoryCompoundHost.ts';
import {
  createStageIdentity,
  InvalidProtocolDraftError,
  ProtocolBuilderSessionStore,
  ResourcePromotionError,
  SessionReadOnlyError,
  type CompoundSectionEdit,
  type FinishRequest,
  type ProtocolBuilderPresence,
  type StageFormDraft,
} from '../../session.ts';
import { readMessage } from '../../testing/i18n.ts';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourceDescriptor,
  type ResourceResult,
} from '../gateway.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceGatewayOptions,
} from '../InMemoryResourceGateway.ts';
import type { StagedResourceCancelReport } from '../lifecycle.ts';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const SECRET_VALUE = 'pk.session-secret-must-never-appear';
// A roster with someone in it: a network with no records at all is one the
// gateway refuses, because a stage using it has nobody to present.
const ROSTER_BYTES = new TextEncoder().encode(
  JSON.stringify({ nodes: [{ attributes: { name: 'Ada' } }], edges: [] }),
);

const presence: ProtocolBuilderPresence = {
  sessionId: 'tab-primary',
  userId: 'user-primary',
  displayName: 'Primary editor',
  sectionId: stageSection,
  mode: 'editing',
};
const lease: InMemoryCompoundHostLease = {
  sectionId: stageSection,
  leaseOwner: 'owner-primary',
  leaseEpoch: 4n,
  holder: presence,
};

const informationFields: StageFormDraft = {
  label: 'Welcome',
  title: 'Welcome',
  items: [],
};

const rosterFields: StageFormDraft = {
  label: 'Roster',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'prompt-1', text: 'Pick someone you know' }],
  behaviours: {},
};

/**
 * A committed stage whose prompts are already there to be reordered, so an
 * index-based command lands on content the protocol holds rather than on
 * content a command in the same pending batch put there.
 */
const reorderableRosterFields: StageFormDraft = {
  ...rosterFields,
  prompts: [
    { id: 'prompt-1', text: 'Pick someone you know' },
    { id: 'prompt-2', text: 'Pick someone you have met once' },
  ],
};

/** Those prompts after `moveItem` has swapped them. */
const reorderedPrompts = [
  { id: 'prompt-2', text: 'Pick someone you have met once' },
  { id: 'prompt-1', text: 'Pick someone you know' },
];

type SessionFixtureOptions = Readonly<{
  stage?: 'Information' | 'NameGeneratorRoster';
  /**
   * The committed stage draft the session and the host both open with, for a
   * test whose edits have to land on content the protocol already holds.
   */
  fields?: StageFormDraft;
  gateway?: InMemoryResourceGatewayOptions;
  /**
   * Commits the stage WITHOUT the manifest commands the promotion handed it —
   * the mistake the atomic apply exists to prevent.
   */
  omitResourceManifest?: boolean;
  /** Resources the protocol already carries when the session opens. */
  committedAssets?: Readonly<Record<string, SectionDoc>>;
  /**
   * Holds every staging call at the host until it resolves, so a test can put
   * an upload or a secret in flight across a cancel.
   */
  stagingGate?: Promise<void>;
  /**
   * Holds every discard at the host until it resolves, so a test can act in
   * the window between a discard being asked for and the host carrying it out.
   */
  discardGate?: Promise<void>;
  /**
   * Runs inside the finish apply, where the promotion has moved the bytes and
   * nothing has committed the manifest yet.
   */
  duringApply?: (session: ProtocolBuilderSessionStore) => Promise<void>;
  /**
   * Runs inside the finish's readability check, before any promotion has
   * started — the window in which the plan is fixed, the bytes are still
   * staged, and nothing is being promoted. Run once, for the first inspection.
   */
  duringInspect?: (session: ProtocolBuilderSessionStore) => Promise<void>;
  /**
   * Loses the answer to the first promotion, once: the host promotes the
   * resources and applies the manifest for real, and the session is told the
   * promotion failed and may be retried. This is the uncertainty a stable
   * promotion id exists for — and the only state in which reusing one across
   * two different drafts is observable, because a host that really did promote
   * hands the first promotion back rather than running the second.
   */
  loseFirstPromotionAnswer?: boolean;
}>;

function createFixture(options: SessionFixtureOptions = {}) {
  const stageType = options.stage ?? 'Information';
  const fields =
    options.fields ??
    (stageType === 'Information' ? informationFields : rosterFields);
  const protocolSections: Record<string, SectionDoc> = {
    [settingsSection]: { name: 'Resource lifecycle', schemaVersion: 8 },
    [stageOrderSection]: { stages: ['stage-1'] },
    [stageSection]: { id: 'stage-1', type: stageType, ...fields },
    [assetsSection]: { ...options.committedAssets },
    ...(stageType === 'NameGeneratorRoster'
      ? {
          [personSection]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {},
          },
        }
      : {}),
  };
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [lease],
  });
  // Assigned once the session exists; only ever read from inside a finish.
  let sessionInstance: ProtocolBuilderSessionStore | undefined;
  const gateway = new InMemoryResourceGateway(options.gateway);
  const gate = options.stagingGate;
  let inspected = false;
  let promotionAnswerLost = false;
  // The port the session is given: the host itself, or the host behind the
  // hooks a test uses to act from inside a call that is still in flight.
  const sessionGatewayPort: ProtocolBuilderResourceGateway =
    gate === undefined &&
    options.discardGate === undefined &&
    options.duringInspect === undefined &&
    options.loseFirstPromotionAnswer !== true
      ? gateway
      : {
          secretStorage: gateway.secretStorage,
          list: (listOptions) => gateway.list(listOptions),
          download: (resourceId) => gateway.download(resourceId),
          resolvePreview: (resourceId) => gateway.resolvePreview(resourceId),
          discardStaged: async (resourceId) => {
            await options.discardGate;
            return gateway.discardStaged(resourceId);
          },
          discardAllStaged: () => gateway.discardAllStaged(),
          promote: async (request) => {
            const result = await gateway.promote(request);
            if (
              options.loseFirstPromotionAnswer !== true ||
              promotionAnswerLost
            ) {
              return result;
            }
            promotionAnswerLost = true;
            return resourceFailure(
              'promotion-failed',
              'the host did not answer',
            );
          },
          inspect: async (resourceId) => {
            if (
              options.duringInspect !== undefined &&
              sessionInstance !== undefined &&
              !inspected
            ) {
              inspected = true;
              await options.duringInspect(sessionInstance);
            }
            return gateway.inspect(resourceId);
          },
          stageUpload: async (request) => {
            await gate;
            return gateway.stageUpload(request);
          },
          stageSecret: async (request) => {
            await gate;
            return gateway.stageSecret(request);
          },
        };
  const onCommands = vi.fn();
  const onResourceCleanupFailed = vi.fn();
  let finishes = 0;
  const onFinish = vi.fn(
    async ({ pendingCommands, resourceManifest }: FinishRequest) => {
      if (options.duringApply !== undefined && sessionInstance !== undefined) {
        await options.duringApply(sessionInstance);
      }
      const sections = host.getSnapshot().protocolSections;
      const stageCommands = pendingCommands.flatMap((batch) => [
        ...batch.commands,
      ]);
      const edits: CompoundSectionEdit[] = [];
      if (stageCommands.length > 0) {
        edits.push({
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: contentHash(sections[stageSection] ?? {}),
          commands: stageCommands,
        });
      }
      if (
        resourceManifest !== undefined &&
        options.omitResourceManifest !== true
      ) {
        edits.push({
          kind: 'update',
          sectionId: assetsSection,
          expectedContentHash: contentHash(sections[assetsSection] ?? {}),
          commands: [...resourceManifest.commands],
        });
      }
      const result = host.submit({
        id: `finish-${++finishes}`,
        description: 'Finish the stage',
        edits,
        authority: {
          sectionId: stageSection,
          leaseOwner: 'owner-primary',
          leaseEpoch: 4n,
        },
      });
      if (result.status !== 'applied') {
        throw new Error(
          result.status === 'failed' ? result.message : 'the sections are held',
        );
      }
    },
  );

  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity(stageType, () => 'stage-1'),
    fields,
    protocolSections: host.getSnapshot().protocolSections,
    manifestRevision: host.getSnapshot().manifestRevision,
    access: { mode: 'editable', leaseOwner: 'owner-primary', leaseEpoch: 4n },
    resourceGateway: sessionGatewayPort,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({ ...sections, [stageSection]: stageDocument }),
    onCommands,
    onFinish,
    onResourceCleanupFailed,
  });
  sessionInstance = session;

  return {
    gateway,
    host,
    onCommands,
    onFinish,
    onResourceCleanupFailed,
    session,
    resources: sessionGateway(session),
  };
}

function sessionGateway(session: ProtocolBuilderSessionStore) {
  const gateway = session.getResourceGateway();
  if (gateway === undefined) {
    throw new Error('the session was opened without a resource gateway');
  }
  return gateway;
}

function expectOk<T>(result: ResourceResult<T>): T {
  if (result.status !== 'ok') {
    throw new Error(`expected an ok result, got ${result.failure.reason}`);
  }
  return result.data;
}

function expectFailure<T>(result: ResourceResult<T>) {
  if (result.status !== 'failed') throw new Error('expected a failed result');
  return result.failure;
}

async function stageRoster(
  session: ProtocolBuilderSessionStore,
  requestId: string,
  name = 'Community roster',
): Promise<ResourceDescriptor> {
  return expectOk(
    await sessionGateway(session).stageUpload({
      requestId,
      kind: 'network',
      name,
      source: `${requestId}.json`,
      contentType: 'application/json',
      bytes: ROSTER_BYTES,
    }),
  );
}

async function stageImage(
  session: ProtocolBuilderSessionStore,
  requestId: string,
): Promise<ResourceDescriptor> {
  return expectOk(
    await sessionGateway(session).stageUpload({
      requestId,
      kind: 'image',
      name: `Image ${requestId}`,
      source: `${requestId}.png`,
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3, 4]),
    }),
  );
}

function informationItems(...assetIds: readonly string[]) {
  return assetIds.map((assetId, index) => ({
    id: `item-${index}`,
    type: 'asset',
    content: assetId,
  }));
}

describe('a session that stages resources', () => {
  it('commits the stage and the resources it references in one revision', async () => {
    const { gateway, host, session } = createFixture({
      stage: 'NameGeneratorRoster',
    });
    const roster = await stageRoster(session, 'roster-request');

    // Referencing a staged resource is legal immediately: promotion writes its
    // manifest entry in the same revision as this very command.
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    await expect(session.validate()).resolves.toMatchObject({
      status: 'valid',
    });
    await session.finish();

    const sections = host.getSnapshot().protocolSections;
    expect(sections[stageSection]).toMatchObject({ dataSource: roster.id });
    expect(sections[assetsSection]).toEqual({
      [roster.id]: {
        type: 'network',
        id: roster.id,
        name: 'Community roster',
        source: 'roster-request.json',
      },
    });
    // One revision: the stage's own command and the manifest entry arrived in
    // the same atomic apply, not one after the other.
    expect(host.getSnapshot().manifestRevision.sequence).toBe(8n);
    expect(gateway.getCommittedManifest()).toMatchObject({
      [roster.id]: { type: 'network' },
    });
    expect(gateway.getStagingResidue()).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
  });

  it('does not call the resource it just committed missing while the host catches up', async () => {
    const { session } = createFixture({ stage: 'NameGeneratorRoster' });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    await session.finish();

    // The resource is committed, but the authoritative sections carrying it
    // have not come back yet. An editor left open must not start reporting the
    // resource it just saved as one the protocol does not have.
    expect(session.getSnapshot().validation.status).not.toBe('invalid');
    await expect(session.validate()).resolves.toMatchObject({
      status: 'valid',
    });
  });

  it('commits nothing when the host applies the stage without the manifest', async () => {
    const { gateway, host, session } = createFixture({
      stage: 'NameGeneratorRoster',
      omitResourceManifest: true,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    await expect(session.finish()).rejects.toThrow(
      /does not reference an asset in the manifest/,
    );

    // The promotion rolled back with the apply that refused it: no revision,
    // no committed bytes, and the staging is still there to try again.
    expect(host.getSnapshot().manifestRevision.sequence).toBe(7n);
    expect(gateway.getCommittedManifest()).toEqual({});
    expect(
      session.getSnapshot().stagedResources.map((entry) => entry.id),
    ).toEqual([roster.id]);
  });

  it('discards the staged resources the draft walked away from', async () => {
    const { gateway, host, session } = createFixture({
      stage: 'NameGeneratorRoster',
    });
    const abandoned = await stageRoster(session, 'first-try', 'First try');
    const kept = await stageRoster(session, 'second-try', 'Second try');

    session.dispatch([{ op: 'set', key: 'dataSource', value: abandoned.id }]);
    session.dispatch([{ op: 'set', key: 'dataSource', value: kept.id }]);
    await session.finish();

    expect(
      Object.keys(host.getSnapshot().protocolSections[assetsSection] ?? {}),
    ).toEqual([kept.id]);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([kept.id]);
    expect(gateway.getStagingResidue()).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
  });

  it('discards everything staged when the session is cancelled', async () => {
    const { gateway, host, session } = createFixture();
    await stageImage(session, 'first');
    await stageImage(session, 'second');
    expect(session.getSnapshot().stagedResources).toHaveLength(2);

    await expect(session.cancel()).resolves.toMatchObject({ status: 'ok' });

    expect(gateway.getStagingResidue()).toEqual([]);
    expect(gateway.getCommittedManifest()).toEqual({});
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(host.getSnapshot().manifestRevision.sequence).toBe(7n);
  });

  it('leaves the stage uncommitted when a promotion is rolled back, and finishes on the retry', async () => {
    const { gateway, host, onFinish, session } = createFixture();
    const first = await stageImage(session, 'first');
    const second = await stageImage(session, 'second');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(first.id, second.id) },
    ]);
    gateway.failNextPromotionPartially();

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    // The partial promotion undid its own moves before reporting, so the host
    // never saw a stage referencing resources the protocol does not have.
    expect(onFinish).not.toHaveBeenCalled();
    expect(host.getSnapshot().manifestRevision.sequence).toBe(7n);
    expect(gateway.getCommittedManifest()).toEqual({});
    expect(session.getSnapshot().stagedResources).toHaveLength(2);

    await session.finish();

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(host.getSnapshot().manifestRevision.sequence).toBe(8n);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([
      first.id,
      second.id,
    ]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('reports a rolled-back promotion as retryable, without host storage detail', async () => {
    const { gateway, session } = createFixture();
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);
    gateway.failNext('promote', {
      reason: 'unavailable',
      message: 'the resource host is temporarily unavailable',
    });

    const error = await session.finish().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ResourcePromotionError);
    expect((error as ResourcePromotionError).failure).toMatchObject({
      reason: 'unavailable',
      retryable: true,
    });
  });

  it('refuses staging and promotion once the session is read-only, and keeps the staged work', async () => {
    const { gateway, session } = createFixture();
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);

    session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });

    const upload = await sessionGateway(session).stageUpload({
      requestId: 'second',
      kind: 'image',
      name: 'Another image',
      source: 'second.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([9, 9, 9]),
    });
    const secret = await sessionGateway(session).stageSecret({
      requestId: 'token',
      name: 'Mapbox token',
      value: SECRET_VALUE,
    });

    expect(expectFailure(upload).reason).toBe('read-only');
    expect(expectFailure(secret).reason).toBe('read-only');
    await expect(session.finish()).rejects.toBeInstanceOf(SessionReadOnlyError);
    // Losing the lease does not throw the researcher's staged work away.
    expect(
      session.getSnapshot().stagedResources.map((entry) => entry.id),
    ).toEqual([image.id]);
    expect(gateway.getStagingResidue()).not.toEqual([]);
  });

  it('reports a reference to a resource that is neither committed nor staged, and clears it when the resource is staged', async () => {
    const { session } = createFixture({
      gateway: { createResourceId: () => 'late-roster' },
    });
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems('late-roster') },
    ]);

    const dangling = await session.validate();

    expect(dangling).toMatchObject({
      status: 'invalid',
      issues: [
        {
          path: ['stages', 0, 'items', 0, 'content'],
          message: expect.stringContaining('"late-roster"'),
          sectionId: stageSection,
        },
      ],
    });
    await expect(session.finish()).rejects.toThrow(
      /the protocol draft is not valid/,
    );

    const staged = await stageImage(session, 'late');

    expect(staged.id).toBe('late-roster');
    await expect(session.validate()).resolves.toMatchObject({
      status: 'valid',
      issues: [],
    });
  });

  it('refuses to finish a stage whose staged roster the host cannot read', async () => {
    const { gateway, host, onFinish, session } = createFixture({
      stage: 'NameGeneratorRoster',
    });
    // The host holds the bytes, so staging succeeded. Only reading them says
    // this file is not a roster at all.
    const roster = expectOk(
      await sessionGateway(session).stageUpload({
        requestId: 'unreadable-roster',
        kind: 'network',
        name: 'Community roster',
        source: 'community.json',
        contentType: 'application/json',
        bytes: new TextEncoder().encode('not a roster at all'),
      }),
    );
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    const refusal = await session.finish().then(
      () => undefined,
      (thrown: unknown) => thrown,
    );

    if (!(refusal instanceof InvalidProtocolDraftError)) {
      throw new Error('the finish was not refused');
    }
    // On the canonical path of the field that names it, and attributed to the
    // stage that owns it, exactly as a schema problem with the same value is.
    expect(refusal.issues).toMatchObject([
      { path: ['stages', 0, 'dataSource'], sectionId: stageSection },
    ]);
    // Read through the same decode the form's error region does: the issue
    // carries the descriptor and its values rather than the sentence.
    expect(readMessage(refusal.issues[0]?.message ?? '')).toContain(
      'the selected file is not a readable network',
    );
    // Nothing was committed, and the researcher's import is still there to be
    // replaced or discarded.
    expect(onFinish).not.toHaveBeenCalled();
    expect(host.getSnapshot().manifestRevision.sequence).toBe(7n);
    expect(gateway.getCommittedManifest()).toEqual({});
    expect(
      session.getSnapshot().stagedResources.map((entry) => entry.id),
    ).toEqual([roster.id]);
  });

  it('withholds a command naming a staged resource from a live-applying host', async () => {
    const { onCommands, session } = createFixture({
      committedAssets: {
        'committed-backdrop': {
          type: 'image',
          id: 'committed-backdrop',
          name: 'Committed backdrop',
          source: 'committed-backdrop.png',
        },
      },
    });
    const staged = await stageImage(session, 'first');

    // A committed resource is already in the protocol, so a host may apply a
    // command naming it the moment it is made.
    session.dispatch([
      {
        op: 'set',
        key: 'items',
        value: informationItems('committed-backdrop'),
      },
    ]);
    expect(onCommands).toHaveBeenCalledTimes(1);

    session.dispatch([
      {
        op: 'set',
        key: 'items',
        value: informationItems('committed-backdrop', staged.id),
      },
    ]);
    session.dispatch([{ op: 'set', key: 'title', value: 'Renamed' }]);

    // The staged id has no manifest entry until finish promotes it, so a host
    // applying it live would commit a stage pointing at nothing. The batch
    // after it waits too: acknowledging that one alone would drop the held
    // batch the host never received.
    expect(onCommands).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onCommands.mock.calls)).not.toContain(staged.id);
    // Held, not lost: the researcher's unsaved work is still pending.
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.id),
    ).toEqual([1, 2, 3]);
  });

  it('delivers the withheld commands with the manifest in the finish apply', async () => {
    const { host, onCommands, onFinish, session } = createFixture();
    const staged = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(staged.id) },
    ]);
    expect(onCommands).not.toHaveBeenCalled();

    await session.finish();

    const request = onFinish.mock.calls[0]?.[0];
    expect(
      request?.pendingCommands.flatMap((batch) => [...batch.commands]),
    ).toEqual([
      { op: 'set', key: 'items', value: informationItems(staged.id) },
    ]);
    expect(
      request?.resourceManifest?.commands.map((command) => command.key),
    ).toEqual([staged.id]);
    // One revision carried the held command and the manifest entry together.
    expect(host.getSnapshot().manifestRevision.sequence).toBe(8n);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: informationItems(staged.id),
    });

    // Nothing is being held back any more, so the next batch flows live again.
    session.dispatch([{ op: 'set', key: 'title', value: 'Renamed' }]);
    expect(onCommands).toHaveBeenCalledTimes(1);
  });

  it('goes on holding the batches the finish apply did not carry', async () => {
    const { onCommands, onFinish, session } = createFixture({
      duringApply: (current) => {
        // Made after the apply captured the batches it carries: the host is
        // committing batch 1 and will never be told about this one.
        current.dispatch([
          { op: 'set', key: 'title', value: 'Renamed mid-save' },
        ]);
        return Promise.resolve();
      },
    });
    const staged = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(staged.id) },
    ]);

    await session.finish();
    session.dispatch([{ op: 'set', key: 'label', value: 'Renamed again' }]);

    expect(
      onFinish.mock.calls[0]?.[0].pendingCommands.map((batch) => batch.id),
    ).toEqual([1]);
    // Releasing the hold here would send batch 3 to a host that never saw
    // batch 2, and acknowledging 3 would drop the user's edit for good.
    expect(onCommands).not.toHaveBeenCalled();
    // Batch 1 is the host's — the apply carried it — so it is retired rather
    // than left for the next finish to send a second time. The two the apply
    // did not carry stay pending, in order, and still held.
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.id),
    ).toEqual([2, 3]);
    // Retiring is not forgetting: the researcher's draft still reads exactly
    // as it did, batch 1 included.
    expect(session.getSnapshot().editedSection.fields).toMatchObject({
      items: informationItems(staged.id),
      title: 'Renamed mid-save',
      label: 'Renamed again',
    });
  });

  it('discards an upload that lands while the finish is deciding what to promote', async () => {
    let release = (): void => undefined;
    const stagingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let staging: Promise<ResourceResult<ResourceDescriptor>> | undefined;
    let landed: ResourceResult<ResourceDescriptor> | undefined;
    const { gateway, session } = createFixture({
      stagingGate,
      duringApply: async () => {
        release();
        landed = await staging;
      },
    });
    session.dispatch([{ op: 'set', key: 'title', value: 'Renamed' }]);
    staging = sessionGateway(session).stageUpload({
      requestId: 'in-flight',
      kind: 'image',
      name: 'Late backdrop',
      source: 'in-flight.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3, 4]),
    });

    await session.finish();

    // The finish decided from the resources it could see. Keeping this one
    // would leave the host holding staging that nothing will ever decide.
    if (landed === undefined) throw new Error('the upload never landed');
    expect(expectFailure(landed).reason).toBe('not-found');
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('reports the staged resources a finish could not discard, and keeps them', async () => {
    const { gateway, onResourceCleanupFailed, session } = createFixture();
    const referenced = await stageImage(session, 'first');
    const abandoned = await stageImage(session, 'second');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(referenced.id) },
    ]);
    gateway.failNext('discard', { reason: 'unavailable', retryable: true });

    await session.finish();

    // The stage is committed, so this is not a failed save — but the host is
    // still holding bytes the finish decided against, and saying nothing
    // would leave them there with no one to drop them.
    expect(onResourceCleanupFailed).toHaveBeenCalledWith([
      {
        resourceId: abandoned.id,
        failure: expect.objectContaining({
          reason: 'unavailable',
          retryable: true,
        }),
      },
    ]);
    expect(
      session.getSnapshot().stagedResources.map((descriptor) => descriptor.id),
    ).toEqual([abandoned.id]);
    expect(gateway.getStagingResidue()).toContain(`staged:${abandoned.id}`);
  });

  it('keeps a committed finish committed when the cleanup report throws', async () => {
    const { gateway, onCommands, onResourceCleanupFailed, session } =
      createFixture();
    const referenced = await stageImage(session, 'first');
    const abandoned = await stageImage(session, 'second');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(referenced.id) },
    ]);
    expect(onCommands).not.toHaveBeenCalled();
    gateway.failNext('discard', { reason: 'unavailable', retryable: true });
    onResourceCleanupFailed.mockImplementation(() => {
      throw new Error('the host could not record the cleanup failure');
    });

    await session.finish();

    // Everything this finish decided has already happened by the time the
    // report is made: the bytes are promoted, the manifest and the stage are
    // applied, and the batches that were waiting for them have been sent. A
    // host that cannot take the news is not a reason to tell the researcher
    // that a save which succeeded had failed, or to invite them to repeat it.
    expect(onResourceCleanupFailed).toHaveBeenCalledOnce();
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([
      referenced.id,
    ]);
    // The hold the promotion put on this session's batches is gone with it, so
    // a later edit reaches a live-applying host at once.
    session.dispatch([{ op: 'set', key: 'title', value: 'Renamed' }]);
    expect(onCommands).toHaveBeenCalledTimes(1);
    // Nothing is lost by the report going nowhere: the resource the host would
    // not drop is still listed, for the next cleanup to reach.
    expect(
      session.getSnapshot().stagedResources.map((descriptor) => descriptor.id),
    ).toEqual([abandoned.id]);
  });

  it('drops the withheld commands when the session is cancelled', async () => {
    const { onCommands, session } = createFixture();
    const staged = await stageImage(session, 'first');
    session.dispatch([{ op: 'set', key: 'title', value: 'Renamed' }]);
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(staged.id) },
    ]);

    expect(await session.cancel()).toMatchObject({ status: 'ok' });

    // The staging is gone, so the edit that referenced it goes with it — the
    // host never had either.
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.id),
    ).toEqual([1]);
    expect(session.getSnapshot().editedSection.fields.items).toEqual([]);
    expect(session.getSnapshot().editedSection.fields.title).toBe('Renamed');
    expect(onCommands).toHaveBeenCalledTimes(1);
  });

  it('reports a cancel the host threw on, and keeps the edits it did not drop', async () => {
    const { gateway, session } = createFixture();
    const staged = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(staged.id) },
    ]);
    vi.spyOn(gateway, 'discardAllStaged').mockImplementation(() => {
      throw new Error('the host adapter threw');
    });

    const result = await session.cancel();

    // A cancel answers with a result, so a host that throws is a failure the
    // caller can show — not an exception out of a call whose type says it
    // cannot happen.
    expect(result).toMatchObject({
      status: 'failed',
      failure: { reason: 'unavailable', retryable: true },
    });
    // Nothing was discarded, so the edit that names the staged resource is
    // still the researcher's draft: dropping it here would throw away work
    // over staging the host is still holding.
    expect(session.getSnapshot().editedSection.fields.items).not.toEqual([]);
  });

  it('discards an upload still in flight when the session is cancelled', async () => {
    let release = (): void => undefined;
    const stagingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { gateway, session } = createFixture({ stagingGate });
    const staging = sessionGateway(session).stageUpload({
      requestId: 'in-flight',
      kind: 'image',
      name: 'In flight',
      source: 'in-flight.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3, 4]),
    });

    const cancelling = session.cancel();
    release();
    expect(await cancelling).toMatchObject({ status: 'ok' });
    const landed = await staging;

    expect(expectFailure(landed).reason).toBe('not-found');
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('discards a secret still in flight when the session is cancelled', async () => {
    let release = (): void => undefined;
    const stagingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { gateway, session } = createFixture({ stagingGate });
    const staging = sessionGateway(session).stageSecret({
      requestId: 'in-flight',
      name: 'Mapbox token',
      value: SECRET_VALUE,
    });

    const cancelling = session.cancel();
    release();
    expect(await cancelling).toMatchObject({ status: 'ok' });
    const landed = await staging;

    expect(expectFailure(landed).reason).toBe('not-found');
    expect(session.getSnapshot().stagedResources).toEqual([]);
    // The key would otherwise stay with the host, for a session that is over.
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('waits for an upload in flight before it reports the session cancelled', async () => {
    let release = (): void => undefined;
    const stagingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { gateway, session } = createFixture({ stagingGate });
    // The host refuses to drop what the cancel arrived too late to stop. That
    // refusal is what leaves the resource remembered in this session rather
    // than discarded — and this session is one nobody will cancel again.
    vi.spyOn(gateway, 'discardStaged').mockResolvedValueOnce(
      resourceFailure('unavailable', 'the host would not drop it', {
        retryable: true,
      }),
    );
    const staging = sessionGateway(session).stageUpload({
      requestId: 'in-flight',
      kind: 'image',
      name: 'In flight',
      source: 'in-flight.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3, 4]),
    });

    const cancelling = session.cancel();
    release();
    const landed = await staging;
    const report = expectOk(await cancelling);

    // The upload is decided by this cancel, so the cancel is not over until it
    // is: its own sweep is the last thing that can reach a resource the late
    // cleanup could not drop.
    expect(expectFailure(landed).reason).toBe('unavailable');
    expect(report.keptUnreconciled).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('waits for a secret in flight before it reports the session cancelled', async () => {
    let release = (): void => undefined;
    const stagingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { gateway, session } = createFixture({ stagingGate });
    vi.spyOn(gateway, 'discardStaged').mockResolvedValueOnce(
      resourceFailure('unavailable', 'the host would not drop it', {
        retryable: true,
      }),
    );
    const staging = sessionGateway(session).stageSecret({
      requestId: 'in-flight',
      name: 'Mapbox token',
      value: SECRET_VALUE,
    });

    const cancelling = session.cancel();
    release();
    const landed = await staging;
    const report = expectOk(await cancelling);

    expect(expectFailure(landed).reason).toBe('unavailable');
    expect(report.keptUnreconciled).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
    // The key would otherwise stay with the host for a session that is over,
    // reported to nobody: the cancel that would have named it said it was done.
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('refuses a cancel that arrives while the finish is still deciding', async () => {
    const cancels: ResourceResult<StagedResourceCancelReport>[] = [];
    const { gateway, host, session } = createFixture({
      stage: 'NameGeneratorRoster',
      duringInspect: async (current) => {
        cancels.push(await current.cancel());
      },
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    await session.finish();

    // Nothing is being promoted at this point — the finish is still asking
    // whether it may promote at all. A cancel let through here would discard
    // the roster the finish goes on to commit, and would tell the researcher
    // their stage had been thrown away while it was being saved.
    expect(cancels).toEqual([
      {
        status: 'failed',
        failure: expect.objectContaining({
          reason: 'unavailable',
          retryable: true,
        }),
      },
    ]);
    expect(host.getSnapshot().protocolSections[assetsSection]).toMatchObject({
      [roster.id]: { type: 'network' },
    });
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('lets the session be cancelled after a finish the host definitively refused', async () => {
    const { gateway, session } = createFixture({
      stage: 'NameGeneratorRoster',
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    // Not retryable, so the host has said this promotion committed nothing and
    // never will: there is no doubt for the cancel to keep out of.
    gateway.failNext('promote', {
      reason: 'invalid-request',
      retryable: false,
    });

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    // The finish let the session go as it failed. A hold left standing would
    // refuse every cancel from here on, stranding the roster at the host with
    // nothing able to name it.
    const report = expectOk(await session.cancel());
    expect(report.keptUnreconciled).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('keeps a cancel away from resources whose promotion never said what it did', async () => {
    const { gateway, session } = createFixture({
      stage: 'NameGeneratorRoster',
      loseFirstPromotionAnswer: true,
    });
    const roster = await stageRoster(session, 'roster-request');
    const abandoned = await stageRoster(session, 'unused-request', 'Unused');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    const discardAllStaged = vi.spyOn(gateway, 'discardAllStaged');
    const discardStaged = vi.spyOn(gateway, 'discardStaged');

    // The host promoted the roster and applied its manifest entry for real;
    // only the answer was lost, so the session is told it may finish again.
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([roster.id]);

    const report = expectOk(await session.cancel());

    // `discardAllStaged` cannot spare anything, and this roster may already be
    // committed: dropping it here is asking the host to delete work the
    // protocol has taken, over a promotion nobody has yet decided.
    expect(discardAllStaged).not.toHaveBeenCalled();
    expect(discardStaged).not.toHaveBeenCalledWith(roster.id);
    expect(report.keptUnreconciled.map((kept) => kept.id)).toEqual([roster.id]);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([roster.id]);
    // Everything the promotion never touched is discarded as usual: only what
    // is genuinely in doubt is kept.
    expect(discardStaged).toHaveBeenCalledWith(abandoned.id);
    expect(session.getSnapshot().stagedResources.map((one) => one.id)).toEqual([
      roster.id,
    ]);
  });

  it('refuses to discard a single resource whose promotion never said what it did', async () => {
    const { session, resources } = createFixture({
      stage: 'NameGeneratorRoster',
      loseFirstPromotionAnswer: true,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    // The picker's own "discard this resource" is the same door onto the same
    // bytes, so it is fenced by the same rule.
    const failure = expectFailure(await resources.discardStaged(roster.id));
    // `unavailable`, not `not-found`: the host answering "I am not holding
    // that" is exactly what a resource it promoted looks like, and acting on
    // it would forget the one record of a resource the protocol may now have.
    expect(failure.reason).toBe('unavailable');
    expect(failure.retryable).toBe(true);
    expect(failure.resourceId).toBe(roster.id);
  });

  it('lets a repeated finish settle a promotion whose answer was lost', async () => {
    const { gateway, session } = createFixture({
      stage: 'NameGeneratorRoster',
      loseFirstPromotionAnswer: true,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    // The same finish under the same promotion id: an idempotent host hands
    // back the promotion it already made, and that is what settles the doubt.
    await session.finish();

    const report = expectOk(await session.cancel());
    expect(report.keptUnreconciled).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([roster.id]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('refuses a discard that arrives while the finish is committing the resource', async () => {
    const attempts: ResourceResult<unknown>[] = [];
    const { gateway, session } = createFixture({
      stage: 'NameGeneratorRoster',
      duringApply: async (current) => {
        const staged = current.getSnapshot().stagedResources[0];
        if (staged === undefined) throw new Error('nothing was staged');
        attempts.push(await sessionGateway(current).discardStaged(staged.id));
        attempts.push(await current.cancel());
      },
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);

    await session.finish();

    // The bytes are moving and their manifest entry is in this very apply:
    // dropping the resource now would commit a stage pointing at nothing.
    for (const attempt of attempts) {
      expect(attempt).toMatchObject({
        status: 'failed',
        failure: { reason: 'unavailable', retryable: true },
      });
    }
    expect(attempts).toHaveLength(2);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([roster.id]);
    // The promoted resource is still resolvable while the host catches up.
    await expect(session.validate()).resolves.toMatchObject({
      status: 'valid',
    });
  });

  it('promotes an uncertain finish once, and gives the next finish its own promotion', async () => {
    const { gateway, session } = createFixture();
    const first = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(first.id) },
    ]);
    const promote = vi.spyOn(gateway, 'promote');
    gateway.failNextPromotionPartially();

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    await session.finish();

    const promotionIds = promote.mock.calls.map(([request]) => request.id);
    // A retried finish is the same intent: a gateway that already promoted it
    // must be able to recognise it rather than promote a second copy.
    expect(promotionIds[0]).toBe(promotionIds[1]);

    const second = await stageImage(session, 'second');
    session.dispatch([
      {
        op: 'set',
        key: 'items',
        value: informationItems(first.id, second.id),
      },
    ]);
    await session.finish();

    // A finish that succeeded is spent: reusing its id would hand back the
    // finished promotion and commit nothing of this one.
    expect(promotionIds[2]).not.toBe(promotionIds[0]);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('keeps one promotion id across a retry of the same finish, and mints another for a changed one', async () => {
    const { gateway, session } = createFixture();
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);
    const promote = vi.spyOn(gateway, 'promote');

    gateway.failNextPromotionPartially();
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    gateway.failNextPromotionPartially();
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    // Nothing about what this finish would commit changed between the two
    // attempts, so they are one intent, and a host that already ran it must be
    // able to recognise it rather than promote a second copy.
    const ids = promote.mock.calls.map(([request]) => request.id);
    expect(ids[1]).toBe(ids[0]);

    // Now the draft changes, so the next attempt commits something the last
    // one did not, and it has to say so: a host answering under the old id
    // would hand back the promotion of the draft before this one. The old id
    // is asked once more before that happens — settling the doubt the failed
    // attempt left, which nothing else could ever do — and the commit itself
    // takes an id of its own.
    session.dispatch([{ op: 'set', key: 'title', value: 'Second thoughts' }]);
    await session.finish();

    const afterEdit = promote.mock.calls
      .map(([request]) => request.id)
      .slice(2);
    expect(afterEdit[0]).toBe(ids[0]);
    expect(afterEdit[1]).not.toBe(ids[0]);
  });

  it('mints a new promotion id when the finish swaps the resource it promotes', async () => {
    const { gateway, onResourceCleanupFailed, session } = createFixture();
    const first = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(first.id) },
    ]);
    const promote = vi.spyOn(gateway, 'promote');
    gateway.failNextPromotionPartially();

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    // The researcher replaces the image rather than retrying the one that
    // would not save.
    const second = await stageImage(session, 'second');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(second.id) },
    ]);
    await session.finish();

    const ids = promote.mock.calls.map(([request]) => request.id);
    // The rolled-back id is asked one last time, and the commit that follows
    // takes its own.
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([second.id]);
    // The image the draft walked away from was the one whose own promotion had
    // never been decided. Settling it decided it — the host reached an apply,
    // so it never held the promotion — and only then is the finish free to
    // clean the image up like any other resource the draft abandoned.
    expect(onResourceCleanupFailed).not.toHaveBeenCalled();
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('refuses a changed draft while the doubt it has to settle first cannot be answered', async () => {
    const { gateway, host, resources, session } = createFixture({
      loseFirstPromotionAnswer: true,
    });
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);
    const promote = vi.spyOn(gateway, 'promote');

    // The host promoted and applied this finish; only its answer was lost.
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([image.id]);

    // The researcher edits the draft before retrying, so this is no longer the
    // finish the host ran and it needs an id of its own — which it may not
    // take while the doubted id is still unanswered. This time the host cannot
    // answer it either.
    session.dispatch([{ op: 'set', key: 'title', value: 'Second thoughts' }]);
    gateway.failNext('promote', { reason: 'unavailable', retryable: true });
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    const ids = promote.mock.calls.map(([request]) => request.id);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    // The session may not report a finish whose draft the host never saw.
    expect(host.getSnapshot().protocolSections[stageSection]).not.toMatchObject(
      { title: 'Second thoughts' },
    );
    // And nothing was settled, so the image is still protected from a discard.
    expect(expectFailure(await resources.discardStaged(image.id)).reason).toBe(
      'unavailable',
    );
  });

  it('settles a promotion left in doubt before a changed draft takes an id of its own', async () => {
    const { gateway, host, session } = createFixture({
      loseFirstPromotionAnswer: true,
    });
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);
    const promote = vi.spyOn(gateway, 'promote');

    // The host promoted the image and applied its manifest entry for real;
    // only the answer was lost.
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([image.id]);

    // Editing something and saving again is an ordinary way to react to a
    // "could not save" notice, and it changes the content the next finish
    // commits — so that finish needs an id of its own.
    session.dispatch([{ op: 'set', key: 'title', value: 'Second thoughts' }]);
    await session.finish();

    // Asked one last time under the id that created the doubt, which is the
    // only id an answer could ever come under. Rotating past it instead leaves
    // the image in limbo for the rest of the session: no discard may touch it,
    // because the protocol may already have it, and no promotion may take it,
    // because a host holding it refuses a second id for the same bytes.
    const asked = promote.mock.calls.map(([request]) => request.id);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toBe(asked[0]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      title: 'Second thoughts',
    });
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([image.id]);
    expect(session.getSnapshot().stagedResources).toEqual([]);

    // Nothing is left in doubt, so the session can be left cleanly.
    const report = expectOk(await session.cancel());
    expect(report.keptUnreconciled).toEqual([]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('does not carry the batches of a finish that succeeded into the next one', async () => {
    const { host, onFinish, session } = createFixture({
      stage: 'NameGeneratorRoster',
      fields: reorderableRosterFields,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    session.dispatch([{ op: 'moveItem', key: 'prompts', from: 0, to: 1 }]);

    await session.finish();

    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
    });

    // One more edit and one more save — no failure anywhere, and no
    // acknowledgement either, which a host owes the session at no point.
    session.dispatch([{ op: 'set', key: 'label', value: 'Second thoughts' }]);
    await session.finish();

    // The first finish's batches are the host's already. Sending them again
    // replays the move onto prompts that have moved, putting them back in the
    // order the researcher changed — under a save that reports success.
    expect(
      onFinish.mock.calls.at(-1)?.[0].pendingCommands.map((batch) => batch.id),
    ).toEqual([3]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
      label: 'Second thoughts',
    });
  });

  it('retires what the first attempt carried when the host answers the retry out of its promotion cache', async () => {
    const { host, onFinish, session } = createFixture({
      stage: 'NameGeneratorRoster',
      fields: reorderableRosterFields,
      loseFirstPromotionAnswer: true,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    session.dispatch([{ op: 'moveItem', key: 'prompts', from: 0, to: 1 }]);

    // The host promoted and applied for real, and lost only its answer.
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
    });

    // "Try again", with nothing changed in between — the most ordinary
    // reaction there is, and the one the stable promotion id exists for. The
    // host hands back the promotion it already made without applying anything,
    // so this finish succeeds having carried nothing: proof that the first
    // apply committed, and therefore that its batches are the host's.
    await session.finish();
    session.dispatch([{ op: 'set', key: 'label', value: 'Second thoughts' }]);
    await session.finish();

    expect(
      onFinish.mock.calls.at(-1)?.[0].pendingCommands.map((batch) => batch.id),
    ).toEqual([3]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
      label: 'Second thoughts',
    });
  });

  it('keeps holding the batches a cached promotion answer proves nothing about', async () => {
    const { onCommands, session } = createFixture({
      stage: 'NameGeneratorRoster',
      fields: reorderableRosterFields,
      loseFirstPromotionAnswer: true,
    });
    const first = await stageRoster(session, 'first-roster');
    session.dispatch([{ op: 'set', key: 'dataSource', value: first.id }]);
    session.dispatch([{ op: 'moveItem', key: 'prompts', from: 0, to: 1 }]);

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );

    // A second import, looked at and then thought better of. The draft ends up
    // exactly where it was, so saving again is still the identical finish and
    // still asks under the same promotion id — but these two batches were made
    // after that promotion's apply and have been nowhere.
    const second = await stageRoster(session, 'second-roster');
    session.dispatch([{ op: 'set', key: 'dataSource', value: second.id }]);
    session.dispatch([{ op: 'set', key: 'dataSource', value: first.id }]);

    await session.finish();

    // The host answered out of its promotion cache, so this finish applied
    // nothing: what it proves the host holds is what the first attempt carried,
    // not what this one was about to hand over.
    expect(
      session.getSnapshot().pendingCommands.map((batch) => batch.id),
    ).toEqual([3, 4]);

    session.dispatch([{ op: 'set', key: 'label', value: 'Second thoughts' }]);

    // And because the host never saw batches 3 and 4, nothing after them may
    // overtake them to a live-applying host.
    expect(onCommands).not.toHaveBeenCalled();
  });

  it('retires the stage commands the promotion it settled already carried', async () => {
    const { host, onFinish, session } = createFixture({
      stage: 'NameGeneratorRoster',
      fields: reorderableRosterFields,
      loseFirstPromotionAnswer: true,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    // An index-based command, which is what makes a resend visible at all: a
    // `set` applied twice leaves the same document, and a move applied twice
    // puts the prompts back in the order the researcher changed.
    session.dispatch([{ op: 'moveItem', key: 'prompts', from: 0, to: 1 }]);

    // The host promoted the roster and applied the stage — both batches
    // included, in the same atomic revision — and lost only its answer.
    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
    });

    // Editing and saving again is the ordinary reaction to "could not save",
    // and it is what makes the next finish settle the doubt first.
    session.dispatch([{ op: 'set', key: 'label', value: 'Second thoughts' }]);
    await session.finish();

    // Settling proved the host holds that promotion, so the apply it was made
    // inside committed — and the batches that apply carried are not the next
    // finish's to send again. Sending them moves the prompt back, silently
    // undoing the researcher's own reordering.
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
      label: 'Second thoughts',
    });
    expect(
      onFinish.mock.calls.at(-1)?.[0].pendingCommands.map((batch) => batch.id),
    ).toEqual([3]);
    // And that finish's own batch is the host's too, so nothing is left for a
    // third one to send.
    expect(session.getSnapshot().pendingCommands).toEqual([]);
  });

  it('keeps the stage commands of a promotion the host never made', async () => {
    const { gateway, host, onFinish, session } = createFixture({
      stage: 'NameGeneratorRoster',
      fields: reorderableRosterFields,
    });
    const roster = await stageRoster(session, 'roster-request');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    session.dispatch([{ op: 'moveItem', key: 'prompts', from: 0, to: 1 }]);
    // The other reading of the same uncertainty: the host took nothing, so it
    // applied nothing either, and these batches have still never been anywhere.
    gateway.failNext('promote', { reason: 'unavailable', retryable: true });

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    session.dispatch([{ op: 'set', key: 'label', value: 'Second thoughts' }]);
    await session.finish();

    // Retiring them on this reading would lose the researcher's work outright:
    // nothing the doubted promotion carried ever reached the protocol.
    expect(
      onFinish.mock.calls.at(-1)?.[0].pendingCommands.map((batch) => batch.id),
    ).toEqual([1, 2, 3]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      prompts: reorderedPrompts,
      label: 'Second thoughts',
    });
  });

  it('asks the doubted id without committing under it, then promotes the changed draft under a new one', async () => {
    const { gateway, host, onFinish, session } = createFixture();
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);
    const promote = vi.spyOn(gateway, 'promote');
    // The other reading of the same uncertainty: the host never took the
    // promotion at all.
    gateway.failNext('promote', { reason: 'unavailable', retryable: true });

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    session.dispatch([{ op: 'set', key: 'title', value: 'Second thoughts' }]);
    await session.finish();

    const asked = promote.mock.calls.map(([request]) => request.id);
    expect(asked).toHaveLength(3);
    expect(asked[1]).toBe(asked[0]);
    expect(asked[2]).not.toBe(asked[0]);
    // The replay reached a manifest apply, which is the answer: a host holding
    // the promotion would have handed it back instead. That apply refuses, so
    // the draft the researcher has since written cannot reach the protocol
    // under an id naming the draft before it.
    expect(
      onFinish.mock.calls
        .map(([request]) => request.resourceManifest?.promotionId)
        .filter((id) => id !== undefined),
    ).toEqual([asked[2]]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      title: 'Second thoughts',
    });
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([image.id]);
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('keeps a resource left in doubt when the draft is edited and the session is then cancelled', async () => {
    const { gateway, session } = createFixture({
      loseFirstPromotionAnswer: true,
    });
    const image = await stageImage(session, 'first');
    session.dispatch([
      { op: 'set', key: 'items', value: informationItems(image.id) },
    ]);

    await expect(session.finish()).rejects.toBeInstanceOf(
      ResourcePromotionError,
    );
    session.dispatch([{ op: 'set', key: 'title', value: 'Second thoughts' }]);

    // Editing says nothing about what the host did, so the cancel still may
    // not discard bytes the protocol may already hold — and still has to say
    // which resource it left behind.
    const report = expectOk(await session.cancel());
    expect(report.keptUnreconciled.map((kept) => kept.id)).toEqual([image.id]);
    expect(session.getSnapshot().stagedResources.map((one) => one.id)).toEqual([
      image.id,
    ]);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([image.id]);
  });

  it('gives a fresh session its own promotion id', async () => {
    const first = createFixture();
    const firstPromote = vi.spyOn(first.gateway, 'promote');
    const firstImage = await stageImage(first.session, 'first');
    first.session.dispatch([
      { op: 'set', key: 'items', value: informationItems(firstImage.id) },
    ]);
    await first.session.finish();

    const second = createFixture();
    const secondPromote = vi.spyOn(second.gateway, 'promote');
    const secondImage = await stageImage(second.session, 'first');
    second.session.dispatch([
      { op: 'set', key: 'items', value: informationItems(secondImage.id) },
    ]);
    await second.session.finish();

    expect(secondPromote.mock.calls[0]?.[0].id).not.toBe(
      firstPromote.mock.calls[0]?.[0].id,
    );
  });

  it('never lets a staged secret value into the snapshot', async () => {
    const { session } = createFixture();
    const staged = expectOk(
      await sessionGateway(session).stageSecret({
        requestId: 'token',
        name: 'Mapbox token',
        value: SECRET_VALUE,
      }),
    );
    await session.validate();

    // The revision sequence is a bigint, which JSON cannot serialize on its
    // own; everything else is serialized exactly as a host would log it.
    const serialized = JSON.stringify(session.getSnapshot(), (_key, value) =>
      typeof value === 'bigint' ? String(value) : (value as unknown),
    );

    expect(serialized).not.toContain(SECRET_VALUE);
    // The handle is what stands in for the secret everywhere the editor can
    // see, including the manifest entry the draft is validated against.
    expect(serialized).toContain(staged.handle);
    expect(session.getSnapshot().stagedResources).toEqual([
      {
        id: staged.descriptor.id,
        kind: 'apikey',
        name: 'Mapbox token',
        status: 'staged',
      },
    ]);
  });
});

/**
 * A discard and a selection are decisions about the same staged resource made
 * in two different places — the field that is dropping it, and the field that
 * is about to name it — and the host takes time to carry the discard out. The
 * session is the only thing that sees both, so it is the only thing that can
 * put them in an order.
 */
describe('a discard racing a field that would name the same resource', () => {
  /** A discard the test releases, and the session it is held inside. */
  function heldDiscard() {
    let release = () => undefined as void;
    const discardGate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    return { ...createFixture({ discardGate }), release };
  }

  it('refuses a reference taken while that resource is being discarded', async () => {
    const { session, release } = heldDiscard();
    const roster = await stageRoster(session, 'request-roster');
    const other = await stageRoster(session, 'request-other', 'Second roster');
    const resources = sessionGateway(session);

    const discarding = resources.discardStaged(roster.id);
    const refused = expectFailure(resources.referenceStaged(roster.id));

    // Without this the second field takes it, the discard resolves, and that
    // field is left naming bytes the host has just deleted.
    expect(refused.reason).toBe('not-found');
    expect(refused.retryable).toBe(false);
    expect(refused.resourceId).toBe(roster.id);
    // Only the one that is leaving: a session that stopped taking references
    // altogether would refuse every other field on the stage too.
    expectOk(resources.referenceStaged(other.id));

    release();
    expectOk(await discarding);
    expect(
      session.getSnapshot().stagedResources.map((staged) => staged.id),
    ).toEqual([other.id]);
  });

  it('refuses every reference from the moment a discard is asked for, whoever named it first', async () => {
    const { session, release } = heldDiscard();
    const roster = await stageRoster(session, 'request-roster');
    const resources = sessionGateway(session);

    // The other order: a field names it, and only then is the discard asked
    // for. Whether that discard is allowed at all is the picker's question —
    // it is the form that knows how many fields name the resource — but the
    // instant it starts, nothing else may come to name it.
    expectOk(resources.referenceStaged(roster.id));
    const discarding = resources.discardStaged(roster.id);

    expectFailure(resources.referenceStaged(roster.id));

    release();
    expectOk(await discarding);
    expect(session.getSnapshot().stagedResources).toEqual([]);
  });

  it('takes references again for a resource the host would not discard', async () => {
    const { gateway, session, release } = heldDiscard();
    const roster = await stageRoster(session, 'request-roster');
    const resources = sessionGateway(session);
    gateway.failNext('discard', { reason: 'unavailable', retryable: true });

    const discarding = resources.discardStaged(roster.id);
    expectFailure(resources.referenceStaged(roster.id));
    release();
    expectFailure(await discarding);

    // Refused at the host, so the resource is still staged and still a
    // perfectly good thing for a field to choose. A mark left behind would
    // make it unchoosable for the rest of the session.
    expectOk(resources.referenceStaged(roster.id));
    expect(
      session.getSnapshot().stagedResources.map((staged) => staged.id),
    ).toEqual([roster.id]);
  });

  it('refuses a reference to a resource whose discard has already finished', async () => {
    const { session, release } = heldDiscard();
    const roster = await stageRoster(session, 'request-roster');
    const other = await stageRoster(session, 'request-other', 'Second roster');
    const resources = sessionGateway(session);

    const discarding = resources.discardStaged(roster.id);
    release();
    expectOk(await discarding);

    // A second field's browser read the list before the discard and nothing
    // refreshes it, so the descriptor is still on screen. By now the in-flight
    // mark has been lifted — it is lifted the moment the host answers — and
    // without this the selection is taken and the field is left naming bytes
    // that are gone.
    const refused = expectFailure(resources.referenceStaged(roster.id));
    expect(refused.reason).toBe('not-found');
    expect(refused.retryable).toBe(false);
    expect(refused.resourceId).toBe(roster.id);
    expect(readMessage(refused.message)).toMatch(/no longer available/);
    // Only the one that went: everything else the session staged is still a
    // perfectly good thing for a field to choose.
    expectOk(resources.referenceStaged(other.id));
  });

  it('refuses every reference a discard of everything took away', async () => {
    const { session } = createFixture();
    const roster = await stageRoster(session, 'request-roster');
    const resources = sessionGateway(session);

    expectOk(await resources.discardAllStaged());

    expect(expectFailure(resources.referenceStaged(roster.id)).reason).toBe(
      'not-found',
    );
  });

  it('goes on taking references for a resource a finish committed', async () => {
    const { session } = createFixture({
      stage: 'NameGeneratorRoster',
      committedAssets: {
        'committed-roster': {
          type: 'network',
          id: 'committed-roster',
          name: 'Last year',
          source: 'last-year.json',
        },
      },
    });
    const roster = await stageRoster(session, 'request-roster');
    session.dispatch([{ op: 'set', key: 'dataSource', value: roster.id }]);
    await session.finish();

    // Promoting takes a resource out of the staged set and, once the manifest
    // catches up, out of the session altogether — but the protocol has it, so
    // a field naming it is naming something that exists. Only a discard makes
    // an id unusable.
    const resources = sessionGateway(session);
    expectOk(resources.referenceStaged(roster.id));
    // And a resource the session never staged at all is none of its business.
    expectOk(resources.referenceStaged('committed-roster'));
  });

  it('refuses every reference once the session has been cancelled', async () => {
    const { session } = createFixture();
    const roster = await stageRoster(session, 'request-roster');
    const resources = sessionGateway(session);

    expectOk(await session.cancel());

    // Not one discard but all of them: the host has been told to drop
    // everything this session staged, so every id it staged is on its way out.
    expect(expectFailure(resources.referenceStaged(roster.id)).reason).toBe(
      'read-only',
    );
  });
});
