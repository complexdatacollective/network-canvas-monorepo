import { describe, expect, it, vi } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
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
