import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import { NAME_GENERATOR_SUPPLIED_TEXT } from './name-generator.ts';
import { ADD_NAME_PLACEHOLDER } from './network-composer.ts';

/**
 * The line under the quick-add field, with the Enter key named in it, which
 * every quick-add stage shows alike (`interface-text-wording.ts`).
 */
export const QUICK_ADD_HINT = {
  'en': 'Press Enter when you are finished.',
  'de': 'Drücken Sie Enter, wenn Sie fertig sind.',
  'es': 'Pulsa Intro cuando hayas terminado.',
  'fr': 'Appuyez sur Entrée lorsque vous avez terminé.',
  'it': 'Premi Invio quando hai finito.',
  'nl': 'Druk op Enter als je klaar bent.',
  'pt-BR': 'Pressione Enter quando terminar.',
  'zh-Hans': '完成后请按 Enter。',
  'zh-Hant': '完成後請按 Enter。',
} as const satisfies SuppliedWording;

/** The Name Generator (quick add)'s settings Network Canvas words. */
export const NAME_GENERATOR_QUICK_ADD_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [
    ...NAME_GENERATOR_SUPPLIED_TEXT,
    // Worded as a Network Composer's name field is by default.
    { path: ['addNamePlaceholder'], message: ADD_NAME_PLACEHOLDER },
  ];
