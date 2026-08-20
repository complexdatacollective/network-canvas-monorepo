import type { StageType } from '@codaco/protocol-validation';

/**
 * What each interface is CALLED, for a researcher.
 *
 * `Record<StageType, string>` on purpose: the key set is the protocol schema's
 * own stage union, so adding a stage type without naming it is a build error
 * rather than a screen that silently shows an internal `type` — or, as here,
 * shows nothing.
 *
 * This exists because the same names were being kept in two places and had
 * already drifted apart for six interfaces. The New Stage screen's option list
 * held one set of titles; the stage editor registry derived another with
 * `startCase(type)`, differing at `OneToManyDyadCensus`, `TieStrengthCensus`,
 * `AlterForm`, `AlterEdgeForm`, `Geospatial` and `Anonymisation`. The timeline
 * reached across into the New Stage screen's list for its accessible names,
 * which meant a researcher heard whichever of the two that screen happened to
 * hold.
 *
 * The names here are the New Stage screen's, because those are the ones a
 * researcher chose the interface by.
 *
 * NOT the place for a stage's own label — that is authored per stage and lives
 * in the protocol.
 */
export const INTERFACE_NAMES: Record<StageType, string> = {
  AlterEdgeForm: 'Per Alter Edge Form',
  AlterForm: 'Per Alter Form',
  Anonymisation: 'Anonymisation Interface',
  CategoricalBin: 'Categorical Bin',
  DyadCensus: 'Dyad Census',
  EgoForm: 'Ego Form',
  FamilyPedigree: 'Family Pedigree',
  Geospatial: 'Geospatial Interface',
  Information: 'Information',
  NameGenerator: 'Name Generator (using forms)',
  NameGeneratorQuickAdd: 'Name Generator (quick add)',
  NameGeneratorRoster: 'Name Generator for Roster Data',
  Narrative: 'Narrative',
  NarrativePedigree: 'Narrative Pedigree',
  NetworkComposer: 'Network Composer',
  OneToManyDyadCensus: 'One to Many Dyad Census',
  OrdinalBin: 'Ordinal Bin',
  Sociogram: 'Sociogram',
  TieStrengthCensus: 'Tie-Strength Census',
};

/**
 * The researcher-facing name of an interface, or `undefined` when the stage
 * type is not one this build knows.
 *
 * A stage `type` read back out of a protocol is a plain string — an imported
 * `.netcanvas` authored against a newer schema can name an interface this
 * build has never heard of — so a display surface has to be able to ask
 * without being thrown at. (`getInterface`, the stage editor's registry
 * lookup, throws for exactly that case: it is the right behaviour when the
 * answer decides what to RENDER, and the wrong one when it only decides what
 * to CALL something.)
 */
export const interfaceDisplayName = (stageType: string): string | undefined =>
  Object.hasOwn(INTERFACE_NAMES, stageType)
    ? INTERFACE_NAMES[stageType as StageType]
    : undefined;
