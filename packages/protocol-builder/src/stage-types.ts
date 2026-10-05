import type { StageType } from '@codaco/protocol-validation';

// This object is intentionally checked against StageType rather than derived
// from a runtime schema walk: adding a schema member must fail compilation in
// this package until the editor contract has named it.
const STAGE_TYPE_COVERAGE = {
  AlterEdgeForm: true,
  AlterForm: true,
  Anonymisation: true,
  CategoricalBin: true,
  DyadCensus: true,
  EgoForm: true,
  FamilyPedigree: true,
  Geospatial: true,
  Information: true,
  NameGenerator: true,
  NameGeneratorQuickAdd: true,
  NameGeneratorRoster: true,
  Narrative: true,
  NarrativePedigree: true,
  NetworkComposer: true,
  OneToManyDyadCensus: true,
  OrdinalBin: true,
  Sociogram: true,
  TieStrengthCensus: true,
} as const satisfies Record<StageType, true>;

export const STAGE_TYPES = Object.freeze(
  // The key set is compile-checked above; Object.keys discards that fact.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  Object.keys(STAGE_TYPE_COVERAGE) as StageType[],
);

const STAGE_TYPE_SET: ReadonlySet<string> = new Set(STAGE_TYPES);

export function isStageType(value: unknown): value is StageType {
  return typeof value === 'string' && STAGE_TYPE_SET.has(value);
}
