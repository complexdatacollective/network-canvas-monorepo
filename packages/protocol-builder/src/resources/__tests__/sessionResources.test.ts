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
  ProtocolBuilderSessionStore,
  ResourcePromotionError,
  SessionReadOnlyError,
  type CompoundSectionEdit,
  type FinishRequest,
  type ProtocolBuilderPresence,
  type StageFormDraft,
} from '../../session.ts';
import type { ResourceDescriptor, ResourceResult } from '../gateway.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceGatewayOptions,
} from '../InMemoryResourceGateway.ts';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const SECRET_VALUE = 'pk.session-secret-must-never-appear';
const ROSTER_BYTES = new TextEncoder().encode(
  JSON.stringify({ nodes: [], edges: [] }),
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

type SessionFixtureOptions = Readonly<{
  stage?: 'Information' | 'NameGeneratorRoster';
  gateway?: InMemoryResourceGatewayOptions;
  /**
   * Commits the stage WITHOUT the manifest commands the promotion handed it —
   * the mistake the atomic apply exists to prevent.
   */
  omitResourceManifest?: boolean;
}>;

function createFixture(options: SessionFixtureOptions = {}) {
  const stageType = options.stage ?? 'Information';
  const fields = stageType === 'Information' ? informationFields : rosterFields;
  const protocolSections: Record<string, SectionDoc> = {
    [settingsSection]: { name: 'Resource lifecycle', schemaVersion: 8 },
    [stageOrderSection]: { stages: ['stage-1'] },
    [stageSection]: { id: 'stage-1', type: stageType, ...fields },
    [assetsSection]: {},
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
  const gateway = new InMemoryResourceGateway(options.gateway);
  let finishes = 0;
  const onFinish = vi.fn(
    ({ pendingCommands, resourceManifest }: FinishRequest) => {
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
    resourceGateway: gateway,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({ ...sections, [stageSection]: stageDocument }),
    onFinish,
  });

  return {
    gateway,
    host,
    onFinish,
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
