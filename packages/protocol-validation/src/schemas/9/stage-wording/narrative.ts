import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import {
  behaviourIsOn,
  isStageRecord,
  type StageRecord,
} from './configuration.ts';
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

const ENABLE_DRAWING_TOOLTIP = {
  'en': 'Enable drawing',
  'de': 'Zeichnen aktivieren',
  'es': 'Activar el dibujo',
  'fr': 'Activer le dessin',
  'it': 'Attiva il disegno',
  'nl': 'Tekenen inschakelen',
  'pt-BR': 'Ativar desenho',
  'zh-Hans': '开启绘图',
  'zh-Hant': '啟用繪圖',
} as const satisfies SuppliedWording;

const DISABLE_DRAWING_TOOLTIP = {
  'en': 'Disable drawing',
  'de': 'Zeichnen deaktivieren',
  'es': 'Desactivar el dibujo',
  'fr': 'Désactiver le dessin',
  'it': 'Disattiva il disegno',
  'nl': 'Tekenen uitschakelen',
  'pt-BR': 'Desativar desenho',
  'zh-Hans': '关闭绘图',
  'zh-Hant': '停用繪圖',
} as const satisfies SuppliedWording;

const FREEZE_ANNOTATIONS_TOOLTIP = {
  'en': 'Freeze annotations',
  'de': 'Anmerkungen fixieren',
  'es': 'Bloquear las anotaciones',
  'fr': 'Figer les annotations',
  'it': 'Blocca le annotazioni',
  'nl': 'Annotaties vastzetten',
  'pt-BR': 'Congelar anotações',
  'zh-Hans': '冻结标注',
  'zh-Hant': '鎖定註記',
} as const satisfies SuppliedWording;

const UNFREEZE_ANNOTATIONS_TOOLTIP = {
  'en': 'Unfreeze annotations',
  'de': 'Fixierung der Anmerkungen aufheben',
  'es': 'Desbloquear las anotaciones',
  'fr': 'Libérer les annotations',
  'it': 'Sblocca le annotazioni',
  'nl': 'Annotaties vrijgeven',
  'pt-BR': 'Descongelar anotações',
  'zh-Hans': '解冻标注',
  'zh-Hant': '解除鎖定註記',
} as const satisfies SuppliedWording;

const RESET_ANNOTATIONS_TOOLTIP = {
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

/** The layout toggle that pauses the automatic layout (also the Sociogram's). */
export const PAUSE_LAYOUT_TOOLTIP = {
  'en': 'Pause automatic layout',
  'de': 'Automatisches Layout pausieren',
  'es': 'Pausar la disposición automática',
  'fr': 'Suspendre la disposition automatique',
  'it': 'Sospendi la disposizione automatica',
  'nl': 'Automatische lay-out pauzeren',
  'pt-BR': 'Pausar a disposição automática',
  'zh-Hans': '暂停自动布局',
  'zh-Hant': '暫停自動版面配置',
} as const satisfies SuppliedWording;

/** The layout toggle that resumes the automatic layout (also the Sociogram's). */
export const RESUME_LAYOUT_TOOLTIP = {
  'en': 'Resume automatic layout',
  'de': 'Automatisches Layout fortsetzen',
  'es': 'Reanudar la disposición automática',
  'fr': 'Reprendre la disposition automatique',
  'it': 'Riprendi la disposizione automatica',
  'nl': 'Automatische lay-out hervatten',
  'pt-BR': 'Retomar a disposição automática',
  'zh-Hans': '恢复自动布局',
  'zh-Hant': '繼續自動版面配置',
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

/** The free-draw tools show only while the stage's free drawing is on. */
const drawingIsOn = (stage: StageRecord) => behaviourIsOn(stage, 'freeDraw');

/** The layout toggle shows only while the stage's automatic layout is on. */
const layoutIsOn = (stage: StageRecord) =>
  behaviourIsOn(stage, 'automaticLayout');

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
  {
    path: ['tooltips', 'enableDrawing'],
    message: ENABLE_DRAWING_TOOLTIP,
    when: drawingIsOn,
  },
  {
    path: ['tooltips', 'disableDrawing'],
    message: DISABLE_DRAWING_TOOLTIP,
    when: drawingIsOn,
  },
  {
    path: ['tooltips', 'freezeAnnotations'],
    message: FREEZE_ANNOTATIONS_TOOLTIP,
    when: drawingIsOn,
  },
  {
    path: ['tooltips', 'unfreezeAnnotations'],
    message: UNFREEZE_ANNOTATIONS_TOOLTIP,
    when: drawingIsOn,
  },
  {
    path: ['tooltips', 'resetAnnotations'],
    message: RESET_ANNOTATIONS_TOOLTIP,
    when: drawingIsOn,
  },
  {
    path: ['tooltips', 'pauseLayout'],
    message: PAUSE_LAYOUT_TOOLTIP,
    when: layoutIsOn,
  },
  {
    path: ['tooltips', 'resumeLayout'],
    message: RESUME_LAYOUT_TOOLTIP,
    when: layoutIsOn,
  },
];
