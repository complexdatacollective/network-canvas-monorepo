import { createSelector } from '@reduxjs/toolkit';
import { find, findIndex, reduce } from 'es-toolkit/compat';

import type { Asset } from '@codaco/protocol-validation';
import { canRedo, canUndo } from '~/ducks/middleware/timeline';
import type { RootState } from '~/ducks/modules/root';
import { deriveAssetDisplayNames } from '~/utils/assetNames';

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

/**
 * A stable identity for "this protocol has no resources", so the selectors
 * derived from the manifest don't recompute — and hand their consumers a fresh
 * object — on every dispatch while no protocol is loaded.
 */
const EMPTY_ASSET_MANIFEST: Record<string, Asset> = {};

/**
 * The asset manifest exactly as it is stored, validated, exported, and read by
 * Interviewer and Fresco.
 *
 * Use this wherever the researcher's own filename is the subject: the name
 * written into a stage label, the path an asset resolves through. Everything
 * that merely SHOWS a resource wants `getDisplayAssetManifest`, whose names are
 * unique within the protocol.
 */
export const getAssetManifest = (state: RootState) => {
  const protocol = getProtocol(state);
  return protocol?.assetManifest ?? EMPTY_ASSET_MANIFEST;
};

/**
 * The asset manifest with every `name` replaced by one that is unique within
 * the protocol (see `~/utils/assetNames`).
 *
 * NEVER PERSIST THIS. It is manifest-shaped so a display surface can swap it in
 * for `getAssetManifest` without restructuring, but its names are derived for
 * reading, not for saving: writing them back would put a name the researcher
 * never chose into their protocol file.
 *
 * Entries whose stored name is already unique pass through by reference, so a
 * manifest with no collisions — every protocol we ship — is untouched and every
 * consumer keeps the memoisation it had.
 */
export const getDisplayAssetManifest = createSelector(
  [getAssetManifest],
  (assetManifest) => {
    const displayNames = deriveAssetDisplayNames(assetManifest);

    return Object.fromEntries(
      Object.entries(assetManifest).map(([id, asset]) => [
        id,
        displayNames[id] === asset.name
          ? asset
          : { ...asset, name: displayNames[id] ?? asset.name },
      ]),
    );
  },
);

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
  // The reducer's own refusal, asked rather than restated, so the control can
  // never advertise — and `undoWithNavigation` never announce — an operation
  // the reducer would silently drop.
  if (!canUndo(state.activeProtocol)) return false;

  // Strictly stricter than the reducer, deliberately: it would happily make a
  // null past entry the present, and that is not a protocol the editor can
  // show. This term is `getCanUndo`'s alone — it is layered on top of the
  // shared rule, never a restatement of it.
  const past = state.activeProtocol?.past || [];
  const wouldBePresent = past[past.length - 1];
  return wouldBePresent !== null && wouldBePresent !== undefined;
};

export const getCanRedo = (state: RootState): boolean =>
  canRedo(state.activeProtocol);
