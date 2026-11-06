import type { ComponentType } from 'react';

import {
  NameGeneratorAdditionalAttributesScene,
  NameGeneratorDataScene,
  NameGeneratorFilterScene,
  NameGeneratorInputControlsScene,
  NameGeneratorSkipLogicScene,
  NameGeneratorValidationScene,
} from './NameGeneratorConsequenceScenes';
import {
  NameGeneratorFormScene,
  NameGeneratorIntroScene,
  NameGeneratorLimitsScene,
  NameGeneratorPanelSourcesScene,
  NameGeneratorPromptsScene,
} from './NameGeneratorScenes';
import {
  RosterCardDisplayScene,
  RosterDataScene,
  RosterIntroScene,
  RosterLimitsScene,
  RosterSearchScene,
  RosterSortScene,
} from './RosterScenes';
import {
  SociogramBackgroundScene,
  SociogramDataScene,
  SociogramDisplayEdgesScene,
  SociogramIntroScene,
  SociogramLayoutModeScene,
  SociogramSharedLayoutScene,
  SociogramTapScene,
} from './SociogramScenes';

/** Scenes a walkthrough step can name with a `scene:` directive. */
export const SCENES: Readonly<Record<string, ComponentType>> = {
  'name-generator-intro': NameGeneratorIntroScene,
  'name-generator-form': NameGeneratorFormScene,
  'name-generator-prompts': NameGeneratorPromptsScene,
  'name-generator-limits': NameGeneratorLimitsScene,
  'name-generator-panel-sources': NameGeneratorPanelSourcesScene,
  'name-generator-data': NameGeneratorDataScene,
  'name-generator-input-controls': NameGeneratorInputControlsScene,
  'name-generator-validation': NameGeneratorValidationScene,
  'name-generator-additional-attributes':
    NameGeneratorAdditionalAttributesScene,
  'name-generator-filter': NameGeneratorFilterScene,
  'skip-logic': NameGeneratorSkipLogicScene,
  'sociogram-intro': SociogramIntroScene,
  'sociogram-data': SociogramDataScene,
  'sociogram-shared-layout': SociogramSharedLayoutScene,
  'sociogram-tap': SociogramTapScene,
  'sociogram-display-edges': SociogramDisplayEdgesScene,
  'sociogram-background': SociogramBackgroundScene,
  'sociogram-layout-mode': SociogramLayoutModeScene,
  'roster-intro': RosterIntroScene,
  'roster-data': RosterDataScene,
  'roster-card-display': RosterCardDisplayScene,
  'roster-sort': RosterSortScene,
  'roster-search': RosterSearchScene,
  'roster-limits': RosterLimitsScene,
};
