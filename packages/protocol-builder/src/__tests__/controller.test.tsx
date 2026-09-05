import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../controller.ts';
import type { ProtocolBuilderResourceGateway } from '../resources/gateway.ts';
import { InMemoryResourceGateway } from '../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../session.ts';

function createSession(
  onCommands = vi.fn(),
  resourceGateway?: ProtocolBuilderResourceGateway,
) {
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
    ...(resourceGateway === undefined ? {} : { resourceGateway }),
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

  it('cancels the session, discarding what the editor staged', async () => {
    const host = new InMemoryResourceGateway();
    const { session } = createSession(vi.fn(), host);
    const { result } = renderHook(() =>
      useStageEditorController(session, 'stage-form'),
    );
    const pickerGateway = result.current.resourceGateway;
    if (pickerGateway === undefined) {
      throw new Error('the controller was given no resource gateway');
    }

    await act(async () => {
      await pickerGateway.stageUpload({
        requestId: 'backdrop',
        kind: 'image',
        name: 'Backdrop',
        source: 'backdrop.png',
        contentType: 'image/png',
        bytes: Uint8Array.from([1, 2, 3, 4]),
      });
    });
    expect(result.current.snapshot.stagedResources).toHaveLength(1);

    // Closing the editor without saving: the staging goes with it, or the host
    // keeps bytes for an edit that never happened.
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.cancel();
    });

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(result.current.snapshot.stagedResources).toEqual([]);
    expect(host.getStagingResidue()).toEqual([]);
  });
});
