import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import { isStageRecord, type StageRecord } from './configuration.ts';
import { GROUPS_HEADING } from './network-composer.ts';

/** The legend heading over the attributes a preset can highlight. */
const ATTRIBUTES_HEADING = {
  'en': 'Attributes',
  'de': 'Attribute',
  'es': 'Atributos',
  'fr': 'Attributs',
  'it': 'Attributi',
  'nl': 'Attributen',
  'pt-BR': 'Atributos',
  'zh-Hans': '属性',
  'zh-Hant': '屬性',
} as const satisfies SuppliedWording;

/** The legend heading over the connection types a preset displays. */
const LINKS_HEADING = {
  'en': 'Links',
  'de': 'Verbindungen',
  'es': 'Conexiones',
  'fr': 'Liens',
  'it': 'Legami',
  'nl': 'Relaties',
  'pt-BR': 'Conexões',
  'zh-Hans': '关系',
  'zh-Hant': '關係',
} as const satisfies SuppliedWording;

/** The tooltip of the button that turns drawing on and off. */
export const TOGGLE_DRAWING_TOOLTIP = {
  'en': 'Toggle drawing',
  'de': 'Zeichnen ein/aus',
  'es': 'Activar o desactivar el dibujo',
  'fr': 'Activer ou désactiver le dessin',
  'it': 'Attiva o disattiva il disegno',
  'nl': 'Tekenen aan/uit',
  'pt-BR': 'Ativar ou desativar o desenho',
  'zh-Hans': '开启或关闭绘图',
  'zh-Hant': '開啟或關閉繪圖',
} as const satisfies SuppliedWording;

/**
 * The tooltip of the button that freezes what has been drawn, so it stays
 * put, and unfreezes it.
 */
export const TOGGLE_FREEZING_TOOLTIP = {
  'en': 'Toggle freezing annotations',
  'de': 'Fixieren der Anmerkungen ein/aus',
  'es': 'Congelar o descongelar las anotaciones',
  'fr': 'Figer ou laisser s’estomper les annotations',
  'it': 'Congela o scongela le annotazioni',
  'nl': 'Annotaties vastzetten aan/uit',
  'pt-BR': 'Congelar ou descongelar as anotações',
  'zh-Hans': '冻结或解冻标注',
  'zh-Hant': '固定或取消固定註記',
} as const satisfies SuppliedWording;

/** The tooltip of the button that clears what has been drawn. */
export const RESET_ANNOTATIONS_TOOLTIP = {
  'en': 'Reset annotations',
  'de': 'Anmerkungen zurücksetzen',
  'es': 'Restablecer las anotaciones',
  'fr': 'Réinitialiser les annotations',
  'it': 'Cancella le annotazioni',
  'nl': 'Annotaties wissen',
  'pt-BR': 'Redefinir anotações',
  'zh-Hans': '重置标注',
  'zh-Hant': '清除註記',
} as const satisfies SuppliedWording;

/** The presets, each a stage's view of the people and their connections. */
const presetsOf = (stage: StageRecord): readonly StageRecord[] => {
  const presets = stage.presets;
  return Array.isArray(presets) ? presets.filter(isStageRecord) : [];
};

/** A preset that highlights attributes shows the attributes heading. */
const anyPresetHighlights = (stage: StageRecord) =>
  presetsOf(stage).some(
    (preset) => Array.isArray(preset.highlight) && preset.highlight.length > 0,
  );

/** A preset that displays connection types shows the links heading. */
const anyPresetShowsEdges = (stage: StageRecord) =>
  presetsOf(stage).some((preset) => {
    const edges = preset.edges;
    return (
      isStageRecord(edges) &&
      Array.isArray(edges.display) &&
      edges.display.length > 0
    );
  });

/** A preset with a group variable shows the groups heading. */
const anyPresetHasGroups = (stage: StageRecord) =>
  presetsOf(stage).some((preset) => preset.groupVariable !== undefined);

/** The Narrative's settings Network Canvas words. */
export const NARRATIVE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['attributesHeading'],
    message: ATTRIBUTES_HEADING,
    when: anyPresetHighlights,
  },
  { path: ['linksHeading'], message: LINKS_HEADING, when: anyPresetShowsEdges },
  {
    path: ['groupsHeading'],
    message: GROUPS_HEADING,
    when: anyPresetHasGroups,
  },
];
