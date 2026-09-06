import { describe, expect, it, vi } from 'vitest';

import {
  applyCommands,
  contentHash,
  type Command,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  AuthoritativeConflictError,
  commandsFromDraftChange,
  createStageIdentity,
  InvalidProtocolDraftError,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
  stageDocument,
  StageIdentityCommandError,
  type CompoundEditResult,
  type CompoundEditRequest,
  type FinishRequest,
  type ProtocolBuilderSessionOptions,
} from '../session.ts';

const revision = (sequence: bigint) => ({
  sequence,
  hash: `revision-${sequence}`,
});

const conflictingRevision = (sequence: bigint) => ({
  sequence,
  hash: `conflicting-revision-${sequence}`,
});

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome',
  items: [],
};

/** A stage that keeps a list somewhere other than its top level. */
const nestedNodeConfig: SectionDoc = {
  type: 'family_member',
  form: [{ id: 'row-a', prompt: 'Their name?' }],
};

const nestedFields: SectionDoc = {
  label: 'Pedigree',
  nodeConfig: nestedNodeConfig,
};

const lastBatchCommands = (session: ProtocolBuilderSessionStore) =>
  session.getSnapshot().pendingCommands.at(-1)?.commands;

function candidate(stage: SectionDoc) {
  return {
    name: 'Protocol builder test',
    schemaVersion: 8,
    codebook: {},
    stages: [stage],
  };
}

function createSession(overrides: Partial<ProtocolBuilderSessionOptions> = {}) {
  const onCommands = vi.fn();
  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: initialFields,
    protocolSections: {},
    manifestRevision: revision(1n),
    access: {
      mode: 'editable',
      leaseOwner: 'tab-1',
      leaseEpoch: 1n,
    },
    buildCandidate: ({ stageDocument: currentStage }) =>
      candidate(currentStage),
    onCommands,
    ...overrides,
  });
  return { onCommands, session };
}

const currentStageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const nodeSection = sectionId({ kind: 'codebookNode', typeId: 'person' });
const currentStageDocument: SectionDoc = {
  id: 'stage-1',
  type: 'Information',
  ...initialFields,
};

function compoundRequest() {
  return {
    id: 'create-person-and-select',
    description: 'Create person and select it',
    edits: [
      {
        kind: 'create' as const,
        sectionId: nodeSection,
        document: {
          name: 'Person',
          color: '#123456',
          shape: { default: 'circle' },
        },
      },
      {
        kind: 'update' as const,
        sectionId: currentStageSection,
        expectedContentHash: contentHash(currentStageDocument),
        commands: [
          {
            op: 'set' as const,
            key: 'subject',
            value: { entity: 'node', type: 'person' },
          },
        ],
      },
    ],
  };
}

describe('ProtocolBuilderSessionStore', () => {
  it('creates an identity without the secure-context randomUUID API', () => {
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockImplementation(() => {
        throw new Error('randomUUID is unavailable');
      });

    expect(createStageIdentity('Information').id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('keeps stage identity session-owned and stable', () => {
    const createId = vi.fn(() => 'stable-stage-id');
    const identity = createStageIdentity('Information', createId);

    expect(createId).toHaveBeenCalledOnce();
    expect(stageDocument(identity, initialFields)).toMatchObject({
      id: 'stable-stage-id',
      type: 'Information',
      label: 'Welcome',
    });
    expect(() =>
      stageDocument(identity, { ...initialFields, id: 'form-owned' }),
    ).toThrow(StageIdentityCommandError);
  });

  it('coalesces a form update into deterministic top-level commands', () => {
    expect(
      commandsFromDraftChange(
        { label: 'Old', optional: 'remove', unchanged: { nested: true } },
        { label: 'New', optional: undefined, unchanged: { nested: true } },
      ),
    ).toEqual([
      { op: 'set', key: 'label', value: 'New' },
      { op: 'unset', key: 'optional' },
    ]);
  });

  /**
   * A stage keeps lists and objects below its top level — a Family Pedigree's
   * family-member form at `nodeConfig.form` — and the diff is the route undo,
   * redo and every whole-draft change take. Writing the key ABOVE the
   * difference is the merge-blind write nested addressing exists to avoid.
   */
  it('addresses a nested change at the path the change is at', () => {
    expect(
      commandsFromDraftChange(nestedFields, {
        ...nestedFields,
        nodeConfig: { ...nestedNodeConfig, type: 'person' },
      }),
    ).toEqual([{ op: 'set', key: ['nodeConfig', 'type'], value: 'person' }]);
  });

  /**
   * A container the draft did not have before is a difference at every leaf
   * inside it, not one difference at the container. Said as the container, it
   * is a `set` of a whole object — and a `set` of an object is replayed
   * literally, so a sibling a collaborator wrote under the same container while
   * this draft was being made is written back out of existence.
   */
  it('addresses a container the draft creates at its own leaves', () => {
    expect(
      commandsFromDraftChange(
        { label: 'Pedigree' },
        { label: 'Pedigree', nodeConfig: { type: 'family_member', form: [] } },
      ),
    ).toEqual([
      { op: 'set', key: ['nodeConfig', 'form'], value: [] },
      { op: 'set', key: ['nodeConfig', 'type'], value: 'family_member' },
    ]);
  });

  /**
   * Except an EMPTY one, which has no leaf to say it with. What an empty
   * object means is a question about the document's schema, and the draft
   * saying the container is there is the whole of the difference.
   */
  it('says an empty container the draft creates as the container', () => {
    expect(
      commandsFromDraftChange(
        { label: 'Pedigree' },
        { label: 'Pedigree', nodeConfig: {} },
      ),
    ).toEqual([{ op: 'set', key: 'nodeConfig', value: {} }]);
  });

  it('keeps a top-level list addressed at its bare key', () => {
    const commands = commandsFromDraftChange(
      { prompts: [{ id: 'p1' }] },
      { prompts: [{ id: 'p1' }, { id: 'p2' }] },
    );
    expect(commands).toEqual([
      { op: 'insertItem', key: 'prompts', index: 1, item: { id: 'p2' } },
    ]);
    // The bare string, never a one-segment path: every command a top-level
    // field emits stays what it was on the wire and in the command log.
    expect(commands[0]?.key).toBe('prompts');
  });

  it('undoes and redoes a nested insert as the row operations that reverse it', () => {
    const { session } = createSession({ fields: nestedFields });
    session.dispatch([
      {
        op: 'insertItem',
        key: ['nodeConfig', 'form'],
        index: 1,
        item: { id: 'row-b' },
      },
    ]);

    session.undo();
    expect(lastBatchCommands(session)).toEqual([
      { op: 'removeItem', key: ['nodeConfig', 'form'], index: 1 },
    ]);

    session.redo();
    expect(lastBatchCommands(session)).toEqual([
      {
        op: 'insertItem',
        key: ['nodeConfig', 'form'],
        index: 1,
        item: { id: 'row-b' },
      },
    ]);
  });

  it('publishes snapshots and does not echo authoritative host updates', () => {
    const { onCommands, session } = createSession();
    const listener = vi.fn();
    session.subscribe(listener);

    session.dispatch([{ op: 'set', key: 'label', value: 'Edited' }]);
    expect(listener).toHaveBeenCalled();
    expect(onCommands).toHaveBeenCalledOnce();

    onCommands.mockClear();
    session.receiveAuthoritativeUpdate({
      protocolSections: { settings: { name: 'Remote rename' } },
      manifestRevision: revision(2n),
      attribution: {
        settings: {
          sessionId: 'tab-2',
          displayName: 'Remote editor',
          revision: revision(2n),
        },
      },
    });

    expect(onCommands).not.toHaveBeenCalled();
    expect(session.getSnapshot().protocolSections.settings).toEqual({
      name: 'Remote rename',
    });
  });

  it('validates the edit even when a live-applying host cannot take it', async () => {
    const { onCommands, session } = createSession();
    expect((await session.validate()).status).toBe('valid');
    onCommands.mockImplementation(() => {
      throw new Error('the host could not take the batch');
    });

    // The host's failure is the caller's to see: this batch did not reach it,
    // and nothing here can resend it.
    expect(() =>
      session.dispatch([{ op: 'set', key: 'title', value: '' }]),
    ).toThrow('the host could not take the batch');

    // The edit is in the draft whatever the host made of the news, so a
    // session left saying "validating" would go on saying it forever — and an
    // editor reading that would let the researcher save a draft the schema
    // rejects, on the strength of a verdict about the draft before this edit.
    expect(session.getSnapshot().editedSection.fields.title).toBe('');
    await vi.waitFor(() =>
      expect(session.getSnapshot().validation.status).toBe('invalid'),
    );
    expect(session.getSnapshot().validatedProtocol).toBeNull();
  });

  it('reuses protocol sections and context across field-only snapshots', () => {
    const personDocument = {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    } satisfies SectionDoc;
    const { session } = createSession({
      protocolSections: { [nodeSection]: personDocument },
    });
    const initial = session.getSnapshot();

    session.dispatch([{ op: 'set', key: 'label', value: 'Edited locally' }]);
    const afterDispatch = session.getSnapshot();

    expect(afterDispatch.protocolSections).toBe(initial.protocolSections);
    expect(afterDispatch.protocolContext).toBe(initial.protocolContext);

    session.receiveAuthoritativeUpdate({
      protocolSections: {
        [nodeSection]: { ...personDocument, name: 'People' },
      },
      manifestRevision: revision(2n),
    });
    const afterAuthoritative = session.getSnapshot();

    expect(afterAuthoritative.protocolSections).not.toBe(
      afterDispatch.protocolSections,
    );
    expect(afterAuthoritative.protocolContext).not.toBe(
      afterDispatch.protocolContext,
    );
    expect(afterAuthoritative.protocolContext.codebook.node?.person?.name).toBe(
      'People',
    );
  });

  it('rolls back pending commands and fences history when the lease is lost', async () => {
    const { session } = createSession();
    session.dispatch([{ op: 'set', key: 'label', value: 'Unacknowledged' }]);

    expect(session.getSnapshot().history.canUndo).toBe(true);
    expect(session.getSnapshot().pendingCommands).toHaveLength(1);

    session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });

    expect(session.getSnapshot().editedSection.fields.label).toBe('Welcome');
    expect(session.getSnapshot().pendingCommands).toHaveLength(0);
    expect(session.getSnapshot().history).toMatchObject({
      canUndo: false,
      canRedo: false,
      generation: 1,
      fencedAtRevision: revision(1n),
    });
    expect(() =>
      session.dispatch([{ op: 'set', key: 'label', value: 'Too late' }]),
    ).toThrow(SessionReadOnlyError);
    await expect(session.finish()).rejects.toBeInstanceOf(SessionReadOnlyError);
  });

  it('exposes a validated protocol only after canonical validation succeeds', async () => {
    const { session } = createSession();
    expect((await session.validate()).status).toBe('valid');
    expect(session.getSnapshot().validatedProtocol).not.toBeNull();

    session.dispatch([{ op: 'set', key: 'title', value: '' }]);
    const validation = await session.validate();

    expect(validation.status).toBe('invalid');
    expect(session.getSnapshot().validatedProtocol).toBeNull();
    await expect(session.finish()).rejects.toBeInstanceOf(
      InvalidProtocolDraftError,
    );
  });

  it('does not carry the batches of a finish that succeeded into the next one', async () => {
    // The whole of a buffering host: it applies what each finish carries, and
    // acknowledges nothing, which it owes the session at no point.
    let committed: SectionDoc = { ...initialFields };
    const onFinish = vi.fn(({ pendingCommands }: FinishRequest) => {
      committed = pendingCommands.reduce<SectionDoc>(
        (document, batch) => applyCommands(document, [...batch.commands]),
        committed,
      );
    });
    const { session } = createSession({ onFinish });

    session.dispatch([
      {
        op: 'insertItem',
        key: 'items',
        index: 0,
        item: { id: 'item-1', type: 'text', content: 'First' },
      },
    ]);
    await session.finish();

    session.dispatch([{ op: 'set', key: 'title', value: 'Second thoughts' }]);
    await session.finish();

    // Sending the first finish's batch again inserts the item a second time,
    // under a save that reports success. `items` is index-based, and nothing
    // but the researcher reading their own stage would ever notice.
    expect(
      onFinish.mock.calls.at(-1)?.[0].pendingCommands.map((batch) => batch.id),
    ).toEqual([2]);
    expect(committed).toEqual(session.getSnapshot().editedSection.fields);
    expect(committed.items).toEqual([
      { id: 'item-1', type: 'text', content: 'First' },
    ]);
  });

  it('acknowledges own commands but refuses generic authoritative rebasing', () => {
    const { session } = createSession();
    session.dispatch([{ op: 'set', key: 'label', value: 'First' }]);
    session.dispatch([{ op: 'set', key: 'title', value: 'Second' }]);

    expect(() =>
      session.replaceAuthoritativeStage({
        fields: { ...initialFields, label: 'Remote' },
        manifestRevision: revision(2n),
      }),
    ).toThrow(AuthoritativeConflictError);

    session.acknowledge({
      fields: { ...initialFields, label: 'First' },
      throughBatchId: 1,
      manifestRevision: revision(2n),
    });

    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
    expect(session.getSnapshot().editedSection.fields).toMatchObject({
      label: 'First',
      title: 'Second',
    });
  });

  /**
   * A pending batch describes an EDIT to the document the researcher was
   * looking at, so an index in it is a position in the list they could see and
   * a whole-list `set` in it is that list with one row rewritten. Replayed
   * literally onto a base a collaborator has changed, an append becomes a
   * mid-list insert, a removal takes whichever row moved into that slot, and a
   * `set` writes their rows back out of existence.
   */
  describe('a pending list command replayed onto a base that moved', () => {
    const rowA = { id: 'a' };
    const rowB = { id: 'b' };
    const rowC = { id: 'c' };
    const rowZ = { id: 'z' };
    const addedRow = { id: 'x' };
    const rewrittenB = { id: 'b', prompt: 'Rewritten here' };
    const FORM = ['nodeConfig', 'form'];

    const stageWith = (form: readonly SectionDoc[]): SectionDoc => ({
      label: 'Pedigree',
      nodeConfig: { type: 'family_member', form: [...form] },
    });

    const insertedAbove = [rowZ, rowA, rowB, rowC];
    const insertedBelow = [rowA, rowB, rowC, rowZ];
    const removedAbove = [rowB, rowC];

    const replay = (command: Command, arriving: readonly SectionDoc[]) => {
      const { session } = createSession({
        fields: stageWith([rowA, rowB, rowC]),
      });
      session.dispatch([command]);
      session.acknowledge({
        fields: stageWith(arriving),
        throughBatchId: 0,
        manifestRevision: revision(2n),
      });
      const { nodeConfig } = session.getSnapshot().editedSection.fields;
      const form =
        typeof nodeConfig === 'object' && nodeConfig !== null
          ? Reflect.get(nodeConfig, 'form')
          : undefined;
      return {
        form,
        pending: session
          .getSnapshot()
          .pendingCommands.flatMap((batch) => [...batch.commands]),
      };
    };

    it('keeps an append an append', () => {
      const append: Command = {
        op: 'insertItem',
        key: FORM,
        index: 3,
        item: addedRow,
      };
      expect(replay(append, insertedAbove).form).toEqual([
        rowZ,
        rowA,
        rowB,
        rowC,
        addedRow,
      ]);
      expect(replay(append, insertedBelow).form).toEqual([
        rowA,
        rowB,
        rowC,
        rowZ,
        addedRow,
      ]);
      expect(replay(append, removedAbove).form).toEqual([rowB, rowC, addedRow]);
    });

    it('removes the row the removal named, wherever it has moved to', () => {
      const remove: Command = { op: 'removeItem', key: FORM, index: 2 };
      expect(replay(remove, insertedAbove).form).toEqual([rowZ, rowA, rowB]);
      expect(replay(remove, insertedBelow).form).toEqual([rowA, rowB, rowZ]);
      expect(replay(remove, removedAbove).form).toEqual([rowB]);
    });

    it('moves the row the move named, to the row it was going to follow', () => {
      const move: Command = { op: 'moveItem', key: FORM, from: 2, to: 0 };
      expect(replay(move, insertedAbove).form).toEqual([
        rowZ,
        rowC,
        rowA,
        rowB,
      ]);
      expect(replay(move, insertedBelow).form).toEqual([
        rowC,
        rowA,
        rowB,
        rowZ,
      ]);
      // The row it was to be put above has gone, so where the researcher meant
      // it to land cannot be worked out and the move is refused rather than
      // guessed at.
      expect(replay(move, removedAbove).form).toEqual([rowB, rowC]);
    });

    it('merges a whole-list rewrite row by row', () => {
      const rewrite: Command = {
        op: 'set',
        key: FORM,
        value: [rowA, rewrittenB, rowC],
      };
      expect(replay(rewrite, insertedAbove).form).toEqual([
        rowZ,
        rowA,
        rewrittenB,
        rowC,
      ]);
      expect(replay(rewrite, insertedBelow).form).toEqual([
        rowA,
        rewrittenB,
        rowC,
        rowZ,
      ]);
      // The row the arrival removed stays removed: the local rewrite said
      // nothing about it, so it has no claim on it.
      expect(replay(rewrite, removedAbove).form).toEqual([rewrittenB, rowC]);
    });

    it('drops a row command whose row has left the list', () => {
      const remove: Command = { op: 'removeItem', key: FORM, index: 2 };
      const replayed = replay(remove, [rowA, rowB]);
      expect(replayed.form).toEqual([rowA, rowB]);
      expect(replayed.pending).toEqual([]);
    });
  });

  /**
   * The snapshot's own copy of the stage section is the only authoritative
   * stage document a caller can read — the one a compound edit hashes, and the
   * one `orderedStages` is built from — so an authoritative replacement moves
   * it along with the base.
   */
  it('moves the stage document a caller reads when the stage is replaced', () => {
    const { session } = createSession({
      protocolSections: { [currentStageSection]: currentStageDocument },
    });

    session.replaceAuthoritativeStage({
      fields: { ...initialFields, label: 'Remote' },
      manifestRevision: revision(2n),
    });

    expect(session.getSnapshot().protocolSections[currentStageSection]).toEqual(
      { ...currentStageDocument, label: 'Remote' },
    );
  });

  it('stamps and atomically reconciles a structural compound edit', async () => {
    const onCommands = vi.fn();
    const onCompoundEdit = vi.fn().mockResolvedValue({
      status: 'applied',
      update: {
        protocolSections: {
          [currentStageSection]: {
            id: 'stage-1',
            type: 'Information',
            ...initialFields,
            subject: { entity: 'node', type: 'person' },
          },
          [nodeSection]: {
            name: 'Person',
            color: '#123456',
            shape: { default: 'circle' },
          },
        },
        manifestRevision: revision(2n),
      },
    });
    const { session } = createSession({ onCommands, onCompoundEdit });
    session.dispatch([{ op: 'set', key: 'label', value: 'Edited' }]);
    session.acknowledge({
      fields: { ...initialFields, label: 'Edited' },
      throughBatchId: 1,
      manifestRevision: revision(1n),
    });

    const result = await session.requestCompoundEdit(compoundRequest());

    expect(onCompoundEdit).toHaveBeenCalledWith({
      ...compoundRequest(),
      authority: {
        sectionId: currentStageSection,
        leaseOwner: 'tab-1',
        leaseEpoch: 1n,
      },
    });
    expect(result.status).toBe('applied');
    expect(onCommands).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      editedSection: {
        fields: {
          label: 'Welcome',
          subject: { entity: 'node', type: 'person' },
        },
      },
      manifestRevision: revision(2n),
      history: { canUndo: false, canRedo: false, generation: 1 },
    });
    expect(session.getSnapshot().protocolSections[nodeSection]).toMatchObject({
      name: 'Person',
    });
  });

  it('preserves stage edits dispatched while a compound request is pending', async () => {
    let resolveHost:
      | ((result: {
          status: 'applied';
          update: {
            protocolSections: Record<string, SectionDoc>;
            manifestRevision: ReturnType<typeof revision>;
          };
        }) => void)
      | undefined;
    const onCompoundEdit = vi.fn(
      () =>
        new Promise<{
          status: 'applied';
          update: {
            protocolSections: Record<string, SectionDoc>;
            manifestRevision: ReturnType<typeof revision>;
          };
        }>((resolve) => {
          resolveHost = resolve;
        }),
    );
    const { onCommands, session } = createSession({ onCompoundEdit });
    const pending = session.requestCompoundEdit(compoundRequest());

    session.dispatch([
      { op: 'set', key: 'label', value: 'Typed while the request was pending' },
    ]);
    resolveHost?.({
      status: 'applied',
      update: {
        protocolSections: {
          [currentStageSection]: {
            ...currentStageDocument,
            subject: { entity: 'node', type: 'person' },
          },
          [nodeSection]: {
            name: 'Person',
            color: '#123456',
            shape: { default: 'circle' },
          },
        },
        manifestRevision: revision(2n),
      },
    });

    await expect(pending).resolves.toMatchObject({ status: 'applied' });
    expect(session.getSnapshot().editedSection.fields).toMatchObject({
      label: 'Typed while the request was pending',
      subject: { entity: 'node', type: 'person' },
    });
    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
    expect(session.getSnapshot().history.canUndo).toBe(true);
    expect(onCommands).toHaveBeenCalledOnce();
  });

  it('refuses a concurrent compound submission before it reaches the host', async () => {
    let resolveFirst:
      | ((result: Extract<CompoundEditResult, { status: 'applied' }>) => void)
      | undefined;
    const onCompoundEdit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Extract<CompoundEditResult, { status: 'applied' }>>(
            (resolve) => {
              resolveFirst = resolve;
            },
          ),
      )
      .mockResolvedValueOnce({
        status: 'applied',
        update: {
          protocolSections: {
            [currentStageSection]: currentStageDocument,
            [nodeSection]: { name: 'Second edit' },
          },
          manifestRevision: revision(3n),
        },
      });
    const { session } = createSession({ onCompoundEdit });
    const first = session.requestCompoundEdit(compoundRequest());

    await expect(
      session.requestCompoundEdit({
        ...compoundRequest(),
        id: 'concurrent-person-edit',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      reason: 'compound-in-flight',
    });
    expect(onCompoundEdit).toHaveBeenCalledOnce();

    resolveFirst?.({
      status: 'applied',
      update: {
        protocolSections: {
          [currentStageSection]: currentStageDocument,
          [nodeSection]: { name: 'First edit' },
        },
        manifestRevision: revision(2n),
      },
    });
    await expect(first).resolves.toMatchObject({ status: 'applied' });
    expect(session.getSnapshot().protocolSections[nodeSection]).toEqual({
      name: 'First edit',
    });

    await expect(
      session.requestCompoundEdit({
        ...compoundRequest(),
        id: 'subsequent-person-edit',
      }),
    ).resolves.toMatchObject({ status: 'applied' });
    expect(onCompoundEdit).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().protocolSections[nodeSection]).toEqual({
      name: 'Second edit',
    });
  });

  it('rejects malformed compound requests before invoking the host', async () => {
    const onCompoundEdit = vi.fn();
    const { session } = createSession({ onCompoundEdit });
    const invalidRequests: CompoundEditRequest[] = [
      { id: '', description: 'Missing id', edits: compoundRequest().edits },
      { id: 'empty', description: 'Empty', edits: [] },
      {
        id: 'duplicate',
        description: 'Duplicate',
        edits: [compoundRequest().edits[0]!, compoundRequest().edits[0]!],
      },
      {
        id: 'empty-update',
        description: 'Empty update',
        edits: [
          {
            kind: 'update' as const,
            sectionId: nodeSection,
            expectedContentHash: 'base-node-hash',
            commands: [],
          },
        ],
      },
      {
        id: 'identity',
        description: 'Stage identity',
        edits: [
          {
            kind: 'update' as const,
            sectionId: currentStageSection,
            expectedContentHash: contentHash(currentStageDocument),
            commands: [{ op: 'set' as const, key: 'id', value: 'replaced' }],
          },
        ],
      },
    ];

    for (const request of invalidRequests) {
      await expect(session.requestCompoundEdit(request)).resolves.toMatchObject(
        {
          status: 'failed',
          reason: 'invalid-request',
        },
      );
    }
    expect(onCompoundEdit).not.toHaveBeenCalled();
  });

  it('does not mutate any session state when a compound edit is blocked', async () => {
    const onCompoundEdit = vi.fn().mockResolvedValue({
      status: 'blocked',
      blockedSections: [{ sectionId: nodeSection }],
    });
    const { session } = createSession({ onCompoundEdit });
    await session.validate();
    const before = session.getSnapshot();

    await expect(
      session.requestCompoundEdit(compoundRequest()),
    ).resolves.toMatchObject({ status: 'blocked' });

    expect(session.getSnapshot()).toBe(before);
  });

  it('rejects a codebook-only applied result that omits the current stage from the full snapshot', async () => {
    const onCompoundEdit = vi.fn().mockResolvedValue({
      status: 'applied',
      update: {
        protocolSections: {
          [nodeSection]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
          },
        },
        manifestRevision: revision(2n),
      },
    });
    const { session } = createSession({ onCompoundEdit });
    await session.validate();
    const before = session.getSnapshot();
    const request: CompoundEditRequest = {
      id: 'create-person-only',
      description: 'Create person type',
      edits: [compoundRequest().edits[0]!],
    };

    await expect(session.requestCompoundEdit(request)).resolves.toMatchObject({
      status: 'failed',
      reason: 'invalid-response',
      sectionId: currentStageSection,
    });
    expect(session.getSnapshot()).toBe(before);
  });

  /**
   * The same answer, to a session on a stage that is being CREATED. The
   * interview does not contain the stage, so no full protocol snapshot can,
   * and the omission is the only correct answer rather than a broken one.
   */
  it('takes the same result for a stage the interview does not contain yet', async () => {
    const onCompoundEdit = vi.fn().mockResolvedValue({
      status: 'applied',
      update: {
        protocolSections: {
          [nodeSection]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
          },
        },
        manifestRevision: revision(2n),
      },
    });
    const { session } = createSession({
      onCompoundEdit,
      creation: { position: 0 },
    });
    await session.validate();
    const request: CompoundEditRequest = {
      id: 'create-person-only',
      description: 'Create person type',
      edits: [compoundRequest().edits[0]!],
    };

    await expect(session.requestCompoundEdit(request)).resolves.toMatchObject({
      status: 'applied',
    });
    expect(session.getSnapshot()).toMatchObject({
      manifestRevision: revision(2n),
      editedSection: { fields: initialFields },
    });
    expect(session.getSnapshot().protocolSections[nodeSection]).toMatchObject({
      name: 'Person',
    });
  });

  it('fences a compound result that resolves after lease loss', async () => {
    let resolveHost:
      | ((result: {
          status: 'applied';
          update: {
            protocolSections: Record<string, SectionDoc>;
            manifestRevision: ReturnType<typeof revision>;
          };
        }) => void)
      | undefined;
    const onCompoundEdit = vi.fn(
      () =>
        new Promise<{
          status: 'applied';
          update: {
            protocolSections: Record<string, SectionDoc>;
            manifestRevision: ReturnType<typeof revision>;
          };
        }>((resolve) => {
          resolveHost = resolve;
        }),
    );
    const { session } = createSession({ onCompoundEdit });
    const pending = session.requestCompoundEdit(compoundRequest());

    session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    resolveHost?.({
      status: 'applied',
      update: {
        protocolSections: {
          [nodeSection]: { name: 'Must not land' },
        },
        manifestRevision: revision(2n),
      },
    });

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      reason: 'lease-lost',
    });
    expect(session.getSnapshot().protocolSections[nodeSection]).toBeUndefined();
    expect(session.getSnapshot().manifestRevision).toEqual(revision(1n));
  });

  it('does not regress to an out-of-order authoritative revision', async () => {
    const onCompoundEdit = vi.fn().mockResolvedValue({
      status: 'applied',
      update: {
        protocolSections: { [nodeSection]: { name: 'Stale' } },
        manifestRevision: revision(2n),
      },
    });
    const { session } = createSession({ onCompoundEdit });
    const pending = session.requestCompoundEdit(compoundRequest());
    session.receiveAuthoritativeUpdate({
      protocolSections: { [nodeSection]: { name: 'Newest' } },
      manifestRevision: revision(3n),
    });

    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      reason: 'stale-result',
    });
    expect(session.getSnapshot().protocolSections[nodeSection]).toEqual({
      name: 'Newest',
    });

    session.receiveAuthoritativeUpdate({
      protocolSections: { [nodeSection]: { name: 'Older broadcast' } },
      manifestRevision: revision(1n),
    });
    expect(session.getSnapshot().protocolSections[nodeSection]).toEqual({
      name: 'Newest',
    });
  });

  it('ignores an authoritative broadcast with an equal sequence but different hash', () => {
    const { session } = createSession();
    const before = session.getSnapshot();

    session.receiveAuthoritativeUpdate({
      protocolSections: { [nodeSection]: { name: 'Conflicting fork' } },
      manifestRevision: conflictingRevision(1n),
    });

    expect(session.getSnapshot()).toBe(before);
    expect(session.getSnapshot().protocolSections[nodeSection]).toBeUndefined();
  });

  it('ignores a conflicting equal-sequence acknowledgement but accepts the exact revision', () => {
    const { session } = createSession();
    session.dispatch([{ op: 'set', key: 'label', value: 'Local edit' }]);

    session.acknowledge({
      fields: { ...initialFields, label: 'Conflicting acknowledgement' },
      throughBatchId: 1,
      manifestRevision: conflictingRevision(1n),
    });

    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
    expect(session.getSnapshot().editedSection.fields.label).toBe('Local edit');
    expect(session.getSnapshot().manifestRevision).toEqual(revision(1n));

    session.acknowledge({
      fields: { ...initialFields, label: 'Local edit' },
      throughBatchId: 1,
      manifestRevision: revision(1n),
    });

    expect(session.getSnapshot().pendingCommands).toHaveLength(0);
    expect(session.getSnapshot().editedSection.fields.label).toBe('Local edit');
  });

  it('ignores an equal-sequence authoritative stage replacement with a different hash', () => {
    const { session } = createSession();

    session.replaceAuthoritativeStage({
      fields: { ...initialFields, label: 'Conflicting replacement' },
      manifestRevision: conflictingRevision(1n),
    });

    expect(session.getSnapshot().editedSection.fields.label).toBe('Welcome');
    expect(session.getSnapshot().manifestRevision).toEqual(revision(1n));
  });

  it('rejects a conflicting equal-sequence compound result but allows the exact revision', async () => {
    const conflictingHost = vi.fn().mockResolvedValue({
      status: 'applied',
      update: {
        protocolSections: { [nodeSection]: { name: 'Conflicting fork' } },
        manifestRevision: conflictingRevision(1n),
      },
    });
    const { session: conflictingSession } = createSession({
      onCompoundEdit: conflictingHost,
    });

    await expect(
      conflictingSession.requestCompoundEdit(compoundRequest()),
    ).resolves.toMatchObject({ status: 'failed', reason: 'stale-result' });
    expect(
      conflictingSession.getSnapshot().protocolSections[nodeSection],
    ).toBeUndefined();

    const idempotentHost = vi.fn().mockResolvedValue({
      status: 'applied',
      update: {
        protocolSections: {
          [nodeSection]: { name: 'Person' },
          [currentStageSection]: {
            ...currentStageDocument,
            subject: { entity: 'node', type: 'person' },
          },
        },
        manifestRevision: revision(1n),
      },
    });
    const { session: idempotentSession } = createSession({
      onCompoundEdit: idempotentHost,
    });

    await expect(
      idempotentSession.requestCompoundEdit(compoundRequest()),
    ).resolves.toMatchObject({ status: 'applied' });
    expect(
      idempotentSession.getSnapshot().protocolSections[nodeSection],
    ).toEqual({ name: 'Person' });
  });

  it('reports an attributed remote dependency deletion without losing metadata access', async () => {
    const formStageSection = sectionId({
      kind: 'stage',
      stageId: 'form-stage',
    });
    const personSection = sectionId({
      kind: 'codebookNode',
      typeId: 'person:alias',
    });
    const fields: SectionDoc = {
      label: 'Person form',
      subject: { entity: 'node', type: 'person:alias' },
      introductionPanel: { title: 'Questions', text: 'Answer these.' },
      form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
    };
    const sections: Record<string, SectionDoc> = {
      [sectionId({ kind: 'settings' })]: {
        name: 'Remote dependency test',
        schemaVersion: 8,
      },
      [sectionId({ kind: 'stageOrder' })]: { stages: ['form-stage'] },
      [formStageSection]: {
        id: 'form-stage',
        type: 'AlterForm',
        ...fields,
      },
      [personSection]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          age: { name: 'Age', type: 'number', component: 'Number' },
        },
      },
    };
    const session = new ProtocolBuilderSessionStore({
      identity: createStageIdentity('AlterForm', () => 'form-stage'),
      fields,
      protocolSections: sections,
      manifestRevision: revision(1n),
      access: {
        mode: 'editable',
        leaseOwner: 'tab-1',
        leaseEpoch: 1n,
      },
      buildCandidate: ({ stageDocument: currentStage, protocolSections }) =>
        assembleProtocolSections({
          ...protocolSections,
          [formStageSection]: currentStage,
        }),
    });
    expect((await session.validate()).status).toBe('valid');

    const deletionAttribution = {
      sessionId: 'remote-tab',
      displayName: 'Remote editor',
      revision: revision(2n),
    };
    session.receiveAuthoritativeUpdate({
      protocolSections: {
        ...sections,
        [personSection]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {},
        },
      },
      manifestRevision: revision(2n),
      attribution: { [personSection]: deletionAttribution },
    });
    const validation = await session.validate();

    expect(validation).toMatchObject({ status: 'invalid' });
    if (validation.status !== 'invalid') throw new Error('expected invalid');
    expect(
      validation.issues.find(({ message }) =>
        message.includes('does not exist in the codebook'),
      ),
    ).toMatchObject({
      attributedChange: {
        sectionId: personSection,
        attribution: deletionAttribution,
      },
    });
    expect(
      session.getSnapshot().protocolContext.codebook.node?.['person:alias']
        ?.name,
    ).toBe('Person');
    expect(
      session.getSnapshot().protocolContext.codebook.node?.['person:alias']
        ?.variables?.age,
    ).toBeUndefined();
  });
});
