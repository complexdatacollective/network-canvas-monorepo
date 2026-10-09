import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import type { StageRecord } from './configuration.ts';

/** The heading over the symbol legend. */
const KEY_HEADING = {
  'en': 'Key',
  'de': 'Legende',
  'es': 'Leyenda',
  'fr': 'Légende',
  'it': 'Legenda',
  'nl': 'Legenda',
  'pt-BR': 'Legenda',
  'zh-Hans': '图例',
  'zh-Hant': '圖例',
} as const satisfies SuppliedWording;

/** The heading over the stage's conditions, in the condition panel. */
const CONDITION_HEADING = {
  'en': 'Conditions',
  'de': 'Erkrankungen',
  'es': 'Afecciones',
  'fr': 'Affections',
  'it': 'Condizioni',
  'nl': 'Aandoeningen',
  'pt-BR': 'Condições',
  'zh-Hans': '病症',
  'zh-Hant': '病症',
} as const satisfies SuppliedWording;

/** The instruction above the conditions, asking the participant to pick one. */
const CONDITION_INSTRUCTION = {
  'en': 'Select a condition to see who it affects.',
  'de': 'Wählen Sie eine Erkrankung aus, um zu sehen, wen sie betrifft.',
  'es': 'Selecciona una afección para ver a quién afecta.',
  'fr': 'Sélectionnez une affection pour voir qui elle touche.',
  'it': 'Seleziona una condizione per vedere quali persone ne sono affette.',
  'nl': 'Selecteer een aandoening om te zien bij wie die voorkomt.',
  'pt-BR': 'Selecione uma condição para ver quem ela afeta.',
  'zh-Hans': '选择一种病症，查看它影响了哪些人。',
  'zh-Hant': '請選擇一種病症，查看哪些人受到影響。',
} as const satisfies SuppliedWording;

/** The legend's meaning of the affected symbol. */
const HAS_CONDITION = {
  'en': 'Has this condition',
  'de': 'Hat diese Erkrankung',
  'es': 'Tiene esta afección',
  'fr': 'Présente cette affection',
  'it': 'Ha questa condizione',
  'nl': 'Heeft deze aandoening',
  'pt-BR': 'Tem esta condição',
  'zh-Hans': '患有此病症',
  'zh-Hant': '患有此病症',
} as const satisfies SuppliedWording;

/** The legend's meaning of the obligate affected symbol. */
const WILL_DEVELOP = {
  'en': 'Will develop this condition',
  'de': 'Wird diese Erkrankung entwickeln',
  'es': 'Desarrollará esta afección',
  'fr': 'Développera cette affection',
  'it': 'Svilupperà questa condizione',
  'nl': 'Zal deze aandoening ontwikkelen',
  'pt-BR': 'Desenvolverá esta condição',
  'zh-Hans': '将会患上此病症',
  'zh-Hant': '將會罹患此病症',
} as const satisfies SuppliedWording;

/** The legend's meaning of the obligate carrier symbol. */
const CARRIES = {
  'en': 'Carries this condition',
  'de': 'Trägt die Anlage für diese Erkrankung',
  'es': 'Es portador/a de esta afección',
  'fr': 'Est porteur ou porteuse de cette affection',
  'it': 'Persona portatrice di questa condizione',
  'nl': 'Is drager van deze aandoening',
  'pt-BR': 'É portador(a) desta condição',
  'zh-Hans': '携带此病症',
  'zh-Hant': '是此病症的帶因者',
} as const satisfies SuppliedWording;

/** The legend's meaning of the uncertain affected symbol. */
const MAY_DEVELOP = {
  'en': 'May develop this condition',
  'de': 'Kann diese Erkrankung entwickeln',
  'es': 'Puede desarrollar esta afección',
  'fr': 'Pourrait développer cette affection',
  'it': 'Potrebbe sviluppare questa condizione',
  'nl': 'Ontwikkelt deze aandoening mogelijk',
  'pt-BR': 'Pode desenvolver esta condição',
  'zh-Hans': '可能患上此病症',
  'zh-Hant': '可能罹患此病症',
} as const satisfies SuppliedWording;

/** The legend's meaning of the uncertain carrier symbol. */
const MAY_CARRY = {
  'en': 'May carry this condition',
  'de': 'Kann die Anlage für diese Erkrankung tragen',
  'es': 'Puede ser portador/a de esta afección',
  'fr': 'Pourrait être porteur ou porteuse de cette affection',
  'it': 'Potrebbe essere una persona portatrice di questa condizione',
  'nl': 'Is mogelijk drager van deze aandoening',
  'pt-BR': 'Pode ser portador(a) desta condição',
  'zh-Hans': '可能携带此病症',
  'zh-Hant': '可能是此病症的帶因者',
} as const satisfies SuppliedWording;

/** The legend's meaning when the status is not known. */
const NOT_KNOWN = {
  'en': 'Not known',
  'de': 'Nicht bekannt',
  'es': 'No se sabe',
  'fr': 'Inconnu',
  'it': 'Non noto',
  'nl': 'Niet bekend',
  'pt-BR': 'Desconhecido',
  'zh-Hans': '未知',
  'zh-Hant': '不明',
} as const satisfies SuppliedWording;

const CLEAR_FOCUS_TOOLTIP = {
  'en': 'Clear focus',
  'de': 'Fokus aufheben',
  'es': 'Quitar el foco',
  'fr': 'Annuler le centrage',
  'it': 'Rimuovi il primo piano',
  'nl': 'Focus wissen',
  'pt-BR': 'Limpar foco',
  'zh-Hans': '清除聚焦',
  'zh-Hant': '清除焦點',
} as const satisfies SuppliedWording;

const SAVE_SNAPSHOT_TOOLTIP = {
  'en': 'Save snapshot',
  'de': 'Momentaufnahme speichern',
  'es': 'Guardar imagen',
  'fr': 'Enregistrer un instantané',
  'it': 'Salva istantanea',
  'nl': 'Momentopname opslaan',
  'pt-BR': 'Salvar instantâneo',
  'zh-Hans': '保存快照',
  'zh-Hant': '儲存快照',
} as const satisfies SuppliedWording;

/** The snapshot's heading for a condition: the stage's title, then the condition. */
const SNAPSHOT_CONDITION = {
  'en': '{title}: {condition}',
  'de': '{title}: {condition}',
  'es': '{title}: {condition}',
  'fr': '{title} : {condition}',
  'it': '{title}: {condition}',
  'nl': '{title}: {condition}',
  'pt-BR': '{title}: {condition}',
  'zh-Hans': '{title}：{condition}',
  'zh-Hant': '{title}：{condition}',
} as const satisfies SuppliedWording;

/** The snapshot's heading for a condition focused on a person. */
const SNAPSHOT_INHERITANCE = {
  'en': '{title}: {condition} — inheritance for {name}',
  'de': '{title}: {condition} – Vererbung für {name}',
  'es': '{title}: {condition} — herencia de {name}',
  'fr': '{title} : {condition} — hérédité pour {name}',
  'it': '{title}: {condition} — trasmissione ereditaria per {name}',
  'nl': '{title}: {condition} – overerving voor {name}',
  'pt-BR': '{title}: {condition} — herança de {name}',
  'zh-Hans': '{title}：{condition} — {name} 的遗传情况',
  'zh-Hant': '{title}：{condition}（{name} 的遺傳情形）',
} as const satisfies SuppliedWording;

/** The at-risk rows of the legend are drawn only when the stage shows them. */
const showsAtRiskStatuses = (stage: StageRecord) =>
  stage.showAtRiskStatuses === true;

/** The Narrative Pedigree's settings Network Canvas words. */
export const NARRATIVE_PEDIGREE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [
    { path: ['keyHeading'], message: KEY_HEADING },
    { path: ['tooltips', 'clearFocus'], message: CLEAR_FOCUS_TOOLTIP },
    { path: ['tooltips', 'saveSnapshot'], message: SAVE_SNAPSHOT_TOOLTIP },
    { path: ['conditionText', 'heading'], message: CONDITION_HEADING },
    { path: ['conditionText', 'instruction'], message: CONDITION_INSTRUCTION },
    {
      path: ['conditionText', 'notation', 'affected'],
      message: HAS_CONDITION,
    },
    {
      path: ['conditionText', 'notation', 'obligateAffected'],
      message: WILL_DEVELOP,
    },
    {
      path: ['conditionText', 'notation', 'obligateCarrier'],
      message: CARRIES,
    },
    {
      path: ['conditionText', 'notation', 'atRiskAffected'],
      message: MAY_DEVELOP,
      when: showsAtRiskStatuses,
    },
    {
      path: ['conditionText', 'notation', 'atRiskCarrier'],
      message: MAY_CARRY,
      when: showsAtRiskStatuses,
    },
    { path: ['conditionText', 'notation', 'unknown'], message: NOT_KNOWN },
    {
      path: ['conditionText', 'snapshotCondition'],
      message: SNAPSHOT_CONDITION,
    },
    {
      path: ['conditionText', 'snapshotInheritance'],
      message: SNAPSHOT_INHERITANCE,
    },
  ];
