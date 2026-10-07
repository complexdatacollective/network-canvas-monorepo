import { createSelector } from '@reduxjs/toolkit';

import {
  analyzeProtocolLocalization,
  collectLocalizedStrings,
  type CurrentProtocol,
  findVariableRoleConflicts,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringFormat,
  type ProtocolLocalizationWarning,
} from '@codaco/protocol-validation';
import {
  getMapboxTokenId,
  RETIRED_MAPBOX_TOKEN_IDS,
  TESTING_MAPBOX_TOKEN,
} from '~/templates/testingMapboxToken';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

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
 *  - Missing translations and text whose language is not yet identified
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

export type LocaleCoverage = {
  locale: LocaleTag;
  isDefault: boolean;
  translated: number;
  missing: number;
};

export type LocalizationCoverage = {
  /**
   * Participant-facing strings with at least one declared translation. A
   * string with none is a validation error, not a coverage gap.
   */
  total: number;
  /**
   * One per declared language, in declaration order, which means nothing:
   * lists sort them by the names their reader sees.
   */
  locales: readonly LocaleCoverage[];
  warnings: readonly ProtocolLocalizationWarning[];
};

const EMPTY_COVERAGE: LocalizationCoverage = {
  total: 0,
  locales: [],
  warnings: [],
};

/** Every participant-facing string, in protocol order, walked once per edit. */
const getLocalizedStrings = createSelector([getProtocol], (protocol) =>
  protocol ? collectLocalizedStrings(protocol) : [],
);

export const getLocalizationCoverage = createSelector(
  [getProtocol, getLocalizedStrings],
  (protocol, strings): LocalizationCoverage => {
    if (!protocol) return EMPTY_COVERAGE;
    const { locales, defaultLocale } = protocol.localization;
    const total = strings.filter((hit) =>
      locales.some((locale) => Object.hasOwn(hit.value, locale)),
    ).length;
    const warnings = analyzeProtocolLocalization(protocol);
    const missingByLocale = new Map<LocaleTag, number>();
    for (const warning of warnings) {
      missingByLocale.set(
        warning.locale,
        (missingByLocale.get(warning.locale) ?? 0) + 1,
      );
    }
    return {
      total,
      locales: locales.map((locale) => {
        const missing = missingByLocale.get(locale) ?? 0;
        return {
          locale,
          isDefault: locale === defaultLocale,
          translated: total - missing,
          missing,
        };
      }),
      warnings,
    };
  },
);

export const getHasMissingTranslations = createSelector(
  [getLocalizationCoverage],
  (coverage) => coverage.warnings.length > 0,
);

/**
 * Whether the protocol still declares the language migrated text is marked
 * with, which the author has to identify before translating.
 */
export const getHasUnspecifiedLanguage = createSelector(
  [getProtocol],
  (protocol) =>
    protocol?.localization.locales.includes(UNSPECIFIED_LOCALE) ?? false,
);

/** Where a localized string is edited. */
export type TranslationPlace =
  | { kind: 'stage'; stageId: string }
  | { kind: 'codebook'; entity: 'node' | 'edge'; entityType: string }
  | { kind: 'ego' }
  | { kind: 'protocol' };

const locateTranslation = (
  protocol: CurrentProtocol,
  path: readonly (string | number)[],
): { key: string; place: TranslationPlace; field: (string | number)[] } => {
  const [root, first, second] = path;
  if (root === 'stages' && typeof first === 'number') {
    const stageId = protocol.stages[first]?.id;
    if (stageId !== undefined) {
      return {
        key: `stage:${stageId}`,
        place: { kind: 'stage', stageId },
        field: path.slice(2),
      };
    }
  }
  if (root === 'codebook' && first === 'ego') {
    return { key: 'ego', place: { kind: 'ego' }, field: path.slice(2) };
  }
  if (
    root === 'codebook' &&
    (first === 'node' || first === 'edge') &&
    typeof second === 'string'
  ) {
    return {
      key: `${first}:${second}`,
      place: { kind: 'codebook', entity: first, entityType: second },
      field: path.slice(3),
    };
  }
  return { key: 'protocol', place: { kind: 'protocol' }, field: [...path] };
};

/** One participant-facing string, as the translation table lists it. */
export type TranslationRow = {
  /** The string's path in the protocol, which `setProtocolLocalizedString` takes. */
  path: readonly (string | number)[];
  /** The string's path below its place, e.g. `['prompts', 0, 'text']`. */
  field: readonly (string | number)[];
  /** Whether participants see the string rendered as markdown. */
  format: LocalizedStringFormat;
  /** Every translation the string has. */
  value: LocalizedString;
};

export type TranslationGroup = {
  key: string;
  place: TranslationPlace;
  rows: readonly TranslationRow[];
};

const PLACE_ORDER: Record<TranslationPlace['kind'], number> = {
  stage: 0,
  codebook: 1,
  ego: 2,
  protocol: 3,
};

/**
 * Every participant-facing string grouped by the stage or codebook entry that
 * holds it: the stages in protocol order, then the codebook, then the
 * protocol's own texts.
 */
export const getTranslationGroups = createSelector(
  [getProtocol, getLocalizedStrings],
  (protocol, strings): readonly TranslationGroup[] => {
    if (!protocol) return [];
    const groups = new Map<
      string,
      { place: TranslationPlace; rows: TranslationRow[] }
    >();
    for (const hit of strings) {
      const { key, place, field } = locateTranslation(protocol, hit.path);
      const group = groups.get(key) ?? { place, rows: [] };
      groups.set(key, group);
      group.rows.push({
        path: hit.path,
        field,
        format: hit.format,
        value: hit.value,
      });
    }
    return [...groups]
      .map(([key, group]) => ({ key, place: group.place, rows: group.rows }))
      .toSorted(
        (a, b) => PLACE_ORDER[a.place.kind] - PLACE_ORDER[b.place.kind],
      );
  },
);
