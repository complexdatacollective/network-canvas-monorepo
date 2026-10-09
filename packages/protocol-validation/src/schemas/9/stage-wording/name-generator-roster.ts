import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import {
  hasMaximumNodes,
  hasMinimumNodes,
  hasRosterSearch,
} from './conditions.ts';
import {
  EXTERNAL_DATA_ERROR,
  MAX_NODES_NOTICE,
  MIN_NODES_NOTICE,
} from './name-generator.ts';

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

/** The notice once everything the roster offers has been added. */
const ALL_ADDED_NOTICE = {
  'en': 'There is nothing left to add from this list.',
  'de': 'Aus dieser Liste gibt es nichts mehr hinzuzufügen.',
  'es': 'No queda nada que añadir de esta lista.',
  'fr': 'Il ne reste rien à ajouter depuis cette liste.',
  'it': 'Non c’è più nulla da aggiungere da questo elenco.',
  'nl': 'Er is niets meer om toe te voegen uit deze lijst.',
  'pt-BR': 'Não há mais nada para adicionar desta lista.',
  'zh-Hans': '此列表中已没有可添加的内容。',
  'zh-Hant': '此清單中已沒有可新增的內容。',
} as const satisfies SuppliedWording;

/** The search box's placeholder, and its accessible name. */
const SEARCH_LABEL = {
  'en': 'Search',
  'de': 'Suchen',
  'es': 'Buscar',
  'fr': 'Rechercher',
  'it': 'Cerca',
  'nl': 'Zoeken',
  'pt-BR': 'Buscar',
  'zh-Hans': '搜索',
  'zh-Hant': '搜尋',
} as const satisfies SuppliedWording;

/** The notice when a search matches nothing. */
const SEARCH_NO_MATCH = {
  'en': 'Nothing matched your search term.',
  'de': 'Keine Treffer für Ihren Suchbegriff.',
  'es': 'No hay resultados que coincidan con tu búsqueda.',
  'fr': 'Aucun résultat ne correspond à votre recherche.',
  'it': 'Nessun risultato per il termine cercato.',
  'nl': 'Niets gevonden voor je zoekterm.',
  'pt-BR': 'Nenhum resultado corresponde ao termo buscado.',
  'zh-Hans': '没有与您的搜索词匹配的结果。',
  'zh-Hant': '找不到符合搜尋字詞的結果。',
} as const satisfies SuppliedWording;

/** The Name Generator for Roster Data's settings Network Canvas words. */
export const NAME_GENERATOR_ROSTER_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [
    { path: ['panelTitle'], message: ROSTER_PANEL_TITLE },
    {
      path: ['minNodesNotice'],
      message: MIN_NODES_NOTICE,
      when: hasMinimumNodes,
    },
    {
      path: ['maxNodesNotice'],
      message: MAX_NODES_NOTICE,
      when: hasMaximumNodes,
    },
    { path: ['externalDataError'], message: EXTERNAL_DATA_ERROR },
    { path: ['allAddedNotice'], message: ALL_ADDED_NOTICE },
    { path: ['searchLabel'], message: SEARCH_LABEL, when: hasRosterSearch },
    {
      path: ['searchNoMatch'],
      message: SEARCH_NO_MATCH,
      when: hasRosterSearch,
    },
  ];
