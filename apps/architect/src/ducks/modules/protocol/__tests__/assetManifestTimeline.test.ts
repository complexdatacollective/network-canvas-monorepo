import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app from '~/ducks/modules/app';
import {
  deleteAsset,
  importAssetAsync,
} from '~/ducks/modules/protocol/assetManifest';
import { timelineOptions } from '~/ducks/modules/root';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

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

/**
 * The protocol timeline as the app actually builds it — `activeProtocol`
 * wrapped by `createTimeline` with the app's own `timelineOptions`. A store
 * that registers `assetManifest` on its own instead measures a timeline the
 * researcher never has.
 */
const makeStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      activeProtocol: createTimeline(activeProtocol, timelineOptions),
      stageEditorDraft,
    }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

const protocol = (
  assetManifest: CurrentProtocol['assetManifest'] = {},
): CurrentProtocol =>
  ({
    name: 'Study',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest,
  }) as CurrentProtocol;

const history = (store: ReturnType<typeof makeStore>) => {
  const { past, future, timeline, futureTimeline } = store.getState()
    .activeProtocol as {
    past: unknown[];
    future: unknown[];
    timeline: unknown[];
    futureTimeline: unknown[];
  };
  return {
    past: past.length,
    future: future.length,
    timeline: timeline.length,
    futureTimeline: futureTimeline.length,
  };
};

const manifestOf = (store: ReturnType<typeof makeStore>) =>
  (store.getState().activeProtocol.present as CurrentProtocol | null)
    ?.assetManifest;

describe('a refused resource import and the protocol timeline', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setActiveProtocol(protocol()));
  });

  it('records nothing when the import is refused', async () => {
    mockedValidateAsset.mockRejectedValue(new Error('NETWORK_EMPTY'));
    const before = history(store);
    const manifestBefore = manifestOf(store);

    const result = await store.dispatch(
      importAssetAsync(new File(['{"a":1}'], 'rubbish.json')),
    );

    expect(result.type).toBe('assetManifest/importAssetAsync/rejected');
    expect(history(store)).toEqual(before);
    expect(manifestOf(store)).toBe(manifestBefore);
  });

  it('leaves a pending redo alone when the import is refused', async () => {
    // A refusal used to clear `future` before pushing its own past entry, so
    // it destroyed redoable work as well as inventing an undo step.
    mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });
    await store.dispatch(importAssetAsync(new File(['a,b'], 'people.csv')));
    expect(history(store).past).toBe(1);

    store.dispatch({ type: 'timeline/undo' });
    expect(history(store)).toMatchObject({ past: 0, future: 1 });

    mockedValidateAsset.mockRejectedValue(new Error('NETWORK_EMPTY'));
    await store.dispatch(
      importAssetAsync(new File(['{"a":1}'], 'rubbish.json')),
    );

    expect(history(store).future).toBe(1);
    expect(history(store).futureTimeline).toBe(1);
  });

  it('records nothing when a delete names a resource that is not there', () => {
    // `omit` rebuilds the manifest even for an absent key, and a new object is
    // a change as far as the timeline is concerned.
    const before = history(store);

    store.dispatch(deleteAsset('never-existed'));

    expect(history(store)).toEqual(before);
  });

  it('still records a delete that removes something', () => {
    // The guard above must not swallow the real operation.
    store.dispatch(
      setActiveProtocol(
        protocol({
          'asset-1': {
            id: 'asset-1',
            type: 'network',
            name: 'people.csv',
            source: 'people.csv',
          },
        }),
      ),
    );
    const before = history(store);

    store.dispatch(deleteAsset('asset-1'));

    expect(history(store).past).toBe(before.past + 1);
    expect(manifestOf(store)).toEqual({});
  });
});
