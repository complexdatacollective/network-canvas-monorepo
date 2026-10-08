import { alterEdgeFormScenarios } from './alter-edge-form.scenarios.js';
import { alterFormScenarios } from './alter-form.scenarios.js';
import { anonymisationScenarios } from './anonymisation.scenarios.js';
import { categoricalBinScenarios } from './categorical-bin.scenarios.js';
import { crossCuttingScenarios } from './cross-cutting.scenarios.js';
import { dyadCensusScenarios } from './dyad-census.scenarios.js';
import { egoFormScenarios } from './ego-form.scenarios.js';
import { familyPedigreeScenarios } from './family-pedigree.scenarios.js';
import { finishSessionScenarios } from './finish-session.scenarios.js';
import { geospatialScenarios } from './geospatial.scenarios.js';
import { informationScenarios } from './information.scenarios.js';
import { nameGeneratorQuickAddScenarios } from './name-generator-quick-add.scenarios.js';
import { nameGeneratorRosterScenarios } from './name-generator-roster.scenarios.js';
import { nameGeneratorScenarios } from './name-generator.scenarios.js';
import { narrativePedigreeScenarios } from './narrative-pedigree.scenarios.js';
import { narrativeScenarios } from './narrative.scenarios.js';
import { networkComposerScenarios } from './network-composer.scenarios.js';
import { oneToManyDyadCensusScenarios } from './one-to-many-dyad-census.scenarios.js';
import { ordinalBinScenarios } from './ordinal-bin.scenarios.js';
import { sociogramScenarios } from './sociogram.scenarios.js';
import { tieStrengthCensusScenarios } from './tie-strength-census.scenarios.js';
import type { InterfaceScenarios } from './types.js';

/**
 * The single registration point for every matrix interface suite. The coverage
 * manifest, the visual suite, and any future consumer import this list rather
 * than maintaining their own. Add a new interface suite here (alphabetical) and
 * every consumer picks it up.
 */
export const ALL_SUITES: InterfaceScenarios[] = [
  alterEdgeFormScenarios,
  alterFormScenarios,
  anonymisationScenarios,
  categoricalBinScenarios,
  crossCuttingScenarios,
  dyadCensusScenarios,
  egoFormScenarios,
  familyPedigreeScenarios,
  finishSessionScenarios,
  geospatialScenarios,
  informationScenarios,
  nameGeneratorQuickAddScenarios,
  nameGeneratorRosterScenarios,
  nameGeneratorScenarios,
  narrativeScenarios,
  narrativePedigreeScenarios,
  networkComposerScenarios,
  oneToManyDyadCensusScenarios,
  ordinalBinScenarios,
  sociogramScenarios,
  tieStrengthCensusScenarios,
];
