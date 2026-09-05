import {
  type Assert,
  type AwaitingListIsComplete,
  defineStageEditorPart,
  type PartsAreDisjoint,
  type RegisteredIn,
  type UnregisteredIn,
} from '../src/stageEditorRegistry.ts';
import { EgoFormEditor, InformationEditor } from './fixtures.ts';

/**
 * The control: two families, no overlap, and a list that names every interface
 * they leave alone.
 *
 * Without this, the probes beside it would still pass if the machinery simply
 * refused everything.
 */
const PARTS = [
  defineStageEditorPart({ Information: InformationEditor }),
  defineStageEditorPart({ EgoForm: EgoFormEditor }),
] as const;

export const AWAITING = [
  'AlterEdgeForm',
  'AlterForm',
  'Anonymisation',
  'CategoricalBin',
  'DyadCensus',
  'FamilyPedigree',
  'Geospatial',
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
] as const satisfies readonly UnregisteredIn<typeof PARTS>[];

export type ListIsComplete = Assert<
  AwaitingListIsComplete<typeof PARTS, typeof AWAITING>
>;

export type Disjoint = Assert<PartsAreDisjoint<typeof PARTS>>;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * The claim `defineStageEditorPart` exists to make: these parts claim these
 * two interfaces and no others.
 *
 * Widen either part to `StageEditorRegistryPart` — or make the helper return
 * that type — and this becomes every stage type, which is the failure the
 * three probes beside it can no longer catch once it has happened.
 */
export type ClaimsExactlyTheseTwo = Assert<
  Exactly<RegisteredIn<typeof PARTS>, 'EgoForm' | 'Information'>
>;
