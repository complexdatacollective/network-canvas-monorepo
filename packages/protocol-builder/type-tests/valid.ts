import { defineStageEditor } from '../src/editors/defineStageEditor.tsx';
import {
  type Assert,
  type CoversEveryStageType,
  type PartsAreDisjoint,
  type RegisteredIn,
} from '../src/stageEditorRegistry.ts';

/**
 * The control: one part per stage type, no overlap.
 *
 * Without this, the probes beside it would still pass if the machinery simply
 * refused everything. The parts are declared the way every editor declares
 * one — `defineStageEditor`, from its own module — which is also the control
 * for `partFromRegistry.ts`: reached from there, the same call must be
 * refused.
 */
const EVERY_PART = [
  defineStageEditor('AlterEdgeForm', []),
  defineStageEditor('AlterForm', []),
  defineStageEditor('Anonymisation', []),
  defineStageEditor('CategoricalBin', []),
  defineStageEditor('DyadCensus', []),
  defineStageEditor('EgoForm', []),
  defineStageEditor('FamilyPedigree', []),
  defineStageEditor('FinishSession', []),
  defineStageEditor('Geospatial', []),
  defineStageEditor('Information', []),
  defineStageEditor('LanguageChooser', []),
  defineStageEditor('NameGenerator', []),
  defineStageEditor('NameGeneratorQuickAdd', []),
  defineStageEditor('NameGeneratorRoster', []),
  defineStageEditor('Narrative', []),
  defineStageEditor('NarrativePedigree', []),
  defineStageEditor('NetworkComposer', []),
  defineStageEditor('OneToManyDyadCensus', []),
  defineStageEditor('OrdinalBin', []),
  defineStageEditor('Sociogram', []),
  defineStageEditor('TieStrengthCensus', []),
] as const;

export type EveryTypeCovered = Assert<CoversEveryStageType<typeof EVERY_PART>>;

export type Disjoint = Assert<PartsAreDisjoint<typeof EVERY_PART>>;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const TWO_PARTS = [
  defineStageEditor('Information', []),
  defineStageEditor('EgoForm', []),
] as const;

/**
 * The claim `defineStageEditor`'s `Record<T, …>` return exists to make: these
 * parts claim these two interfaces and no others.
 *
 * Widen either part to `StageEditorRegistryPart` — or make the helper return
 * that type — and this becomes every stage type, which is the failure the
 * probes beside it can no longer catch once it has happened.
 */
export type ClaimsExactlyTheseTwo = Assert<
  Exactly<RegisteredIn<typeof TWO_PARTS>, 'EgoForm' | 'Information'>
>;
