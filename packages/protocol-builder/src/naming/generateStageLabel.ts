import type { StageType } from '@codaco/protocol-validation';
import { normalizeForComparison } from '@codaco/shared-consts';

export const MAX_LABEL_LENGTH = 50;

export type Qualifier = { full: string; summary: string };

/**
 * Everything in this module is English on purpose, and stays English.
 *
 * What it produces is not copy: it is a SEEDED VALUE. `useAutoStageName` writes
 * the result straight into the stage form's `label` field, which is saved into
 * the protocol document as `stage.label` — a researcher-authored name that then
 * travels with the protocol into exports, printed codebooks, and every other
 * host that opens it. This is exactly the case `INTERFACE_NAMES` in
 * `interfaces/interfaceNames.ts` exists for: the same names are localized for
 * DISPLAY through `interfaceDisplayName(type, intl)` and left English where
 * they seed a stored label.
 *
 * Three things break if the proposal is localized:
 *
 * - `dedupeStageLabel` decides uniqueness by comparing the proposal against the
 *   labels already stored in the protocol. Localize the proposal and a stage
 *   named in one language stops colliding with the same stage named in another,
 *   so reopening a protocol elsewhere proposes a fresh name for a configuration
 *   that already has one, and ` #2` suffixes accumulate across languages.
 * - `MAX_LABEL_LENGTH` caps the STORED value at 50 characters, and
 *   `truncateToWord` decides where it is cut. A longer translation is cut in a
 *   different place, so the same stage acquires a different stored name
 *   depending on who created it.
 * - The label is the researcher's to edit afterwards. A value that changed
 *   language under a collaborator would read as their protocol being rewritten.
 *
 * Displayed copy derived from a stage — the badge naming the interface, the
 * outline, a host's timeline — is localized where it is rendered, and none of
 * it comes from here.
 */
export const STAGE_TYPE_NAMES: Record<StageType, string> = {
  NameGenerator: 'Form Name Generator',
  NameGeneratorQuickAdd: 'Quick Add Name Generator',
  NameGeneratorRoster: 'Roster Name Generator',
  FamilyPedigree: 'Family Pedigree',
  NarrativePedigree: 'Narrative Pedigree',
  DyadCensus: 'Dyad Census',
  OneToManyDyadCensus: 'One to Many Dyad Census',
  TieStrengthCensus: 'Tie-Strength Census',
  Sociogram: 'Sociogram',
  NetworkComposer: 'Network Composer',
  Narrative: 'Narrative',
  OrdinalBin: 'Ordinal Bin',
  CategoricalBin: 'Categorical Bin',
  AlterForm: 'Per Alter Form',
  Geospatial: 'Geospatial',
  AlterEdgeForm: 'Per Alter Edge Form',
  EgoForm: 'Ego Form',
  Information: 'Information',
  Anonymisation: 'Anonymisation',
};

export function composeStageName(parts: {
  subjectName?: string | null;
  typeName: string;
  qualifier?: string | null;
}): string {
  const stageName = [parts.subjectName, parts.typeName, parts.qualifier]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return stageName.charAt(0).toUpperCase() + stageName.slice(1);
}

/**
 * `normalizeForComparison`, never a bare `toLowerCase()`: a stage label is a
 * researcher-authored NAME, and the question "is this the same name as that
 * one?" is answered identically everywhere in the ecosystem — case-folded AND
 * Unicode-canonical. Folding case alone let a decomposed "Café" and a
 * precomposed one sit side by side as two different stages here while the
 * codebook, the schema and the migration repair all counted them as one.
 */
export function dedupeStageLabel(
  base: string,
  existingLabels: string[],
): string {
  const taken = new Set(
    existingLabels.map((label) => normalizeForComparison(label.trim())),
  );
  if (!taken.has(normalizeForComparison(base.trim()))) {
    return base;
  }
  let suffix = 2;
  while (taken.has(normalizeForComparison(`${base} #${suffix}`))) {
    suffix += 1;
  }
  return `${base} #${suffix}`;
}

function truncateToWord(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const slice = value.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
  return trimmed || slice.trimEnd();
}

// Truncate the base *before* de-duplicating so the ` #n` suffix is never chopped
// (a post-truncation slice could cut into a wide suffix like ` #10`, reviving a
// collision). Shrink the budget by however much the deduped candidate overflows
// until it fits within the cap.
function fitTruncatedUniqueLabel(
  base: string,
  existingLabels: string[],
): string {
  let max = MAX_LABEL_LENGTH;
  while (max > 0) {
    const candidate = dedupeStageLabel(
      truncateToWord(base, max),
      existingLabels,
    );
    if (candidate.length <= MAX_LABEL_LENGTH) {
      return candidate;
    }
    max -= candidate.length - MAX_LABEL_LENGTH;
  }
  return dedupeStageLabel(base.slice(0, 1), existingLabels).slice(
    0,
    MAX_LABEL_LENGTH,
  );
}

export function generateStageLabel(input: {
  typeName: string;
  subjectName?: string | null;
  qualifier?: Qualifier | null;
  existingLabels: string[];
}): string {
  const { typeName, subjectName, qualifier, existingLabels } = input;

  // Most-informative first; each candidate sheds detail so a long name can fit 50 chars.
  const candidates: string[] = [];
  if (qualifier) {
    candidates.push(
      composeStageName({ subjectName, typeName, qualifier: qualifier.full }),
    );
    if (qualifier.summary !== qualifier.full) {
      candidates.push(
        composeStageName({
          subjectName,
          typeName,
          qualifier: qualifier.summary,
        }),
      );
    }
    candidates.push(
      composeStageName({
        subjectName: null,
        typeName,
        qualifier: qualifier.summary,
      }),
    );
  } else {
    candidates.push(
      composeStageName({ subjectName, typeName, qualifier: null }),
    );
    candidates.push(
      composeStageName({ subjectName: null, typeName, qualifier: null }),
    );
  }

  for (const base of candidates) {
    const deduped = dedupeStageLabel(base, existingLabels);
    if (deduped.length <= MAX_LABEL_LENGTH) {
      return deduped;
    }
  }

  const fallbackBase = candidates[candidates.length - 1] ?? typeName;
  return fitTruncatedUniqueLabel(fallbackBase, existingLabels);
}
