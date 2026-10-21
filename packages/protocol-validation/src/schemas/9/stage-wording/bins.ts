import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import { behaviourIsOn, type StageRecord } from './configuration.ts';

/**
 * Whether a bin stage keeps the participant on the stage until every node
 * is placed, which is when it shows the notice below.
 */
export const requiresCompletePlacement = (stage: StageRecord): boolean =>
  behaviourIsOn(stage, 'requireCompletePlacement');

/** The notice when the participant tries to continue with nodes unplaced. */
const UNPLACED_NODES_NOTICE = {
  'en': 'You must place every item before you can continue.',
  'de': 'Sie müssen alle Einträge zuordnen, bevor Sie fortfahren können.',
  'es': 'Debes colocar todos los elementos antes de continuar.',
  'fr': 'Vous devez placer tous les éléments avant de pouvoir continuer.',
  'it': 'Devi posizionare tutti gli elementi prima di poter continuare.',
  'nl': 'Je moet alle items plaatsen voordat je verder kunt.',
  'pt-BR': 'Você precisa posicionar todos os itens antes de continuar.',
  'zh-Hans': '您必须先放置所有项，才能继续。',
  'zh-Hant': '您必須先放置所有項目，才能繼續。',
} as const satisfies SuppliedWording;

/** The settings both bin stages word: the completion gate's notice. */
export const BIN_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['unplacedNodesNotice'],
    message: UNPLACED_NODES_NOTICE,
    when: requiresCompletePlacement,
  },
];
