import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Loads one scene from a scene file. Each file is its own chunk, fetched the
 * first time a walkthrough shows one of its scenes; the scenes in a file share
 * that one fetch.
 */
function scene<M extends Record<K, ComponentType>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(() =>
    load().then((m): { default: ComponentType } => ({ default: m[name] })),
  );
}

const alterFormScenes = () => import('./AlterFormScenes');
const anonymisationScenes = () => import('./AnonymisationScenes');
const binScenes = () => import('./BinScenes');
const censusScenes = () => import('./CensusScenes');
const familyPedigreeScenes = () => import('./FamilyPedigreeScenes');
const finishSessionScenes = () => import('./FinishSessionScenes');
const geospatialScenes = () => import('./GeospatialScenes');
const informationScenes = () => import('./InformationScenes');
const interpreterScenes = () => import('./InterpreterScenes');
const languageChooserScenes = () => import('./LanguageChooserScenes');
const nameGeneratorConsequenceScenes = () =>
  import('./NameGeneratorConsequenceScenes');
const nameGeneratorScenes = () => import('./NameGeneratorScenes');
const narrativePedigreeScenes = () => import('./NarrativePedigreeScenes');
const narrativeScenes = () => import('./NarrativeScenes');
const networkComposerScenes = () => import('./NetworkComposerScenes');
const rosterScenes = () => import('./RosterScenes');
const sociogramScenes = () => import('./SociogramScenes');

/** Scenes a walkthrough step can name with a `scene:` directive. */
export const SCENES: Readonly<
  Record<string, LazyExoticComponent<ComponentType>>
> = {
  'name-generator-intro': scene(nameGeneratorScenes, 'NameGeneratorIntroScene'),
  'name-generator-form': scene(nameGeneratorScenes, 'NameGeneratorFormScene'),
  'name-generator-prompts': scene(
    nameGeneratorScenes,
    'NameGeneratorPromptsScene',
  ),
  'name-generator-limits': scene(
    nameGeneratorScenes,
    'NameGeneratorLimitsScene',
  ),
  'name-generator-panel-sources': scene(
    nameGeneratorScenes,
    'NameGeneratorPanelSourcesScene',
  ),
  'skip-logic': scene(
    nameGeneratorConsequenceScenes,
    'NameGeneratorSkipLogicScene',
  ),
  'sociogram-intro': scene(sociogramScenes, 'SociogramIntroScene'),
  'sociogram-background': scene(sociogramScenes, 'SociogramBackgroundScene'),
  'sociogram-layout-mode': scene(sociogramScenes, 'SociogramLayoutModeScene'),
  'roster-intro': scene(rosterScenes, 'RosterIntroScene'),
  'roster-card-display': scene(rosterScenes, 'RosterCardDisplayScene'),
  'roster-sort': scene(rosterScenes, 'RosterSortScene'),
  'roster-search': scene(rosterScenes, 'RosterSearchScene'),
  'ordinal-bin-intro': scene(binScenes, 'OrdinalBinIntroScene'),
  'categorical-bin-intro': scene(binScenes, 'CategoricalBinIntroScene'),
  'stage-filter': scene(binScenes, 'StageFilterScene'),
  'alter-form-intro': scene(alterFormScenes, 'AlterFormIntroScene'),
  'ego-form-intro': scene(interpreterScenes, 'EgoFormIntroScene'),
  'ego-form-introduction': scene(interpreterScenes, 'EgoFormIntroductionScene'),
  'edge-form-intro': scene(interpreterScenes, 'EdgeFormIntroScene'),
  'edge-form-source': scene(interpreterScenes, 'EdgeFormSourceScene'),
  'dyad-census-intro': scene(interpreterScenes, 'DyadCensusIntroScene'),
  'dyad-census-prompts': scene(interpreterScenes, 'DyadCensusPromptsScene'),
  'dyad-census-pairs': scene(interpreterScenes, 'DyadCensusPairsScene'),
  'tie-strength-intro': scene(censusScenes, 'TieStrengthIntroScene'),
  'one-to-many-intro': scene(censusScenes, 'OneToManyIntroScene'),
  'one-to-many-remove': scene(censusScenes, 'OneToManyRemoveScene'),
  'narrative-intro': scene(narrativeScenes, 'NarrativeIntroScene'),
  'narrative-draw': scene(narrativeScenes, 'NarrativeDrawScene'),
  'information-intro': scene(informationScenes, 'InformationIntroScene'),
  'information-blocks': scene(informationScenes, 'InformationBlocksScene'),
  'geospatial-intro': scene(geospatialScenes, 'GeospatialIntroScene'),
  'geospatial-property': scene(geospatialScenes, 'GeospatialPropertyScene'),
  'finish-session-intro': scene(finishSessionScenes, 'FinishSessionIntroScene'),
  'finish-session-automatic': scene(
    finishSessionScenes,
    'FinishSessionAutomaticScene',
  ),
  'finish-session-outcomes': scene(
    finishSessionScenes,
    'FinishSessionOutcomesScene',
  ),
  'language-chooser-intro': scene(
    languageChooserScenes,
    'LanguageChooserIntroScene',
  ),
  'language-chooser-order': scene(
    languageChooserScenes,
    'LanguageChooserOrderScene',
  ),
  'language-chooser-languages': scene(
    languageChooserScenes,
    'LanguageChooserLanguagesScene',
  ),
  'anonymisation-intro': scene(anonymisationScenes, 'AnonymisationIntroScene'),
  'anonymisation-rules': scene(anonymisationScenes, 'AnonymisationRulesScene'),
  'anonymisation-return': scene(
    anonymisationScenes,
    'AnonymisationReturnScene',
  ),
  'network-composer-intro': scene(
    networkComposerScenes,
    'NetworkComposerIntroScene',
  ),
  'network-composer-tools': scene(
    networkComposerScenes,
    'NetworkComposerToolsScene',
  ),
  'network-composer-add': scene(
    networkComposerScenes,
    'NetworkComposerAddScene',
  ),
  'network-composer-positions': scene(
    networkComposerScenes,
    'NetworkComposerPositionsScene',
  ),
  'network-composer-auto-layout': scene(
    networkComposerScenes,
    'NetworkComposerAutoLayoutScene',
  ),
  'network-composer-groups': scene(
    networkComposerScenes,
    'NetworkComposerGroupsScene',
  ),
  'network-composer-inspector': scene(
    networkComposerScenes,
    'NetworkComposerInspectorScene',
  ),
  'network-composer-edges': scene(
    networkComposerScenes,
    'NetworkComposerEdgesScene',
  ),
  'network-composer-edge-inspector': scene(
    networkComposerScenes,
    'NetworkComposerEdgeInspectorScene',
  ),
  'family-pedigree-intro': scene(
    familyPedigreeScenes,
    'FamilyPedigreeIntroScene',
  ),
  'family-pedigree-labels': scene(
    familyPedigreeScenes,
    'FamilyPedigreeLabelsScene',
  ),
  'family-pedigree-gender': scene(
    familyPedigreeScenes,
    'FamilyPedigreeGenderScene',
  ),
  'family-pedigree-symbols': scene(
    familyPedigreeScenes,
    'FamilyPedigreeSymbolsScene',
  ),
  'family-pedigree-relationship': scene(
    familyPedigreeScenes,
    'FamilyPedigreeRelationshipScene',
  ),
  'family-pedigree-relationships': scene(
    familyPedigreeScenes,
    'FamilyPedigreeRelationshipsScene',
  ),
  'family-pedigree-framing': scene(
    familyPedigreeScenes,
    'FamilyPedigreeFramingScene',
  ),
  'family-pedigree-completeness': scene(
    familyPedigreeScenes,
    'FamilyPedigreeCompletenessScene',
  ),
  'family-pedigree-nomination': scene(
    familyPedigreeScenes,
    'FamilyPedigreeNominationScene',
  ),
  'narrative-pedigree-intro': scene(
    narrativePedigreeScenes,
    'NarrativePedigreeIntroScene',
  ),
  'narrative-pedigree-source': scene(
    narrativePedigreeScenes,
    'NarrativePedigreeSourceScene',
  ),
  'narrative-pedigree-conditions': scene(
    narrativePedigreeScenes,
    'NarrativePedigreeConditionsScene',
  ),
  'narrative-pedigree-at-risk': scene(
    narrativePedigreeScenes,
    'NarrativePedigreeAtRiskScene',
  ),
};

/** The name of every scene, known without loading any of them. */
export const SCENE_NAMES: readonly string[] = Object.keys(SCENES);
