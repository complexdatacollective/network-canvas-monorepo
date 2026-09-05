/**
 * Where every editor family is wired in, and the only file a family has to
 * change to be wired in.
 *
 * ADDING A FAMILY IS TWO LINES:
 *
 * 1. Import its part and add it to `REGISTRY_PARTS`.
 * 2. Delete the stage types it claims from `AWAITING_STAGE_EDITORS`.
 *
 * Nothing else — `stageEditorRegistry` and every check below are derived from
 * those two lists, and both are checked in both directions at compile time, so
 * a family that adds a part and forgets to remove its types (or removes a type
 * no family covers) fails `typecheck` rather than a review.
 *
 * Both lists are written to be merged rather than to be read: one entry per
 * line, in alphabetical order, each with a trailing comma, so that families
 * landing on separate branches change separate lines. `__tests__/
 * stageEditorRegistry.test.tsx` holds that shape in place.
 */
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
 * Declares a family's part, keeping the exact set of types it claims.
 *
 * THE WAY TO WRITE A PART. An annotation — `export const part:
 * StageEditorRegistryPart = {…}` — widens the value to the whole partial
 * registry, and every key of that is optional, so `keyof` it is every stage
 * type. The coverage machinery below is built on `keyof`: widen one part and
 * the package believes every interface has an editor, `UnregisteredStageType`
 * collapses to `never`, and both compile-time checks pass while saying
 * nothing. Inferring the type from the object literal instead is what keeps
 * "this family claims exactly these three interfaces" a fact the type system
 * still knows.
 *
 * `type-tests/` compiles the failures this prevents.
 */
export function defineStageEditorPart<
  const Part extends StageEditorRegistryPart,
>(part: Part): Part {
  return part;
}

/**
 * Thrown when two families claim the same interface.
 *
 * There is no answer to which of them a researcher should get, and picking one
 * would hide a genuine mistake — two families that both think they own an
 * interface disagree about what it is. Named at composition rather than at
 * render, so it is a start-up failure with both claimants in the message
 * rather than a stage that quietly opens in the wrong editor.
 */
export class DuplicateStageEditorError extends Error {
  readonly stageType: string;

  constructor(stageType: string) {
    super(
      `Two editor families both register the "${stageType}" interface, so there is no way to say which should edit it.`,
    );
    this.stageType = stageType;
    this.name = 'DuplicateStageEditorError';
  }
}

/**
 * Merges family parts into the registry the package dispatches through.
 *
 * Refuses a stage type two parts both claim rather than letting the later one
 * win: see `DuplicateStageEditorError`. `StageEditorPartsAreDisjoint` says the
 * same thing at build time for the parts listed below, which is the check that
 * actually stops a duplicate reaching a review — this one covers the registry
 * a HOST composes, which the package never sees.
 */
export function composeStageEditorRegistry(
  ...parts: readonly StageEditorRegistryPart[]
): StageEditorRegistryPart {
  const claimed = new Set<string>();
  for (const part of parts) {
    for (const [stageType, editor] of Object.entries(part)) {
      // A key present but holding nothing claims nothing — the same reading
      // `missingStageEditors` takes of the composed registry.
      if (editor === undefined) continue;
      if (claimed.has(stageType))
        throw new DuplicateStageEditorError(stageType);
      claimed.add(stageType);
    }
  }

  const composed: StageEditorRegistryPart = {};
  for (const part of parts) Object.assign(composed, part);
  return Object.freeze(composed);
}

/**
 * Every family, listed once.
 *
 * Written as a tuple rather than as a spread of imports so that the exact key
 * set of each part survives into the type system — which is what makes the
 * checks below compile-time facts rather than comments. Each entry must come
 * from `defineStageEditorPart`, for the reason that function's own comment
 * gives.
 */
const REGISTRY_PARTS = [
  // One imported part per line, alphabetically, each with a trailing comma.
] as const satisfies readonly StageEditorRegistryPart[];

export const stageEditorRegistry: StageEditorRegistryPart =
  composeStageEditorRegistry(...REGISTRY_PARTS);

/** The intersection of a tuple of family parts. `keyof` it is the coverage. */
type MergeAll<Parts extends readonly unknown[]> = Parts extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head & MergeAll<Rest>
  : unknown;

/** The stage types a tuple of family parts covers between them. */
export type RegisteredIn<Parts extends readonly StageEditorRegistryPart[]> =
  Extract<keyof MergeAll<Parts>, StageType>;

/** The stage types it leaves to some family that has not landed yet. */
export type UnregisteredIn<Parts extends readonly StageEditorRegistryPart[]> =
  Exclude<StageType, RegisteredIn<Parts>>;

/** `true` only when `Listed` names every type `Parts` leaves uncovered. */
export type AwaitingListIsComplete<
  Parts extends readonly StageEditorRegistryPart[],
  Listed extends readonly StageType[],
> = [Exclude<UnregisteredIn<Parts>, Listed[number]>] extends [never]
  ? true
  : false;

/** `true` only when no two parts in the tuple claim the same stage type. */
export type PartsAreDisjoint<Parts extends readonly StageEditorRegistryPart[]> =
  Parts extends readonly [
    infer Head,
    ...infer Rest extends readonly StageEditorRegistryPart[],
  ]
    ? [Extract<keyof Head, keyof MergeAll<Rest>>] extends [never]
      ? PartsAreDisjoint<Rest>
      : false
    : true;

export type RegisteredStageType = RegisteredIn<typeof REGISTRY_PARTS>;

export type UnregisteredStageType = UnregisteredIn<typeof REGISTRY_PARTS>;

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

export type Assert<T extends true> = T;

/**
 * Compile-time proof that nothing is missing from the list above.
 *
 * A pure type: it has no runtime cost, and it fails the typecheck rather than
 * a test, so a stage type added to the schema cannot reach a review with
 * nothing rendering it and nothing saying so.
 */
export type UnregisteredStageTypesAreListed = Assert<
  AwaitingListIsComplete<typeof REGISTRY_PARTS, typeof AWAITING_STAGE_EDITORS>
>;

/**
 * Compile-time proof that no two families claim the same interface.
 *
 * The build-time half of `DuplicateStageEditorError`, and the half that
 * matters: a duplicate caught here never reaches a researcher, while the throw
 * only fires once something composes the registry.
 */
export type StageEditorPartsAreDisjoint = Assert<
  PartsAreDisjoint<typeof REGISTRY_PARTS>
>;
