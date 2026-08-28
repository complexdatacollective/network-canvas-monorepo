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
      result.current.changeFields({
        label: 'Renamed',
        title: 'Welcome',
        items: [],
      });
      await session.validate();
    });

    expect(result.current.formId).toBe('stage-form');
    expect(onCommands).toHaveBeenCalledWith({
      id: 1,
      commands: [{ op: 'set', key: 'label', value: 'Renamed' }],
    });
    expect(result.current.snapshot.editedSection.fields.label).toBe('Renamed');
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
});
