/**
 * Where every editor is wired in, and the only file an editor has to change to
 * be wired in.
 *
 * ADDING AN EDITOR IS TWO LINES:
 *
 * 1. Import its part and add it to `REGISTRY_PARTS`.
 * 2. Delete the stage types it claims from `AWAITING_STAGE_EDITORS`.
 *
 * A part is what `defineStageEditor` answers with: one editor, one interface,
 * one line here.
 *
 * Nothing else — `stageEditorRegistry` and every check below are derived from
 * those two lists, and both are checked in both directions at compile time, so
 * a part added without its types being removed (or a type removed that no part
 * covers) fails `typecheck` rather than a review.
 *
 * Both lists are written to be merged rather than to be read: one entry per
 * line, in alphabetical order, each with a trailing comma, so that families
 * landing on separate branches change separate lines. `__tests__/
 * stageEditorRegistry.test.tsx` holds that shape in place.
 *
 * AN EDITOR DECLARES ITS PART AWAY FROM HERE — through `defineStageEditor`,
 * in `editors/defineStageEditor.tsx` — never in this module. This module
 * imports every part, so a part module that imported anything from this one
 * would close a cycle: whichever of the two a program reaches first, the other
 * is half-evaluated, and `REGISTRY_PARTS` reads a binding that does not hold
 * its part yet. That helper's module does not import this one, which is what
 * makes it safe for an editor to import, and it is deliberately NOT
 * re-exported from here: an editor that reached it through this module would
 * close the cycle again, and only sometimes.
 */
import type { StageType } from '@codaco/protocol-validation';

import { alterEdgeFormStageEditor } from './editors/alter-edge-form/AlterEdgeFormStageEditor.ts';
import { alterFormStageEditor } from './editors/alter-form/AlterFormStageEditor.ts';
import { categoricalBinStageEditor } from './editors/categorical-bin/CategoricalBinStageEditor.ts';
import { dyadCensusStageEditor } from './editors/dyad-census/DyadCensusStageEditor.ts';
import { egoFormStageEditor } from './editors/ego-form/EgoFormStageEditor.ts';
import { familyPedigreeStageEditor } from './editors/family-pedigree/FamilyPedigreeStageEditor.ts';
import { informationStageEditor } from './editors/information/InformationStageEditor.ts';
import { nameGeneratorQuickAddStageEditor } from './editors/name-generator-quick-add/NameGeneratorQuickAddStageEditor.ts';
import { nameGeneratorRosterStageEditor } from './editors/name-generator-roster/NameGeneratorRosterStageEditor.ts';
import { nameGeneratorStageEditor } from './editors/name-generator/NameGeneratorStageEditor.ts';
import { oneToManyDyadCensusStageEditor } from './editors/one-to-many-dyad-census/OneToManyDyadCensusStageEditor.ts';
import { ordinalBinStageEditor } from './editors/ordinal-bin/OrdinalBinStageEditor.ts';
import { sociogramStageEditor } from './editors/sociogram/SociogramStageEditor.ts';
import { tieStrengthCensusStageEditor } from './editors/tie-strength-census/TieStrengthCensusStageEditor.ts';
import type { StageEditorRegistryPart } from './stage-editor-contract.ts';

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
  const composed: StageEditorRegistryPart = {};
  for (const part of parts) {
    for (const [stageType, editor] of Object.entries(part)) {
      // A key present but holding nothing claims nothing — the same reading
      // `missingStageEditors` takes of the composed registry.
      //
      // Which is why the entries are copied one at a time rather than by
      // assigning whole parts: `Object.assign` copies an explicit `undefined`
      // too, so a later part with an empty entry took the interface away from
      // the family that had already claimed it — and the scan above, which
      // reads an empty entry as no claim at all, reported no duplicate. The
      // registry came out with the key present and nothing under it, which is
      // the one state that renders as `UnregisteredStageTypeError` while every
      // list of "who claims what" says the family owns it.
      if (editor === undefined) continue;
      if (claimed.has(stageType))
        throw new DuplicateStageEditorError(stageType);
      claimed.add(stageType);
      Object.assign(composed, { [stageType]: editor });
    }
  }

  return Object.freeze(composed);
}

/**
 * Every part, listed once.
 *
 * Written as a tuple rather than as a spread of imports so that the exact key
 * set of each part survives into the type system — which is what makes the
 * checks below compile-time facts rather than comments. Each entry must come
 * from `defineStageEditor`, whose `Record<T, …>` return is what keeps that key
 * set exact: a part widened to `StageEditorRegistryPart` has every key
 * optional, so `keyof` it is every stage type, and both checks below then pass
 * while saying nothing.
 */
const REGISTRY_PARTS = [
  // One imported part per line, alphabetically, each with a trailing comma.
  alterEdgeFormStageEditor,
  alterFormStageEditor,
  categoricalBinStageEditor,
  dyadCensusStageEditor,
  egoFormStageEditor,
  familyPedigreeStageEditor,
  informationStageEditor,
  nameGeneratorQuickAddStageEditor,
  nameGeneratorRosterStageEditor,
  nameGeneratorStageEditor,
  oneToManyDyadCensusStageEditor,
  ordinalBinStageEditor,
  sociogramStageEditor,
  tieStrengthCensusStageEditor,
] as const satisfies readonly StageEditorRegistryPart[];

export const stageEditorRegistry: StageEditorRegistryPart =
  composeStageEditorRegistry(...REGISTRY_PARTS);

/**
 * A registry with a host's own editors over the top.
 *
 * A host supplies a registry to ADD an interface it owns or to REPLACE one the
 * package ships. It never supplies one to take the rest away — and dispatching
 * through what it handed over did exactly that: a host naming only
 * `Information` would leave every other stage throwing
 * `UnregisteredStageTypeError`, in the host, from the day the first family
 * lands. Nothing shows it while the package's own registry is still empty,
 * which is why it cannot wait for the families to be got right.
 *
 * Not `composeStageEditorRegistry`, which refuses a second claim on an
 * interface: two FAMILIES claiming one is a mistake with no answer, while a
 * host claiming one the package also ships is what the prop is FOR. So overlap
 * here means the host wins, and an entry the host left empty claims nothing —
 * a key holding `undefined` is not a way to delete an editor the package
 * ships, here or in a family part.
 *
 * Takes the base rather than reading `stageEditorRegistry` itself, so it is a
 * function of what it is given: the only caller passes the package's own, and
 * a test can hand it a registry that HAS families in it, which is the state
 * this exists for and the one this branch cannot otherwise produce.
 */
export function stageEditorsWithHostOverrides(
  base: StageEditorRegistryPart,
  hostRegistry: StageEditorRegistryPart | undefined,
): StageEditorRegistryPart {
  if (hostRegistry === undefined) return base;
  const merged: StageEditorRegistryPart = { ...base };
  for (const [stageType, editor] of Object.entries(hostRegistry)) {
    if (editor === undefined) continue;
    Object.assign(merged, { [stageType]: editor });
  }
  return Object.freeze(merged);
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
  'Anonymisation',
  'Geospatial',
  'Narrative',
  'NarrativePedigree',
  'NetworkComposer',
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
