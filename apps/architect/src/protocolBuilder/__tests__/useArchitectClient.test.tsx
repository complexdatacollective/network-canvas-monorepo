import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { Redacted } from 'effect';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  CurrentProtocolSchema,
  type ExtractedAsset,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { getAssetManifest, getProtocol } from '~/selectors/protocol';

import type { ArchitectStore } from '../architectStore.ts';
import { useArchitectClient } from '../useArchitectClient.ts';

// Architect's IndexedDB asset store is out of reach here; an import only has
// to land somewhere for its promotion to be checked.
vi.mock('~/utils/assetUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/assetUtils')>()),
  saveAssetWithFallback: (_asset: ExtractedAsset) =>
    Promise.resolve({ persisted: true }),
}));

const PROTOCOL_ID = 'library-row-1';
const EDIT = 'edit-1';
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });

const openStore = (): ArchitectStore => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setActiveProtocolId(PROTOCOL_ID));
  store.dispatch(setActiveProtocol(CurrentProtocolSchema.parse(allInterfaces)));
  return store;
};

const stageLabel = (store: ArchitectStore): string | undefined =>
  getProtocol(store.getState())?.stages.find(
    (stage) => stage.id === 'information-1',
  )?.label;

describe('useArchitectClient', () => {
  it('keeps one working client through StrictMode, and disposes it on unmount', async () => {
    const store = openStore();
    const { result, rerender, unmount } = renderHook(
      () => useArchitectClient(store, 'Another tab'),
      { wrapper: StrictMode },
    );
    const { adapter } = result.current;
    await Promise.resolve();

    const held = await adapter.rpcCall('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await adapter.rpcCall('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: 'write-1',
      sectionId: INFORMATION,
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: 'Edited under StrictMode',
      }),
      revision: held.revision,
    });
    expect(stageLabel(store)).toBe('Edited under StrictMode');

    rerender();
    expect(result.current.adapter).toBe(adapter);

    unmount();
    await Promise.resolve();
    await expect(
      adapter.rpcCall('ListSections', { protocolId: PROTOCOL_ID }),
    ).rejects.toThrow('ManagedRuntime disposed');
  });

  it('builds a new client for a new store, and disposes the old one', async () => {
    const first = openStore();
    const second = openStore();
    const { result, rerender, unmount } = renderHook(
      ({ store }: { store: ArchitectStore }) =>
        useArchitectClient(store, 'Another tab'),
      { initialProps: { store: first } },
    );
    const initial = result.current.adapter;
    await initial.rpcCall('ListSections', { protocolId: PROTOCOL_ID });

    rerender({ store: second });
    const overSecond = result.current.adapter;
    expect(overSecond).not.toBe(initial);
    await Promise.resolve();
    await expect(
      initial.rpcCall('ListSections', { protocolId: PROTOCOL_ID }),
    ).rejects.toThrow('ManagedRuntime disposed');
    const held = await overSecond.rpcCall('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    await overSecond.rpcCall('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: 'write-2',
      sectionId: INFORMATION,
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: 'Written to the second store',
      }),
      revision: held.revision,
    });
    expect(stageLabel(second)).toBe('Written to the second store');
    expect(stageLabel(first)).not.toBe('Written to the second store');

    unmount();
  });

  it('keeps the client, and what an edit imported, through a language change', async () => {
    const store = openStore();
    const { result, rerender, unmount } = renderHook(
      ({ name }: { name: string }) => useArchitectClient(store, name),
      { initialProps: { name: 'Another tab' } },
    );
    const { adapter } = result.current;
    const staged = await adapter.rpcCall('ResourcesStage', {
      protocolId: PROTOCOL_ID,
      editId: EDIT,
      requestId: 'import-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: Redacted.make('A photograph'),
        source: Redacted.make('photo.png'),
        contentType: 'image/png',
        bytes: Redacted.make(new Uint8Array([1, 2, 3])),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    rerender({ name: 'Ein anderer Tab' });
    await Promise.resolve();
    expect(result.current.adapter).toBe(adapter);

    const held = await adapter.rpcCall('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    const written = await adapter.rpcCall('Submit', {
      protocolId: PROTOCOL_ID,
      requestId: 'write-3',
      sectionId: INFORMATION,
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: 'Names the photograph',
      }),
      revision: held.revision,
      promote: { editId: EDIT, resourceIds: [resourceId] },
    });
    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    expect(getAssetManifest(store.getState())[resourceId]).toBeDefined();

    // The label a lock holder is reported under is the current language's.
    store.dispatch(setProtocolLockState('open-elsewhere'));
    const blocked = await adapter.rpcCall('AcquireLock', {
      protocolId: PROTOCOL_ID,
      sectionId: INFORMATION,
    });
    expect(
      blocked.lock === 'readOnly' && Redacted.value(blocked.holder.displayName),
    ).toBe('Ein anderer Tab');

    unmount();
  });
});
