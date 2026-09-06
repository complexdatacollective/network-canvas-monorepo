import { describe, expect, it, vi } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryResourceGateway } from '../../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  stageDraftFromDocument,
  type CompoundEditSubmission,
  type PendingCommandBatch,
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
    /**
     * Hands every batch to the host as it is made, and applies it there —
     * which is what an `onCommands` means: the host model that shows
     * collaborators an edit while it is being made. The acknowledgement it
     * owes back is deferred, which is where a real transport puts it: by the
     * time it arrives, something else may have moved the authoritative
     * revision on.
     *
     * Left out, the session is opened with no `onCommands` at all — the host
     * that is handed nothing until finish. A host cannot be given a batch and
     * decline to apply it, because nothing this session could ask it
     * afterwards would say which of the two it had done.
     */
    applyLive?: boolean;
    /**
     * Opens the session on a stage that is being CREATED, the way a host opens
     * a new one: the interview holds no section for it and does not list it in
     * the stage order, and only the candidate the session validates puts it
     * where it is about to live. See `StageCreation`.
     */
    creating?: boolean;
  }> = {},
) {
  const creating = options.creating === true;
  const host = new InMemoryCompoundHost({
    protocolSections: creating
      ? {
          [settingsSection]: initialSections[settingsSection]!,
          [stageOrderSection]: { stages: [] },
          [assetsSection]: {},
        }
      : initialSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [primaryLease, ...(options.additionalLeases ?? [])],
  });
  const owedAcknowledgements: (() => void)[] = [];
  let liveApplies = 0;
  const onCommands = vi.fn((batch: PendingCommandBatch) => {
    const sections = host.getSnapshot().protocolSections;
    const result = host.submit({
      id: `live-${++liveApplies}`,
      description: 'Apply a batch as it is made',
      edits: [
        {
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: contentHash(sections[stageSection] ?? {}),
          commands: [...batch.commands],
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
    const applied = result.update;
    owedAcknowledgements.push(() => {
      const document = applied.protocolSections[stageSection];
      if (document === undefined) throw new Error('the host lost the stage');
      session.acknowledge({
        fields: stageDraftFromDocument(document).fields,
        throughBatchId: batch.id,
        manifestRevision: applied.manifestRevision,
      });
    });
  });
  let finishes = 0;
  const onCompoundEdit = vi.fn((submission: CompoundEditSubmission) =>
    host.submit(submission),
  );
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
    ...(creating ? { creation: { position: 0 } } : {}),
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSection]: stageDocument,
        ...(creating ? { [stageOrderSection]: { stages: ['stage-1'] } } : {}),
      }),
    ...(options.applyLive === true ? { onCommands } : {}),
    onCompoundEdit,
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
  return {
    host,
    onCommands,
    onCompoundEdit,
    session,
    /** Delivers every acknowledgement the live host still owes this session. */
    settleAcknowledgements: () => {
      for (const acknowledge of owedAcknowledgements.splice(0)) acknowledge();
    },
  };
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

/** A second codebook-only request, for two compounds back to back. */
const createVenueOnly = {
  id: 'create-venue',
  description: 'Create a venue',
  edits: [
    {
      kind: 'create' as const,
      sectionId: sectionId({ kind: 'codebookNode', typeId: 'venue' }),
      document: {
        name: 'Venue',
        color: 'node-color-seq-3',
        shape: { default: 'circle' },
        variables: {},
      },
    },
  ],
};

/**
 * A create-a-place request that also renames the stage, built against whatever
 * stage document the host is holding right now.
 *
 * The hash is what a caller has: `withStageSectionEdit` reads the authoritative
 * stage and hashes it, so the request says exactly which document the host will
 * apply the fold onto.
 */
const renameAndCreatePlace = (host: InMemoryCompoundHost) => ({
  id: 'rename-and-create-place',
  description: 'Rename the stage and create a place',
  edits: [
    {
      kind: 'update' as const,
      sectionId: stageSection,
      expectedContentHash: contentHash(
        host.getSnapshot().protocolSections[stageSection] ?? {},
      ),
      commands: [{ op: 'set' as const, key: 'label', value: 'Places' }],
    },
    request.edits[1]!,
  ],
});

/** One block of an Information stage's page, as the schema stores it. */
const block = (id: string) => ({ id, type: 'text', content: `Block ${id}` });

const insertBlock = (id: string, index: number) =>
  [
    { op: 'insertItem' as const, key: 'items', index, item: block(id) },
  ] as const;

const stageItems = (session: ProtocolBuilderSessionStore): unknown =>
  session.getSnapshot().editedSection.fields.items;

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

  /**
   * The same edit, made while the stage itself is still being created.
   *
   * The full protocol the host answers with cannot contain a stage the
   * interview does not have, so the answer omits it — and a session that read
   * that omission as a broken answer would refuse the result the host has
   * already applied, leaving the codebook ahead of the editor that wrote it.
   */
  it('publishes a codebook revision from a stage the interview does not contain yet', async () => {
    const { host, session } = createSession({ creating: true });
    session.dispatch(insertBlock('one', 0));

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(host.getSnapshot().protocolSections[placeSection]).toMatchObject({
      name: 'Place',
    });
    expect(session.getSnapshot().protocolSections).toEqual(
      host.getSnapshot().protocolSections,
    );
    expect(session.getSnapshot().manifestRevision).toEqual(
      host.getSnapshot().manifestRevision,
    );
    // Nothing the host said was about this stage, so the researcher's unsaved
    // batch is still theirs to send.
    expect(stageItems(session)).toEqual([block('one')]);
    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
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

/**
 * The one authoritative stage document a caller can read is the snapshot's own
 * copy of the stage section, and everything that has to name the host's stage
 * reads it: a compound edit hashes it to say which document its stage commands
 * apply to, and `protocolContext.orderedStages` is where a skip destination's
 * list and an auto-named stage's existing names come from. So it has to move
 * when the host's stage does.
 */
describe('the stage document a session hands out after an acknowledgement', () => {
  it('holds what the host holds', () => {
    const { host, session, settleAcknowledgements } = createSession({
      applyLive: true,
    });
    session.dispatch([{ op: 'set', key: 'label', value: 'Places' }]);
    settleAcknowledgements();

    expect(session.getSnapshot().protocolSections[stageSection]).toEqual(
      host.getSnapshot().protocolSections[stageSection],
    );
  });

  it('renames the stage the skip destinations and auto-naming read', () => {
    const { session, settleAcknowledgements } = createSession({
      applyLive: true,
    });
    session.dispatch([{ op: 'set', key: 'label', value: 'Places' }]);
    settleAcknowledgements();

    expect(
      session
        .getSnapshot()
        .protocolContext.orderedStages.map((stage) => stage.label),
    ).toEqual(['Places']);
  });

  /**
   * And a compound edit built from it is applied rather than refused: the hash
   * a caller can name is the hash the host is holding.
   */
  it('names a document the host will accept a stage edit against', async () => {
    const { host, session, settleAcknowledgements } = createSession({
      applyLive: true,
    });
    session.dispatch([{ op: 'set', key: 'label', value: 'Places' }]);
    settleAcknowledgements();

    // Exactly what `withStageSectionEdit` does: read the authoritative stage
    // out of the snapshot and hash it.
    const authoritative =
      session.getSnapshot().protocolSections[stageSection] ?? {};
    await expect(
      session.requestCompoundEdit({
        id: 'rename-and-create-place',
        description: 'Rename the stage and create a place',
        edits: [
          {
            kind: 'update',
            sectionId: stageSection,
            expectedContentHash: contentHash(authoritative),
            commands: [{ op: 'set', key: 'title', value: 'Places nearby' }],
          },
          request.edits[1]!,
        ],
      }),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      label: 'Places',
      title: 'Places nearby',
    });
  });
});

/**
 * Which of this session's batches the host already holds turns on what it has
 * been GIVEN — a host handed a batch applies it, and one handed nothing until
 * finish holds none — but a codebook-only request is answered with the stage
 * as it stood when the host got to it, which delivery alone cannot say: a
 * batch made while the request was in flight may or may not be in it. So the
 * answer is read rather than assumed. Replaying batches the host already
 * applied adds every inserted row a second time; leaving them pending sends
 * them again at finish.
 */
describe('a codebook-only compound against each kind of host', () => {
  it('acknowledges by content what a live-applying host already holds', async () => {
    const { host, session } = createSession({ applyLive: true });
    session.dispatch(insertBlock('one', 0));

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    // Once, not twice: the row the host applied live is the row on screen.
    expect(stageItems(session)).toEqual([block('one')]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
    });
    // And nothing is owed any more, so finish will not send it again.
    expect(session.getSnapshot().pendingCommands).toEqual([]);
  });

  /**
   * The acknowledgement the host owed arrives against the revision the compound
   * apply has already superseded, so it is dropped. Acknowledging the batch by
   * content above is what stops that dropping it forever.
   */
  it('does not strand the batch when the late acknowledgement is dropped', async () => {
    const { host, session, settleAcknowledgements } = createSession({
      applyLive: true,
    });
    session.dispatch(insertBlock('one', 0));
    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    settleAcknowledgements();

    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(stageItems(session)).toEqual([block('one')]);
    await session.finish();
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
    });
  });

  it('keeps the researcher’s undo history over what the host already holds', async () => {
    const { session } = createSession({ applyLive: true });
    const historyBefore = session.getSnapshot().history;
    session.dispatch(insertBlock('one', 0));

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(session.getSnapshot().history).toMatchObject({
      canUndo: true,
      generation: historyBefore.generation,
    });
    session.undo();
    expect(stageItems(session)).toEqual([]);
  });

  it('leaves the same batch pending for a host it has not been sent to', async () => {
    const { host, onCommands, session } = createSession();
    session.dispatch(insertBlock('one', 0));

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(onCommands).not.toHaveBeenCalled();
    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
    expect(stageItems(session)).toEqual([block('one')]);
    expect(host.getSnapshot().protocolSections[stageSection]).toEqual(
      initialStage,
    );

    // Still owed, so the finish carries it — exactly once.
    await session.finish();
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
    });
  });

  it('reconciles two compounds back to back against a live host', async () => {
    const { host, session } = createSession({ applyLive: true });
    session.dispatch(insertBlock('one', 0));
    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });
    session.dispatch(insertBlock('two', 1));

    await expect(
      session.requestCompoundEdit(createVenueOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(stageItems(session)).toEqual([block('one'), block('two')]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one'), block('two')],
    });
    expect(session.getSnapshot().history.canUndo).toBe(true);
  });

  it('reconciles two compounds back to back against a buffering host', async () => {
    const { host, session } = createSession();
    session.dispatch(insertBlock('one', 0));
    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });
    session.dispatch(insertBlock('two', 1));

    await expect(
      session.requestCompoundEdit(createVenueOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(session.getSnapshot().pendingCommands).toHaveLength(2);
    expect(stageItems(session)).toEqual([block('one'), block('two')]);
    expect(session.getSnapshot().history.canUndo).toBe(true);

    await session.finish();
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one'), block('two')],
    });
  });

  /**
   * The same reading, on the other path. A request that carries a stage edit
   * folds the researcher's unsaved batches in front of it — and a live-applying
   * host is already holding some of them, so folding all of them applies those
   * twice. Written with `insertItem`, which is where applying twice shows: a
   * `set` applied twice is the same stage, a row inserted twice is not.
   */
  it('folds only the batches a live-applying host is not already holding', async () => {
    const { host, session } = createSession({ applyLive: true });
    session.dispatch(insertBlock('one', 0));

    await expect(
      session.requestCompoundEdit(renameAndCreatePlace(host)),
    ).resolves.toMatchObject({ status: 'applied' });

    // Once, not twice — and the request's own decision is there beside it.
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
      label: 'Places',
    });
    expect(host.getSnapshot().protocolSections[placeSection]).toMatchObject({
      name: 'Place',
    });
    expect(stageItems(session)).toEqual([block('one')]);
    // Everything the request carried is the host's now, so finish sends none of
    // it again.
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    await session.finish();
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
    });
  });

  /**
   * The same fold, in the ordinary acknowledgement window.
   *
   * A live-applying host answers each batch, but not before it has taken it,
   * and the only authoritative stage a caller can hash is the one this session
   * has been told about — so during that window the request names the document
   * the host held BEFORE the researcher's batch. Reading that hash as evidence
   * of what the host is holding folded the batch it already had into a request
   * it then refused as stale, and the researcher's compound edit failed for a
   * reason nothing on screen could explain.
   */
  it('folds onto the stage a live host holds while an acknowledgement is outstanding', async () => {
    const { host, session, settleAcknowledgements } = createSession({
      applyLive: true,
    });
    session.dispatch(insertBlock('one', 0));

    // Exactly what `withStageSectionEdit` reads, and all it can read.
    const authoritative =
      session.getSnapshot().protocolSections[stageSection] ?? {};
    expect(authoritative).toEqual(initialStage);

    await expect(
      session.requestCompoundEdit({
        id: 'rename-and-create-place',
        description: 'Rename the stage and create a place',
        edits: [
          {
            kind: 'update',
            sectionId: stageSection,
            expectedContentHash: contentHash(authoritative),
            commands: [{ op: 'set', key: 'label', value: 'Places' }],
          },
          request.edits[1]!,
        ],
      }),
    ).resolves.toMatchObject({ status: 'applied' });

    // The row the host applied live is there once, not twice, and the
    // request's own decision is beside it.
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
      label: 'Places',
    });
    expect(stageItems(session)).toEqual([block('one')]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);

    // The acknowledgement the host still owed arrives against a revision this
    // apply has superseded and is dropped, which strands nothing.
    settleAcknowledgements();
    expect(stageItems(session)).toEqual([block('one')]);
    await session.finish();
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
      label: 'Places',
    });
  });

  it('folds every batch for a host that is holding none of them', async () => {
    const { host, session } = createSession();
    session.dispatch(insertBlock('one', 0));

    await expect(
      session.requestCompoundEdit(renameAndCreatePlace(host)),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      items: [block('one')],
      label: 'Places',
    });
    expect(stageItems(session)).toEqual([block('one')]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
  });

  /**
   * The fold's own stale base. The request was built against a stage this
   * session cannot account for, so the batches it is holding were written for a
   * document that is no longer what the host will apply them to.
   */
  it('refuses a fold onto a stage it cannot account for, and loses nothing local', async () => {
    const { host, onCompoundEdit, session } = createSession();
    session.dispatch(insertBlock('one', 0));
    const before = session.getSnapshot();

    await expect(
      session.requestCompoundEdit({
        ...renameAndCreatePlace(host),
        edits: [
          {
            kind: 'update' as const,
            sectionId: stageSection,
            expectedContentHash: contentHash({
              ...initialStage,
              label: 'Renamed elsewhere',
            }),
            commands: [{ op: 'set' as const, key: 'label', value: 'Places' }],
          },
          request.edits[1]!,
        ],
      }),
    ).resolves.toMatchObject({ status: 'failed', reason: 'stale-base' });

    // Refused here, before the host was asked: a fold this session cannot
    // account for is not something to find out about from the answer, because
    // by then the researcher's batches have already been sent.
    expect(onCompoundEdit).not.toHaveBeenCalled();
    expect(host.getSnapshot().protocolSections[placeSection]).toBeUndefined();
    expect(session.getSnapshot().pendingCommands).toEqual(
      before.pendingCommands,
    );
    expect(stageItems(session)).toEqual([block('one')]);
    expect(session.getSnapshot().history).toEqual(before.history);
  });

  /**
   * The stage came back as neither — not the base these batches were built
   * against, and not that base with any run of them applied. A collaborator
   * moved it while this request was in flight.
   *
   * A codebook-only request says nothing about the stage, so there is nothing
   * about the stage to check before it is sent: this session finds out only
   * from the answer, and by then the host has APPLIED the change and is
   * answering with its own stage beside it. Refusing there is a refusal of
   * something that already happened — the section exists on the host and the
   * session stays on the revision before it, with no way back: a retry under a
   * new id collides with the section that now exists, and one under the same
   * id replays the cached result into the same refusal.
   */
  it('adopts a stage it cannot account for, because the host has already applied the change', async () => {
    const { host, session } = createSession();
    session.dispatch([{ op: 'set', key: 'title', value: 'Places nearby' }]);
    const before = session.getSnapshot();
    const sections = host.getSnapshot().protocolSections;
    expect(
      host.submit({
        id: 'collaborator-rename',
        description: 'Rename the stage from another session',
        edits: [
          {
            kind: 'update',
            sectionId: stageSection,
            expectedContentHash: contentHash(sections[stageSection] ?? {}),
            commands: [{ op: 'set', key: 'label', value: 'Renamed elsewhere' }],
          },
        ],
        authority: {
          sectionId: stageSection,
          leaseOwner: 'owner-primary',
          leaseEpoch: 4n,
        },
      }),
    ).toMatchObject({ status: 'applied' });

    await expect(
      session.requestCompoundEdit(createPlaceOnly),
    ).resolves.toMatchObject({ status: 'applied' });

    // Applied on the host, which is the whole reason a refusal was never an
    // honest answer, and now readable in this session too.
    expect(host.getSnapshot().protocolSections[placeSection]).toMatchObject({
      name: 'Place',
    });
    expect(
      session.getSnapshot().protocolContext.codebook.node?.place,
    ).toMatchObject({ name: 'Place' });
    expect(session.getSnapshot().manifestRevision).not.toEqual(
      before.manifestRevision,
    );

    // The collaborator's rename is the new base, and the researcher's unsaved
    // title is rebased onto it rather than dropped.
    expect(session.getSnapshot().editedSection.fields).toMatchObject({
      label: 'Renamed elsewhere',
      title: 'Places nearby',
    });
    expect(session.getSnapshot().pendingCommands).toEqual(
      before.pendingCommands,
    );
    // Fenced, exactly as `acknowledge` fences a foreign arrival: every undo
    // entry predates a change this session did not make.
    expect(session.getSnapshot().history.generation).toBe(
      before.history.generation + 1,
    );
  });
});
