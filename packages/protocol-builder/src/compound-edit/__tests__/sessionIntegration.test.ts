import { describe, expect, it, vi } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryResourceGateway } from '../../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  type ProtocolBuilderPresence,
} from '../../session.ts';
import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../InMemoryCompoundHost.ts';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const placeSection = sectionId({ kind: 'codebookNode', typeId: 'place' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const initialStage = {
  id: 'stage-1',
  type: 'Information',
  label: 'Welcome',
  title: 'Welcome',
  items: [],
} satisfies SectionDoc;
const initialSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Compound integration', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: initialStage,
  [assetsSection]: {},
};
const primaryPresence: ProtocolBuilderPresence = {
  sessionId: 'tab-primary',
  userId: 'user-primary',
  displayName: 'Primary editor',
  sectionId: stageSection,
  mode: 'editing',
};
const primaryLease: InMemoryCompoundHostLease = {
  sectionId: stageSection,
  leaseOwner: 'owner-primary',
  leaseEpoch: 4n,
  holder: primaryPresence,
};

function createSession(
  options: Readonly<{
    additionalLeases?: readonly InMemoryCompoundHostLease[];
    /** Opens the session with a gateway, so a batch can be withheld. */
    resources?: boolean;
  }> = {},
) {
  const host = new InMemoryCompoundHost({
    protocolSections: initialSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [primaryLease, ...(options.additionalLeases ?? [])],
  });
  const onCommands = vi.fn();
  let finishes = 0;
  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: { label: 'Welcome', title: 'Welcome', items: [] },
    protocolSections: host.getSnapshot().protocolSections,
    manifestRevision: host.getSnapshot().manifestRevision,
    access: {
      mode: 'editable',
      leaseOwner: 'owner-primary',
      leaseEpoch: 4n,
    },
    ...(options.resources === true
      ? { resourceGateway: new InMemoryResourceGateway() }
      : {}),
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({ ...sections, [stageSection]: stageDocument }),
    onCommands,
    onCompoundEdit: (submission) => host.submit(submission),
    // The same host, applying the stage's own batches: a finish is what
    // eventually makes the researcher's unsaved work authoritative.
    onFinish: ({ pendingCommands }) => {
      const commands = pendingCommands.flatMap((batch) => [...batch.commands]);
      if (commands.length === 0) return;
      const sections = host.getSnapshot().protocolSections;
      const result = host.submit({
        id: `finish-${++finishes}`,
        description: 'Finish the stage',
        edits: [
          {
            kind: 'update',
            sectionId: stageSection,
            expectedContentHash: contentHash(sections[stageSection] ?? {}),
            commands,
          },
        ],
        authority: {
          sectionId: stageSection,
          leaseOwner: 'owner-primary',
          leaseEpoch: 4n,
        },
      });
      if (result.status !== 'applied') {
        throw new Error(
          result.status === 'failed' ? result.message : 'the stage is held',
        );
      }
    },
  });
  return { host, onCommands, session };
}

/** Stages an image in this session, and answers with its id. */
async function stageImage(
  session: ProtocolBuilderSessionStore,
): Promise<string> {
  const gateway = session.getResourceGateway();
  if (gateway === undefined) {
    throw new Error('the session was opened without a resource gateway');
  }
  const result = await gateway.stageUpload({
    requestId: 'backdrop',
    kind: 'image',
    name: 'Backdrop',
    source: 'backdrop.png',
    contentType: 'image/png',
    bytes: Uint8Array.from([1, 2, 3, 4]),
  });
  if (result.status !== 'ok') throw new Error('the staging was refused');
  return result.data.id;
}

const request = {
  id: 'create-place-and-rename-stage',
  description: 'Create a place and rename the stage',
  edits: [
    {
      kind: 'update' as const,
      sectionId: stageSection,
      expectedContentHash: contentHash(initialStage),
      commands: [{ op: 'set' as const, key: 'label', value: 'Places' }],
    },
    {
      kind: 'create' as const,
      sectionId: placeSection,
      document: {
        name: 'Place',
        color: 'node-color-seq-2',
        shape: { default: 'square' },
        variables: {},
      },
    },
  ],
};

/** The same create, with no stage edit of its own to collide with. */
const createPlaceOnly = {
  id: 'create-place',
  description: 'Create a place',
  edits: [request.edits[1]!],
};

describe('compound host and protocol-builder session integration', () => {
  it('publishes one authoritative stage-and-codebook revision without echo', async () => {
    const { host, onCommands, session } = createSession();

    await expect(session.requestCompoundEdit(request)).resolves.toMatchObject({
      status: 'applied',
      update: { manifestRevision: { sequence: 8n } },
    });

    expect(onCommands).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      editedSection: { fields: { label: 'Places' } },
      manifestRevision: { sequence: 8n },
    });
    expect(
      session.getSnapshot().protocolContext.codebook.node?.place,
    ).toMatchObject({ name: 'Place' });
    expect(session.getSnapshot().protocolSections).toEqual(
      host.getSnapshot().protocolSections,
    );
  });

  it('leaves both host and session unchanged when an auxiliary section is held', async () => {
    const holder: ProtocolBuilderPresence = {
      sessionId: 'tab-place',
      userId: 'user-place',
      displayName: 'Place editor',
      sectionId: placeSection,
      mode: 'editing',
    };
    const { host, session } = createSession({
      additionalLeases: [
        {
          sectionId: placeSection,
          leaseOwner: 'owner-place',
          leaseEpoch: 2n,
          holder,
        },
      ],
    });
    await session.validate();
    const hostBefore = host.getSnapshot();
    const sessionBefore = session.getSnapshot();

    await expect(session.requestCompoundEdit(request)).resolves.toEqual({
      status: 'blocked',
      blockedSections: [{ sectionId: placeSection, holder }],
    });

    expect(host.getSnapshot()).toEqual(hostBefore);
    expect(session.getSnapshot()).toBe(sessionBefore);
  });
});

/**
 * A researcher reaches for a related section in the MIDDLE of configuring a
 * stage — the reason they need a new node type is usually the work they have
 * just done, and half-done work is what makes a stage incomplete. So the
 * request has to survive an unsaved stage, and what the session sends depends
 * on whether the request says anything about that stage at all.
 */
describe('a compound edit made while the stage has unsaved changes', () => {
  it('sends a codebook-only request alone, leaving those changes pending', async () => {
    const { host, session } = createSession();
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    session.dispatch([{ op: 'set', key: 'label', value: 'Places' }]);
    const pendingBefore = session.getSnapshot().pendingCommands;
    const historyBefore = session.getSnapshot().history;

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    // The codebook change landed…
    expect(host.getSnapshot().protocolSections[placeSection]).toMatchObject({
      name: 'Place',
    });
    // …and the stage the host holds is untouched, because the request never
    // claimed to save it.
    expect(host.getSnapshot().protocolSections[stageSection]).toEqual(
      initialStage,
    );
    // Every batch is still owed, in the same order, exactly once: the
    // authoritative stage they were built against did not move, so there was
    // nothing to rebase them onto and nothing to acknowledge.
    expect(session.getSnapshot().pendingCommands).toEqual(pendingBefore);
    expect(session.getSnapshot().editedSection.fields).toEqual({
      label: 'Places',
      title: 'Places nearby',
      items: [],
    });
    expect(session.getSnapshot().history).toEqual(historyBefore);
  });

  /**
   * The history over those batches has to survive too. Fencing it would leave
   * the researcher unable to undo work the codebook change never touched.
   */
  it('leaves undo and redo stepping through them one batch at a time', async () => {
    const { session } = createSession();
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    session.dispatch([{ op: 'set', key: 'label', value: 'Places' }]);
    session.undo();

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    // The undone batch is still undone, and still redoable.
    expect(session.getSnapshot().editedSection.fields).toMatchObject({
      label: 'Welcome',
      title: 'Places nearby',
    });
    expect(session.getSnapshot().history).toMatchObject({
      canUndo: true,
      canRedo: true,
    });
    session.redo();
    expect(session.getSnapshot().editedSection.fields.label).toBe('Places');
    session.undo();
    session.undo();
    expect(session.getSnapshot().editedSection.fields).toEqual({
      label: 'Welcome',
      title: 'Welcome',
      items: [],
    });
  });

  /**
   * The bug this rule exists for. The host validates the complete protocol, so
   * a stage draft folded into the request is a stage draft the host judges —
   * and it refuses the codebook change in the schema's words, for a stage the
   * researcher never asked to save.
   */
  it('creates the type even while the stage draft is too incomplete to save', async () => {
    const { host, session } = createSession();
    session.dispatch([{ op: 'unset', key: 'items' }]);
    await expect(session.validate()).resolves.toMatchObject({
      status: 'invalid',
    });

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(host.getSnapshot().protocolSections[placeSection]).toMatchObject({
      name: 'Place',
    });
    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
  });

  /**
   * And the work that was pending through the create is still the researcher's
   * to save: the finish that follows carries it, exactly once.
   */
  it('lands both halves once the stage is finished', async () => {
    const { host, session } = createSession();
    session.dispatch([{ op: 'unset', key: 'items' }]);
    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    session.dispatch([{ op: 'set', key: 'items', value: [] }]);
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    await session.finish();

    const sections = host.getSnapshot().protocolSections;
    expect(sections[placeSection]).toMatchObject({ name: 'Place' });
    expect(sections[stageSection]).toMatchObject({
      title: 'Places nearby',
      items: [],
    });
  });

  /**
   * A request that edits this stage has already decided what the stage
   * document becomes, so the researcher's unsaved commands go in front of its
   * own: both land in one apply, and the request wins wherever they meet.
   */
  it('folds them into a request that carries its own stage edit', async () => {
    const { host, session } = createSession();
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    session.dispatch([
      { op: 'set', key: 'label', value: 'A label being typed' },
    ]);

    await expect(session.requestCompoundEdit(request)).resolves.toMatchObject({
      status: 'applied',
    });

    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      // The researcher's own unsaved change travelled with the request…
      title: 'Places nearby',
      // …and the request's decision about the key they both touched stands.
      label: 'Places',
    });
    expect(host.getSnapshot().protocolSections[placeSection]).toMatchObject({
      name: 'Place',
    });
    // Folded batches are the host's now: replaying them would apply them
    // twice, and leaving them pending would send them again at finish.
    expect(session.getSnapshot().pendingCommands).toEqual([]);
  });

  it('leaves the pending batch intact when the compound edit is blocked', async () => {
    const holder: ProtocolBuilderPresence = {
      sessionId: 'tab-place',
      userId: 'user-place',
      displayName: 'Place editor',
      sectionId: placeSection,
      mode: 'editing',
    };
    const { host, session } = createSession({
      additionalLeases: [
        {
          sectionId: placeSection,
          leaseOwner: 'owner-place',
          leaseEpoch: 2n,
          holder,
        },
      ],
    });
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    const pendingBefore = session.getSnapshot().pendingCommands;

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'blocked' });

    expect(session.getSnapshot().pendingCommands).toEqual(pendingBefore);
    expect(session.getSnapshot().editedSection.fields.title).toBe(
      'Places nearby',
    );
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      title: 'Welcome',
    });
  });

  it('leaves them intact when the host refuses the request outright', async () => {
    const { host, session } = createSession();
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    const pendingBefore = session.getSnapshot().pendingCommands;

    await expect(
      session.requestCompoundEdit({
        id: 'create-a-place-with-no-colour',
        description: 'Create a place',
        // A node definition the schema will not take: the host validates
        // before it changes anything.
        edits: [
          {
            kind: 'create',
            sectionId: placeSection,
            document: { name: 'Place' },
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'failed', reason: 'host-error' });

    expect(session.getSnapshot().pendingCommands).toEqual(pendingBefore);
    expect(session.getSnapshot().editedSection.fields.title).toBe(
      'Places nearby',
    );
    expect(host.getSnapshot().protocolSections[placeSection]).toBeUndefined();
  });

  /**
   * The one case that still refuses. A batch putting a resource this session
   * has staged into the draft cannot reach a host until `finish` promotes the
   * bytes, and a compound apply that acknowledged nothing would still leave
   * the researcher looking at a stage whose file does not exist yet.
   */
  it('refuses while a batch is waiting on a resource this session staged', async () => {
    const { host, session } = createSession({ resources: true });
    const assetId = await stageImage(session);
    session.dispatch([
      {
        op: 'set',
        key: 'items',
        value: [{ id: 'item-0', type: 'asset', content: assetId }],
      },
    ]);
    const pendingBefore = session.getSnapshot().pendingCommands;

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({
      status: 'failed',
      reason: 'pending-commands',
    });

    expect(session.getSnapshot().pendingCommands).toEqual(pendingBefore);
    expect(host.getSnapshot().protocolSections[placeSection]).toBeUndefined();
  });
});
