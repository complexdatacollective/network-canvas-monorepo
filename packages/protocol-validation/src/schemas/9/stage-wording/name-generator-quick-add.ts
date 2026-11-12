import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import { NAME_GENERATOR_SUPPLIED_TEXT } from './name-generator.ts';

/** The Name Generator (quick add)'s settings Network Canvas words. */
export const NAME_GENERATOR_QUICK_ADD_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [
    ...NAME_GENERATOR_SUPPLIED_TEXT,
    // Worded as a Network Composer's name field is by default.
    {
      path: ['addNamePlaceholder'],
      wording:
        'interview.stageWording.nameGeneratorQuickAdd.addNamePlaceholder',
    },
  ];
