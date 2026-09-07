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
 *
 * A FAMILY DECLARES ITS PART IN `stage-editor-contract.ts`, never here. This
 * module imports every family's part, so a part module that imported anything
 * from this one would close a cycle: whichever of the two a program reaches
 * first, the other is half-evaluated, and `REGISTRY_PARTS` reads a binding
 * that does not hold its part yet. The contract is a leaf — it imports the
 * controller and the stage types and nothing else — which is what makes it
 * safe for a part to import, and it is where the rest of what a family writes
 * against already lives. `defineStageEditorPart` is deliberately NOT
 * re-exported from here: a family that reached it through this module would
 * close the cycle again, and only sometimes.
 */
import type { StageType } from '@codaco/protocol-validation';

import { censusAndBinStageEditors } from './editors/censusAndBinStageEditors.ts';
import { formStageEditors } from './editors/formStageEditors.ts';
import { nameGeneratorStageEditors } from './editors/nameGeneratorStageEditors.ts';
import { networkStageEditors } from './editors/networkStageEditors.ts';
import { pedigreeAndAnonymisationStageEditors } from './editors/pedigreeAndAnonymisationStageEditors.ts';
import type {
  StageEditorRegistry,
  StageEditorRegistryPart,
} from './stage-editor-contract.ts';

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

/** The intersection of a tuple of family parts. `keyof` it is the coverage. */
type MergeAll<Parts extends readonly unknown[]> = Parts extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head & MergeAll<Rest>
  : unknown;

/**
 * Merges family parts into the registry the package dispatches through.
 *
 * Refuses a stage type two parts both claim rather than letting the later one
 * win: see `DuplicateStageEditorError`. `StageEditorPartsAreDisjoint` says the
 * same thing at build time for the parts listed below, which is the check that
 * actually stops a duplicate reaching a review — this one covers the registry
 * a HOST composes, which the package never sees.
 *
 * ANSWERS WITH THE PARTS MERGED, NOT WITH `StageEditorRegistryPart`. What the
 * parts claim between them is the only thing that can say whether a composed
 * registry is complete, and a return type of "some subset of the interfaces"
 * throws that away — which is what used to leave `stageEditorRegistry` typed
 * as a partial registry, and the dispatcher below it with a runtime branch for
 * an interface the type system could no longer prove was covered.
 */
export function composeStageEditorRegistry<
  const Parts extends readonly StageEditorRegistryPart[],
>(...parts: Parts): MergeAll<Parts> {
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
  // The key set is exactly the union of the parts' own key sets, which is what
  // `MergeAll` says and what `Object.assign` discards. Asserted here, in the
  // one function that does the merging, rather than at each of the call sites
  // that would otherwise have to.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.freeze(composed) as MergeAll<Parts>;
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
  censusAndBinStageEditors,
  formStageEditors,
  nameGeneratorStageEditors,
  networkStageEditors,
  pedigreeAndAnonymisationStageEditors,
] as const satisfies readonly StageEditorRegistryPart[];

/**
 * The registry the package dispatches through, and the proof that it is
 * complete.
 *
 * THE ANNOTATION IS THE PROOF. `StageEditorRegistry` requires an entry for
 * every `StageType`, and `composeStageEditorRegistry` answers with exactly
 * what the parts above claim between them — so a schema member no family has
 * claimed fails to compile HERE, on the line that defines the thing every host
 * renders through, rather than reaching a researcher as a stage that opens on
 * nothing. It is also what lets `StageEditor` look an editor up without a
 * branch for the case where there is none: there is no such case.
 */
export const stageEditorRegistry: StageEditorRegistry =
  composeStageEditorRegistry(...REGISTRY_PARTS);

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

/** `true` only when the parts name an editor for every `StageType`. */
export type PartsCoverEveryStageType<
  Parts extends readonly StageEditorRegistryPart[],
> = [UnregisteredIn<Parts>] extends [never] ? true : false;

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
export const AWAITING_STAGE_EDITORS =
  [] as const satisfies readonly UnregisteredStageType[];

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
 * Compile-time proof that every interface in the schema has an editor.
 *
 * The same fact the annotation on `stageEditorRegistry` above proves, said in
 * the one form a probe in `type-tests/` can be written against: that one is a
 * claim about a value, and a type test cannot rebuild the value without
 * rebuilding every family with it. `type-tests/incompleteRegistry.ts` is that
 * probe, and this line is its control.
 */
export type EveryStageTypeHasAnEditor = Assert<
  PartsCoverEveryStageType<typeof REGISTRY_PARTS>
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
