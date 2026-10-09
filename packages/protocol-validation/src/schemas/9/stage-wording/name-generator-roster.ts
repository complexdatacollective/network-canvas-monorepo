import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';

/**
 * The heading above the people a Name Generator Roster offers, in each
 * language Network Canvas's apps ship in.
 */
const ROSTER_PANEL_TITLE = {
  'en': 'Available to add',
  'de': 'Zum Hinzufügen verfügbar',
  'es': 'Disponibles para añadir',
  'fr': 'Éléments disponibles',
  'it': 'Disponibili da aggiungere',
  'nl': 'Beschikbaar om toe te voegen',
  'pt-BR': 'Disponíveis para adicionar',
  'zh-Hans': '可添加',
  'zh-Hant': '可新增的項目',
} as const satisfies SuppliedWording;

/** The Name Generator for Roster Data's settings Network Canvas words. */
export const NAME_GENERATOR_ROSTER_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [{ path: ['panelTitle'], message: ROSTER_PANEL_TITLE }];
