import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';

/** The heading over the languages a participant chooses between. */
const TITLE = {
  'en': 'Choose a language',
  'de': 'Wählen Sie eine Sprache aus',
  'es': 'Elige un idioma',
  'fr': 'Choisissez une langue',
  'it': 'Scegli una lingua',
  'nl': 'Kies een taal',
  'pt-BR': 'Escolha um idioma',
  'zh-Hans': '选择语言',
  'zh-Hant': '選擇語言',
} as const satisfies SuppliedWording;

/** The Language Chooser's settings Network Canvas words. */
export const LANGUAGE_CHOOSER_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  { path: ['title'], message: TITLE },
];
