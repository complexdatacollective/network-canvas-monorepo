import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  AuthoritativeConflictError,
  commandsFromDraftChange,
  createStageIdentity,
  InvalidProtocolDraftError,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
  stageDocument,
  StageIdentityCommandError,
  type ProtocolBuilderSessionOptions,
} from '../session.ts';

const revision = (sequence: bigint) => ({
  sequence,
  hash: `revision-${sequence}`,
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

describe('ProtocolBuilderSessionStore', () => {
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
});
