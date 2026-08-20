import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { v4 as uuid } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import appReducer, {
  getStorageUnavailable,
  setProtocolLockState,
  setStorageUnavailable,
} from '~/ducks/modules/app';
import stageEditorDraftReducer, {
  draftTimelineActions,
} from '~/ducks/modules/stageEditorDraft';
import { refusedCommitMessage } from '~/utils/protocolLockMessages';

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
      // Registered so a stage-draft transaction can be opened in the tests
      // below. The refusal itself no longer reads this slice — that it once
      // did, and answered "which blocker?" with it, is the bug they pin.
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

    /*
      A blocked reclaim has two shapes: an unresolved stage-draft choice, and a
      nested editor still open. `useProtocolTabLock` checks the OPEN EDITOR
      first, and that is the state in which `NestedDraftReclaimDialog` is the
      dialog on screen and `StageDraftConflictDialog` is explicitly suppressed.
      Refusing on any other question — "is a stage editor open?", say — names a
      way out that is not the one being offered.
    */
    it('sends the researcher to the editor that is holding the reclaim', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      // A stage editor open, with a nested editor open inside it: the exact
      // pair the old discriminator answered backwards.
      store.dispatch(
        draftTimelineActions.reset({
          stage: { id: 'stage-1', type: 'Information', label: 'A' },
          codebook: {},
        }),
      );
      const nestedEditor = renderHook(() => useNestedDraft(true, () => true));
      store.dispatch(setProtocolLockState('reclaim-blocked'));

      const result = await store.dispatch(
        importAssetAsync(new File(['test'], 'roster.csv')),
      );
      nestedEditor.unmount();

      expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
      expect(result.payload).toMatchObject({
        message: refusedCommitMessage(
          'reclaim-blocked',
          'asset-import-nested-editor',
        )!,
      });
    });

    it('sends the researcher to the stage-draft choice when that is the blocker', async () => {
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
        message: refusedCommitMessage(
          'reclaim-blocked',
          'asset-import-stage-draft',
        )!,
      });
    });

    /*
      An import spans two awaits, so owning the protocol when the file was
      dropped says nothing about owning it when the blob is written.
      `useProtocolTabLock` demotes this tab from `onExclusivityChange(false)`,
      which a throttled peer can answer at any point — including while a large
      file is still validating.
    */
    it('refuses the write when this tab is demoted while the file validates', async () => {
      mockedValidateAsset.mockImplementation(async () => {
        store.dispatch(setProtocolLockState('open-elsewhere'));
        return { duplicateCount: 0 };
      });

      const result = await store.dispatch(
        importAssetAsync(
          new File(['test'], 'roster.csv', { type: 'text/csv' }),
        ),
      );

      // Nothing durable, and nothing in the manifest naming something durable.
      expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
      expect(Object.values(store.getState().assetManifest)).toHaveLength(0);
      // The branded sentence, not the generic failure text: a refusal that went
      // through the `catch` would have been rewritten into the latter.
      expect(result.payload).toMatchObject({
        code: 'PROTOCOL_NOT_OWNED_HERE',
        filename: 'roster.csv',
        message: refusedCommitMessage(
          'open-elsewhere',
          'asset-import-stage-draft',
        )!,
      });
    });

    // The same demotion one await later. The blob is already written by then —
    // an unreferenced blob is GC'd by the next durable save — but a manifest
    // entry would be a resource on screen that this tab can never save.
    it('adds nothing to the manifest when this tab is demoted during the blob write', async () => {
      mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
      mockedSaveAssetWithFallback.mockImplementation(async () => {
        store.dispatch(setProtocolLockState('open-elsewhere'));
        return { persisted: true };
      });

      const result = await store.dispatch(
        importAssetAsync(
          new File(['test'], 'roster.csv', { type: 'text/csv' }),
        ),
      );

      expect(mockedSaveAssetWithFallback).toHaveBeenCalled();
      expect(Object.values(store.getState().assetManifest)).toHaveLength(0);
      expect(result.payload).toMatchObject({
        code: 'PROTOCOL_NOT_OWNED_HERE',
        message: refusedCommitMessage(
          'open-elsewhere',
          'asset-import-stage-draft',
        )!,
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
