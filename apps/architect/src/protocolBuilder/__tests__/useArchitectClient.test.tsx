import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import type { ArchitectStore } from '../architectStore.ts';
import { useArchitectClient } from '../useArchitectClient.ts';

const PROTOCOL_ID = 'library-row-1';
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
      document: { ...held.document, label: 'Edited under StrictMode' },
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
});
