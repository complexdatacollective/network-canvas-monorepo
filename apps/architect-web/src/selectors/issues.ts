import { createSelector } from '@reduxjs/toolkit';

import { getAllVariablesByUUID } from './codebook';
import { getIsUsed } from './codebook/isUsed';
import { getAssetIndex, utils } from './indexes';
import { getAssetManifest, getCodebook } from './protocol';

/**
 * Selectors that surface protocol "issues" — things that are valid but
 * probably unintended — so the UI can warn the user and point them at a fix.
 *
 * Currently covers:
 *  - Unused resources (assets in the manifest that are never referenced)
 *  - Unused variables (codebook variables that are never referenced)
 */

export type UnusedSummary = {
  /** Number of unused items. */
  count: number;
  /** Human-readable names of the unused items, for use in alerts. */
  names: string[];
};

const EMPTY_SUMMARY: UnusedSummary = { count: 0, names: [] };

/**
 * Resources (assets) that exist in the manifest but are not referenced
 * anywhere in the protocol. Mirrors the per-asset "Unused" badge shown in the
 * Resource Library, but aggregated across the whole protocol.
 */
export const getUnusedAssets = createSelector(
  [getAssetManifest, getAssetIndex],
  (assetManifest, assetIndex): UnusedSummary => {
    const used = utils.buildSearch([assetIndex]);
    const names = Object.entries(assetManifest)
      .filter(([id]) => !used.has(id))
      .map(([id, asset]) => asset.name ?? id);

    return { count: names.length, names };
  },
);

export const getHasUnusedAssets = createSelector(
  [getUnusedAssets],
  (summary) => summary.count > 0,
);

/**
 * Codebook variables that are defined but never referenced anywhere in the
 * protocol. Uses the same usage detection as the codebook's per-variable
 * "not in use" tags, so the count stays consistent with what the user sees
 * in the Codebook page.
 */
export const getUnusedVariables = createSelector(
  [getCodebook, getIsUsed],
  (codebook, isUsed): UnusedSummary => {
    if (!codebook) {
      return EMPTY_SUMMARY;
    }

    const variables = getAllVariablesByUUID(codebook);
    const names = Object.entries(variables)
      .filter(([id]) => !isUsed[id])
      .map(([id, variable]) => variable.name ?? id);

    return { count: names.length, names };
  },
);

export const getHasUnusedVariables = createSelector(
  [getUnusedVariables],
  (summary) => summary.count > 0,
);
