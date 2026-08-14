import { configureStore } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appReducer, {
  getStorageUnavailable,
  setProtocolLockState,
  setStorageUnavailable,
} from '~/ducks/modules/app';
import stageEditorDraftReducer, {
  draftTimelineActions,
} from '~/ducks/modules/stageEditorDraft';

import reducer, { importAssetAsync, test } from '../assetManifest';

vi.mock('~/utils/protocols/assetTools', () => ({
  validateAsset: vi.fn(),
}));

vi.mock('~/utils/protocols/importAsset', () => ({
  getSupportedAssetType: vi.fn(() => 'network'),
}));

vi.mock('~/utils/assetUtils', () => ({
  saveAssetWithFallback: vi.fn(() => Promise.resolve({ persisted: true })),
}));

const { validateAsset } = await import('~/utils/protocols/assetTools');
const mockedValidateAsset = vi.mocked(validateAsset);
const { saveAssetWithFallback } = await import('~/utils/assetUtils');
const mockedSaveAssetWithFallback = vi.mocked(saveAssetWithFallback);

const createTestStore = () =>
  configureStore({
    reducer: {
      app: appReducer,
      assetManifest: reducer,
      // The refusal below distinguishes a blocked reclaim waiting on a stage
      // draft from one waiting on an open editor, and reads this slice to
      // tell them apart.
      stageEditorDraft: stageEditorDraftReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });

describe('protocol/assetManifest', () => {
  describe('reducer', () => {
    it('IMPORT_ASSET_COMPLETE correctly updates state', () => {
      const assetId = uuid();
      const result = reducer(
        undefined,
        test.importAssetComplete(
          'uuid-file-location-in-protocol',
          'my-original-filename.jpg',
          'image',
          assetId,
        ),
      );

      // Should have one entry
      const entries = Object.values(result);
      expect(entries).toHaveLength(1);

      // Entry should have correct properties
      expect(entries[0]).toMatchObject({
        name: 'my-original-filename.jpg',
        source: 'uuid-file-location-in-protocol',
        type: 'image',
      });
      expect(entries[0]?.id).toBeTruthy();
    });

    it('DELETE_ASSET correctly updates state', () => {
      const assetId = uuid();
      const state = {
        [assetId]: {
          id: assetId,
          name: 'my-original-filename.jpg',
          source: 'uuid-file-location-in-protocol',
          type: 'image' as const,
        },
      };
      const result = reducer(state, test.deleteAsset(assetId));
      expect(result).toEqual({});
    });
  });

  describe('importAssetAsync', () => {
    let store: ReturnType<typeof createTestStore>;

    beforeEach(() => {
      store = createTestStore();
      vi.clearAllMocks();
      mockedSaveAssetWithFallback.mockResolvedValue({ persisted: true });
    });

    it('flags storage-unavailable when the asset only persisted to memory', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      mockedSaveAssetWithFallback.mockResolvedValue({ persisted: false });

      const file = new File(['test'], 'roster.csv', { type: 'text/csv' });
      await store.dispatch(importAssetAsync(file));

      expect(getStorageUnavailable(store.getState())).toBe(true);
      // The asset still landed in the manifest despite storage being unavailable.
      expect(Object.values(store.getState().assetManifest)).toHaveLength(1);
    });

    it('clears a stuck storage-unavailable flag when the durable write succeeds', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      mockedSaveAssetWithFallback.mockResolvedValue({ persisted: true });

      // Simulate a prior transient failure that left the flag set for the session.
      store.dispatch(setStorageUnavailable(true));
      expect(getStorageUnavailable(store.getState())).toBe(true);

      const file = new File(['test'], 'roster.csv', { type: 'text/csv' });
      await store.dispatch(importAssetAsync(file));

      expect(getStorageUnavailable(store.getState())).toBe(false);
    });

    it('returns duplicate row metadata when duplicateCount > 0', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 3 });

      const file = new File(['test'], 'roster.csv', { type: 'text/csv' });
      const result = await store.dispatch(importAssetAsync(file)).unwrap();

      expect(result.duplicateCount).toBe(3);
    });

    // The asset store is keyed by protocol id and has no exclusivity check of
    // its own, so a tab that no longer owns the protocol could otherwise drop a
    // durable blob into the owning tab's scope — with a manifest entry naming
    // it that can never be saved.
    it('refuses to write anything when the protocol is open in another tab', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      store.dispatch(setProtocolLockState('open-elsewhere'));

      const file = new File(['test'], 'roster.csv', { type: 'text/csv' });
      const result = await store.dispatch(importAssetAsync(file));

      expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
      expect(Object.values(store.getState().assetManifest)).toHaveLength(0);
      expect(result.payload).toMatchObject({
        code: 'PROTOCOL_NOT_OWNED_HERE',
        filename: 'roster.csv',
      });
    });

    // A blocked reclaim has two shapes: an unresolved stage-draft choice, and
    // an editor still open with unsaved changes in it. Naming the wrong one
    // sends the researcher looking for a question nobody asked.
    it('names the stage-draft choice when that is what the reclaim is waiting on', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      store.dispatch(
        draftTimelineActions.reset({
          stage: { id: 'stage-1', type: 'Information', label: 'A' },
          codebook: {},
        }),
      );
      store.dispatch(setProtocolLockState('reclaim-blocked'));

      const result = await store.dispatch(
        importAssetAsync(new File(['test'], 'roster.csv')),
      );

      expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
      expect(result.payload).toMatchObject({
        message: expect.stringContaining(
          'your unsaved changes to this stage',
        ) as unknown as string,
      });
    });

    it('names the open editor when there is no stage draft to choose about', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      store.dispatch(setProtocolLockState('reclaim-blocked'));

      const result = await store.dispatch(
        importAssetAsync(new File(['test'], 'roster.csv')),
      );

      expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
      expect(result.payload).toMatchObject({
        message: expect.stringContaining(
          'finish or cancel the editor you still have open',
        ) as unknown as string,
      });
    });

    it('returns zero duplicate rows when duplicateCount is 0', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });

      const file = new File(['test'], 'roster.csv', { type: 'text/csv' });
      const result = await store.dispatch(importAssetAsync(file)).unwrap();

      expect(result.duplicateCount).toBe(0);
    });
  });

  describe('actionCreators', () => {
    it.todo('importAssetAsync() dispatches correct actions');
    it.todo(
      'importAssetAsync() dispatches correct actions when util/importAsset fails',
    );
    it.todo('deleteAsset() dispatches correct actions');
  });
});
