import { createSelector } from '@reduxjs/toolkit';

import { findVariableRoleConflicts } from '@codaco/protocol-validation';
import {
  getMapboxTokenId,
  RETIRED_MAPBOX_TOKEN_IDS,
  TESTING_MAPBOX_TOKEN,
} from '~/templates/testingMapboxToken';

import { getAllVariablesByUUID } from './codebook';
import { getIsUsed } from './codebook/isUsed';
import { getAssetIndex, utils } from './indexes';
import { getAssetManifest, getCodebook, getProtocol } from './protocol';

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

/**
 * Whether the protocol carries Network Canvas's shared Mapbox testing token —
 * embedded in templates that use the Geospatial interface so the map works out
 * of the box. Detected by value (asset ids are not stable across protocols) so
 * it also fires for protocols a researcher started from such a template. Drives
 * the timeline reminder to swap in their own token before fielding the study.
 */
export const getUsesTestingMapboxToken = createSelector(
  [getAssetManifest],
  (assetManifest): boolean =>
    Object.values(assetManifest).some(
      (asset) =>
        asset.type === 'apikey' && asset.value === TESTING_MAPBOX_TOKEN,
    ),
);

const retiredMapboxTokenIds = new Set<string>(RETIRED_MAPBOX_TOKEN_IDS);

/**
 * Whether the protocol still carries a Network Canvas testing token that has
 * since been revoked. It was the testing token when the protocol was created,
 * so it arrived the same way the current one does — but Mapbox now answers it
 * with 401 and every Geospatial map in the protocol is broken until the
 * researcher replaces it. Matched by the token's id (`RETIRED_MAPBOX_TOKEN_IDS`
 * via `getMapboxTokenId`) so the revoked value itself is stored nowhere.
 * Deliberately separate from `getUsesTestingMapboxToken` (an exact match on
 * the current token) so the timeline can show an error for this case and only
 * a reminder for that one.
 */
export const getUsesRetiredMapboxToken = createSelector(
  [getAssetManifest],
  (assetManifest): boolean =>
    Object.values(assetManifest).some((asset) => {
      if (asset.type !== 'apikey' || asset.value === undefined) {
        return false;
      }
      const id = getMapboxTokenId(asset.value);
      return id !== null && retiredMapboxTokenIds.has(id);
    }),
);

/**
 * Variables written both by a form (validated) and by a bin/highlight/census/
 * etc. (unvalidated) elsewhere in the same protocol. Values written outside a
 * form bypass the variable's validation rules, so a form collecting the same
 * variable can receive values it would otherwise reject.
 */
export const getVariableRoleConflicts = createSelector(
  [getProtocol],
  (protocol) => (protocol ? findVariableRoleConflicts(protocol) : []),
);

export const getHasVariableRoleConflicts = createSelector(
  [getVariableRoleConflicts],
  (conflicts) => conflicts.length > 0,
);
