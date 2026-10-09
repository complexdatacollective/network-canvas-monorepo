import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import {
  hasExternalPanels,
  hasMaximumNodes,
  hasMinimumNodes,
} from './conditions.ts';

/**
 * The notice that says how many people are still needed. Each language's
 * message counts with `#` rather than a number format, which the schema does
 * not allow, and each plural form says the number in its own words.
 */
export const MIN_NODES_NOTICE = {
  'en': '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
  'de': '{count, plural, one {Sie müssen mindestens # Eintrag erstellen, bevor Sie fortfahren können.} other {Sie müssen mindestens # Einträge erstellen, bevor Sie fortfahren können.}}',
  'es': '{count, plural, one {Debes crear al menos # elemento antes de continuar.} other {Debes crear al menos # elementos antes de continuar.}}',
  'fr': '{count, plural, one {Vous devez créer au moins # élément avant de pouvoir continuer.} other {Vous devez créer au moins # éléments avant de pouvoir continuer.}}',
  'it': '{count, plural, one {Devi creare almeno # elemento prima di poter continuare.} many {Devi creare almeno # di elementi prima di poter continuare.} other {Devi creare almeno # elementi prima di poter continuare.}}',
  'nl': '{count, plural, one {Je moet minimaal # item aanmaken voordat je verder kunt.} other {Je moet minimaal # items aanmaken voordat je verder kunt.}}',
  'pt-BR':
    '{count, plural, one {Você precisa criar pelo menos # item antes de continuar.} other {Você precisa criar pelo menos # itens antes de continuar.}}',
  'zh-Hans': '{count, plural, other {您必须至少创建 # 项才能继续。}}',
  'zh-Hant': '{count, plural, other {您必須至少建立 # 個項目，才能繼續。}}',
} as const satisfies SuppliedWording;

/** The notice once a maximum is reached: the stage is complete. */
export const MAX_NODES_NOTICE = {
  'en': 'You have completed this task. Click the next arrow to continue.',
  'de': 'Sie haben diese Aufgabe abgeschlossen. Klicken Sie auf den Weiter-Pfeil, um fortzufahren.',
  'es': 'Has completado esta tarea. Pulsa la flecha de avance para continuar.',
  'fr': 'Vous avez terminé cette tâche. Cliquez sur la flèche Suivant pour continuer.',
  'it': 'Hai completato questa attività. Fai clic sulla freccia Avanti per continuare.',
  'nl': 'Je hebt deze taak afgerond. Klik op de pijl Volgende om verder te gaan.',
  'pt-BR':
    'Você concluiu esta tarefa. Clique na seta de avançar para continuar.',
  'zh-Hans': '您已完成此任务。点击“下一步”箭头继续。',
  'zh-Hant': '您已完成此任務。請點選「下一步」箭頭繼續。',
} as const satisfies SuppliedWording;

/** What a participant sees when an external list of people did not load. */
export const EXTERNAL_DATA_ERROR = {
  'en': 'External data could not be loaded.',
  'de': 'Externe Daten konnten nicht geladen werden.',
  'es': 'No se pudieron cargar los datos externos.',
  'fr': 'Les données externes n’ont pas pu être chargées.',
  'it': 'Non è stato possibile caricare i dati esterni.',
  'nl': 'Externe gegevens konden niet worden geladen.',
  'pt-BR': 'Não foi possível carregar os dados externos.',
  'zh-Hans': '无法加载外部数据。',
  'zh-Hant': '無法載入外部資料。',
} as const satisfies SuppliedWording;

/** The settings every name generator's limits and panels share. */
export const NAME_GENERATOR_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
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
  {
    path: ['externalDataError'],
    message: EXTERNAL_DATA_ERROR,
    when: hasExternalPanels,
  },
];
