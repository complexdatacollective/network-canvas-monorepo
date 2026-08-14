import { createSelector } from '@reduxjs/toolkit';
import { find, findIndex, reduce } from 'es-toolkit/compat';

import type { RootState } from '~/ducks/modules/root';

import { getStageEditorDraftCodebook } from './stageEditorDraft';

/**
 * The protocol exactly as it will be validated, persisted and exported.
 *
 * Use this ONLY where the canonical, committed protocol is the subject:
 * validation, persistence, and download. Everything the researcher looks at or
 * edits must go through `getProtocol`, or the stage editor would show a
 * codebook that disagrees with the one its field editors are writing.
 */
export const getCanonicalProtocol = (state: RootState) => {
  // The activeProtocol in RootState is wrapped by the timeline middleware
  // We need to extract the present value. Optional-chained because unit-test
  // stores register only the slices under test, and a selector reached from a
  // mounted component there must resolve to "no protocol" rather than throw.
  return state.activeProtocol?.present ?? null;
};

/**
 * The protocol as the editor sees it: canonical, with the stage editor's draft
 * codebook swapped in while a codebook transaction is open.
 *
 * Nested field and variable editors write a draft codebook so that cancelling
 * a field or discarding a stage cannot mutate the shared codebook (#1382).
 * Overlaying here — at the single root every other protocol and codebook
 * selector derives from — is what keeps the whole UI (previews, issues,
 * indexes, `isUsed`, the field editors themselves) reading one consistent
 * codebook without each of them knowing a transaction exists.
 *
 * Memoised because it synthesises an object: an unmemoised version would
 * return a new reference on every call and defeat both `createSelector` and
 * `useSelector` reference equality.
 */
export const getProtocol = createSelector(
  [getCanonicalProtocol, getStageEditorDraftCodebook],
  (protocol, draftCodebook) => {
    if (!protocol || !draftCodebook || draftCodebook === protocol.codebook) {
      return protocol;
    }

    return { ...protocol, codebook: draftCodebook };
  },
);

// Protocol metadata selectors
export const getProtocolName = (state: RootState): string | undefined => {
  return getProtocol(state)?.name;
};

export const getAssetManifest = (state: RootState) => {
  const protocol = getProtocol(state);
  return protocol?.assetManifest || {};
};

export const getCodebook = (state: RootState) => {
  const protocol = getProtocol(state);
  return protocol?.codebook || null;
};

export const getStageList = createSelector([getProtocol], (protocol) => {
  const stages = protocol ? protocol.stages : [];

  return stages.map((stage) => ({
    id: stage.id,
    type: stage.type,
    label: stage.label,
    hasFilter: 'filter' in stage ? !!stage.filter : false,
    hasSkipLogic: !!stage.skipLogic,
    skipLogic: stage.skipLogic
      ? { destination: stage.skipLogic.destination }
      : undefined,
  }));
});

export const getStage = (state: RootState, id: string) => {
  const protocol = getProtocol(state);
  if (!protocol) return null;

  const stage = find(protocol.stages, ['id', id]);
  return stage;
};

export const getStageIndex = (state: RootState, id: string) => {
  const protocol = getProtocol(state);
  if (!protocol) return -1;

  const stageIndex = findIndex(protocol.stages, ['id', id]);
  return stageIndex;
};

const networkTypes = new Set(['network', 'async:network']);

// TODO: Does this method make sense here?
export const getNetworkAssets = createSelector(
  getAssetManifest,
  (assetManifest) =>
    reduce(
      assetManifest,
      (memo, asset, name) => {
        if (!networkTypes.has(asset.type)) {
          return memo;
        }

        return { ...memo, [name]: asset };
      },
      {},
    ),
);

export const getExperiments = (state: RootState) => {
  const protocol = getProtocol(state);
  const experiments = protocol ? protocol.experiments : undefined;

  return experiments;
};

// Timeline selector
export const getTimelineLocus = (state: RootState): string | null => {
  // Timeline entries are now Locus objects ({ id, path }); return the id.
  const timeline = state.activeProtocol?.timeline;
  if (timeline && timeline.length > 0) {
    const entry = timeline[timeline.length - 1];
    return entry?.id ?? null;
  }

  return null;
};

// Path recorded on the entry that the next undo would revert (the locus of the
// current present) and the next redo would reapply (the head of futureTimeline).
export const getUndoTargetPath = (state: RootState): string => {
  const timeline = state.activeProtocol?.timeline;
  if (!timeline || timeline.length === 0) return '';
  return timeline[timeline.length - 1]?.path ?? '';
};

export const getRedoTargetPath = (state: RootState): string => {
  const futureTimeline = state.activeProtocol?.futureTimeline;
  if (!futureTimeline || futureTimeline.length === 0) return '';
  return futureTimeline[0]?.path ?? '';
};

// Undo/redo selectors
export const getCanUndo = (state: RootState): boolean => {
  const past = state.activeProtocol?.past || [];
  if (past.length === 0) return false;

  // Don't allow undo if it would take us back to a null state
  const wouldBePresent = past[past.length - 1];
  return wouldBePresent !== null && wouldBePresent !== undefined;
};

export const getCanRedo = (state: RootState): boolean => {
  const future = state.activeProtocol?.future || [];
  return future.length > 0;
};
