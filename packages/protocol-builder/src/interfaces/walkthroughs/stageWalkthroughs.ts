import type { StageType } from '@codaco/protocol-validation';

import { alterEdgeFormWalkthrough } from './alterEdgeFormWalkthrough.ts';
import { alterFormWalkthrough } from './alterFormWalkthrough.ts';
import { anonymisationWalkthrough } from './anonymisationWalkthrough.ts';
import { categoricalBinWalkthrough } from './categoricalBinWalkthrough.ts';
import { dyadCensusWalkthrough } from './dyadCensusWalkthrough.ts';
import { egoFormWalkthrough } from './egoFormWalkthrough.ts';
import { familyPedigreeWalkthrough } from './familyPedigreeWalkthrough.ts';
import { finishSessionWalkthrough } from './finishSessionWalkthrough.ts';
import { geospatialWalkthrough } from './geospatialWalkthrough.ts';
import { informationWalkthrough } from './informationWalkthrough.ts';
import { languageChooserWalkthrough } from './languageChooserWalkthrough.ts';
import { nameGeneratorQuickAddWalkthrough } from './nameGeneratorQuickAddWalkthrough.ts';
import { nameGeneratorRosterWalkthrough } from './nameGeneratorRosterWalkthrough.ts';
import { nameGeneratorWalkthrough } from './nameGeneratorWalkthrough.ts';
import { narrativePedigreeWalkthrough } from './narrativePedigreeWalkthrough.ts';
import { narrativeWalkthrough } from './narrativeWalkthrough.ts';
import { networkComposerWalkthrough } from './networkComposerWalkthrough.ts';
import { oneToManyDyadCensusWalkthrough } from './oneToManyDyadCensusWalkthrough.ts';
import { ordinalBinWalkthrough } from './ordinalBinWalkthrough.ts';
import { sociogramWalkthrough } from './sociogramWalkthrough.ts';
import { tieStrengthCensusWalkthrough } from './tieStrengthCensusWalkthrough.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const STAGE_WALKTHROUGHS: Record<StageType, StageWalkthrough> = {
  AlterEdgeForm: alterEdgeFormWalkthrough,
  AlterForm: alterFormWalkthrough,
  Anonymisation: anonymisationWalkthrough,
  CategoricalBin: categoricalBinWalkthrough,
  DyadCensus: dyadCensusWalkthrough,
  EgoForm: egoFormWalkthrough,
  FamilyPedigree: familyPedigreeWalkthrough,
  FinishSession: finishSessionWalkthrough,
  Geospatial: geospatialWalkthrough,
  Information: informationWalkthrough,
  LanguageChooser: languageChooserWalkthrough,
  NameGenerator: nameGeneratorWalkthrough,
  NameGeneratorQuickAdd: nameGeneratorQuickAddWalkthrough,
  NameGeneratorRoster: nameGeneratorRosterWalkthrough,
  Narrative: narrativeWalkthrough,
  NarrativePedigree: narrativePedigreeWalkthrough,
  NetworkComposer: networkComposerWalkthrough,
  OneToManyDyadCensus: oneToManyDyadCensusWalkthrough,
  OrdinalBin: ordinalBinWalkthrough,
  Sociogram: sociogramWalkthrough,
  TieStrengthCensus: tieStrengthCensusWalkthrough,
};

/** The walkthrough for an interface. */
export function stageWalkthrough(
  stageType: StageType,
): StageWalkthrough | undefined {
  return STAGE_WALKTHROUGHS[stageType];
}
