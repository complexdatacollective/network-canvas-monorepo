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
 * What a part IS, and how to declare one, lives in `stageEditorParts.ts`:
 * a family imports `defineStageEditorPart` from there rather than from here,
 * because this module imports the family and the two cannot import each other.
 *
 * Both lists are written to be merged rather than to be read: one entry per
 * line, in alphabetical order, each with a trailing comma, so that families
 * landing on separate branches change separate lines. `__tests__/
 * stageEditorRegistry.test.tsx` holds that shape in place.
 */
import { networkStageEditors } from './editors/networkStageEditors.ts';
import { pedigreeAndAnonymisationStageEditors } from './editors/pedigreeAndAnonymisationStageEditors.ts';
import {
  type Assert,
  type AwaitingListIsComplete,
  composeStageEditorRegistry,
  type PartsAreDisjoint,
  type RegisteredIn,
  type StageEditorRegistryPart,
  type UnregisteredIn,
} from './stageEditorParts.ts';

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
  networkStageEditors,
  pedigreeAndAnonymisationStageEditors,
] as const satisfies readonly StageEditorRegistryPart[];

export const stageEditorRegistry: StageEditorRegistryPart =
  composeStageEditorRegistry(...REGISTRY_PARTS);

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
  'CategoricalBin',
  'DyadCensus',
  'EgoForm',
  'Information',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'OneToManyDyadCensus',
  'OrdinalBin',
  'TieStrengthCensus',
] as const satisfies readonly UnregisteredStageType[];

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
