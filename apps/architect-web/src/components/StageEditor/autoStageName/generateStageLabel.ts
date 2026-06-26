import type { StageType } from '@codaco/protocol-validation';

export const MAX_LABEL_LENGTH = 50;

export type Qualifier = { full: string; summary: string };

export const STAGE_TYPE_NAMES: Record<StageType, string> = {
  NameGenerator: 'Form Name Generator',
  NameGeneratorQuickAdd: 'Quick Add Name Generator',
  NameGeneratorRoster: 'Roster Name Generator',
  FamilyPedigree: 'Family Pedigree',
  DyadCensus: 'Dyad Census',
  OneToManyDyadCensus: 'One to Many Dyad Census',
  TieStrengthCensus: 'Tie-Strength Census',
  Sociogram: 'Sociogram',
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
  return [parts.subjectName, parts.typeName, parts.qualifier]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');
}

export function dedupeStageLabel(
  base: string,
  existingLabels: string[],
): string {
  const taken = new Set(
    existingLabels.map((label) => label.trim().toLowerCase()),
  );
  if (!taken.has(base.trim().toLowerCase())) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base} #${suffix}`.toLowerCase())) {
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
  const truncated = truncateToWord(fallbackBase, MAX_LABEL_LENGTH - 4);
  return dedupeStageLabel(truncated, existingLabels).slice(0, MAX_LABEL_LENGTH);
}
