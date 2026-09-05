/**
 * What an editor family's part IS, and how parts compose into a registry.
 *
 * Separate from `stageEditorRegistry.ts`, which is where the parts are wired
 * in, and separate for one concrete reason: a family's part module imports
 * `defineStageEditorPart`, and the wiring imports the family's part. Were both
 * in one module, that would be a cycle — and a cycle whose failure depends on
 * which side is loaded first, so it would work when a host imports the
 * dispatcher and throw when a family's own test imports its part. Nothing
 * here imports a family, so there is no cycle to depend on.
 *
 * It is also what keeps `type-tests/` about the coverage machinery: the probes
 * compile this module and the contract, and never the editors.
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

export type Assert<T extends true> = T;
