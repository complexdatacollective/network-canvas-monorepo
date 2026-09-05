import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../controller.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../session.ts';

function createSession(onCommands = vi.fn()) {
  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: { label: 'Welcome', title: 'Welcome', items: [] },
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: {
      mode: 'editable',
      leaseOwner: 'tab-1',
      leaseEpoch: 1n,
    },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Controller test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
    onCommands,
  });
  return { onCommands, session };
}

describe('useStageEditorController', () => {
  it('batches changed form fields without re-emitting unchanged values', async () => {
    const { onCommands, session } = createSession();
    const { result } = renderHook(() =>
      useStageEditorController(session, 'stage-form'),
    );

    await act(async () => {
      result.current.changeFields((current) => ({
        ...current,
        label: 'Renamed',
      }));
      await session.validate();
    });

    expect(result.current.formId).toBe('stage-form');
    expect(onCommands).toHaveBeenCalledWith({
      id: 1,
      commands: [{ op: 'set', key: 'label', value: 'Renamed' }],
    });
    expect(result.current.snapshot.editedSection.fields.label).toBe('Renamed');
  });

  it('does not revert a change that landed between render and submit', async () => {
    const { onCommands, session } = createSession();
    const { result } = renderHook(() =>
      useStageEditorController(session, 'stage-form'),
    );

    // The controller a render captured, held across an update — which is what
    // a submit handler closing over its render actually has when a save lands
    // while the form is open.
    const captured = result.current;

    await act(async () => {
      session.acknowledge({
        fields: { label: 'Welcome', title: 'Renamed elsewhere', items: [] },
        throughBatchId: 0,
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
      await session.validate();
    });
    onCommands.mockClear();

    await act(async () => {
      captured.changeFields((current) => ({
        ...current,
        label: 'Edited here',
      }));
      await session.validate();
    });

    // Only the edit, with nothing reverting the title that arrived in between.
    expect(onCommands).toHaveBeenCalledTimes(1);
    expect(onCommands).toHaveBeenCalledWith({
      id: 1,
      commands: [{ op: 'set', key: 'label', value: 'Edited here' }],
    });
    expect(result.current.snapshot.editedSection.fields.title).toBe(
      'Renamed elsewhere',
    );
  });

  it('uses identity-preserving array commands for row operations', async () => {
    const { onCommands, session } = createSession();
    const { result } = renderHook(() => useStageEditorController(session));
    const item: SectionDoc = { id: 'item-1', type: 'text', content: 'Hello' };

    await act(async () => {
      result.current.insertItem('items', 0, item);
      result.current.moveItem('items', 0, 0);
      result.current.removeItem('items', 0);
      await session.validate();
    });

    expect(
      onCommands.mock.calls.map(([batch]) => batch.commands[0].op),
    ).toEqual(['insertItem', 'removeItem']);
  });

  it('answers an empty batch with the current draft rather than writing', async () => {
    const { onCommands, session } = createSession();
    const { result } = renderHook(() => useStageEditorController(session));

    await act(async () => {
      session.acknowledge({
        fields: { label: 'Welcome', title: 'Renamed elsewhere', items: [] },
        throughBatchId: 0,
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
      await session.validate();
    });
    onCommands.mockClear();

    // An empty batch is how a list editor READS the draft the session holds
    // right now — which is the whole point of asking rather than reading the
    // snapshot it rendered against.
    let answered: SectionDoc = {};
    act(() => {
      answered = result.current.applyCommands([]);
    });

    expect(answered.title).toBe('Renamed elsewhere');
    expect(onCommands).not.toHaveBeenCalled();
  });

  it('reads the draft of a session that has stopped accepting writes', () => {
    const { session } = createSession();
    act(() => {
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });
    const { result } = renderHook(() => useStageEditorController(session));

    // Reading is not writing, and a spectator's list editor still has to be
    // able to ask. A session refuses a dispatch it no longer holds the lease
    // for by throwing, so an empty batch that reached one would take the
    // editor down rather than answering the question it was asked.
    expect(() => result.current.applyCommands([])).not.toThrow();
    expect(result.current.applyCommands([]).title).toBe('Welcome');
  });
});
