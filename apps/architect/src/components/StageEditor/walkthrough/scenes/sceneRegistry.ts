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
  'name-generator-skip-logic': NameGeneratorSkipLogicScene,
};
