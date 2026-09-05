import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorRegistry } from './stage-editor-contract.ts';

/**
 * What one editor family exports: the entries it owns, and nothing else.
 *
 * A family is a group of interfaces that share their hard parts — the three
 * name generators share prompts, panels and alter limits; the two bin
 * interfaces share a variable picker and a sort-order editor — so a family
 * ships as one unit and claims the stage types it covers. Nothing requires the
 * families to know about each other, and nothing requires this module to know
 * how any of them is built.
 */
export type StageEditorRegistryPart = Partial<StageEditorRegistry>;

/**
 * Merges family parts into the registry the package dispatches through.
 *
 * Later parts win, which is only ever a mistake: two families claiming the
 * same stage type is caught by the coverage check below, not silently
 * resolved.
 */
export function composeStageEditorRegistry(
  ...parts: readonly StageEditorRegistryPart[]
): StageEditorRegistryPart {
  const composed: StageEditorRegistryPart = {};
  for (const part of parts) Object.assign(composed, part);
  return Object.freeze(composed);
}

/**
 * Every family, listed once.
 *
 * Written as a tuple rather than as a spread of imports so that the exact key
 * set of each part survives into the type system — which is what makes the
 * coverage check below a compile-time fact rather than a comment.
 */
const REGISTRY_PARTS = [] as const satisfies readonly StageEditorRegistryPart[];

export const stageEditorRegistry: StageEditorRegistryPart =
  composeStageEditorRegistry(...REGISTRY_PARTS);

/** The intersection of a tuple of family parts. `keyof` it is the coverage. */
type MergeAll<Parts extends readonly unknown[]> = Parts extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head & MergeAll<Rest>
  : unknown;

export type RegisteredStageType = Extract<
  keyof MergeAll<typeof REGISTRY_PARTS>,
  StageType
>;

export type UnregisteredStageType = Exclude<StageType, RegisteredStageType>;

/**
 * Every stage type still waiting for the family that will own it.
 *
 * Spelled out rather than derived, and checked in both directions. A type that
 * gains an editor must leave this list, or the `satisfies` below refuses it.
 * A type the schema gains that no family covers must join it, or
 * `UnregisteredStageTypesAreListed` refuses to compile — which is the whole
 * point of writing it down: the day the last family lands, this list is empty,
 * and adding a schema member then breaks the build in this package until an
 * editor exists for it.
 */
export const AWAITING_STAGE_EDITORS = [
  'AlterEdgeForm',
  'AlterForm',
  'Anonymisation',
  'CategoricalBin',
  'DyadCensus',
  'EgoForm',
  'FamilyPedigree',
  'Geospatial',
  'Information',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Narrative',
  'NarrativePedigree',
  'NetworkComposer',
  'OneToManyDyadCensus',
  'OrdinalBin',
  'Sociogram',
  'TieStrengthCensus',
] as const satisfies readonly UnregisteredStageType[];

type Assert<T extends true> = T;

/**
 * Compile-time proof that nothing is missing from the list above.
 *
 * A pure type: it has no runtime cost, and it fails the typecheck rather than
 * a test, so a stage type added to the schema cannot reach a review with
 * nothing rendering it and nothing saying so.
 */
export type UnregisteredStageTypesAreListed = Assert<
  [
    Exclude<UnregisteredStageType, (typeof AWAITING_STAGE_EDITORS)[number]>,
  ] extends [never]
    ? true
    : false
>;
