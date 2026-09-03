import type { StageType } from '@codaco/protocol-validation';

import {
  type PaletteColor,
  paletteColorStyles,
  type ThemeColorStyle,
} from '../styles/palette';

export const STAGE_TYPE_COLORS: Record<StageType, PaletteColor> = {
  NameGenerator: 'sea-green',
  NameGeneratorQuickAdd: 'kiwi',
  NameGeneratorRoster: 'sea-green-dark',
  EgoForm: 'slate-blue',
  AlterForm: 'slate-blue-dark',
  AlterEdgeForm: 'cyber-grape',
  Sociogram: 'neon-coral',
  NetworkComposer: 'tomato',
  TieStrengthCensus: 'paradise-pink',
  OneToManyDyadCensus: 'barbie-pink-dark',
  DyadCensus: 'barbie-pink',
  OrdinalBin: 'mustard',
  CategoricalBin: 'mustard-dark',
  FamilyPedigree: 'purple-pizazz',
  NarrativePedigree: 'purple-pizazz-dark',
  Narrative: 'neon-carrot',
  Geospatial: 'cerulean-blue',
  Information: 'sea-serpent',
  Anonymisation: 'charcoal',
};

/**
 * Narrows a stage `type` read from protocol JSON. A protocol authored against
 * a newer schema can name an interface this build does not know; readers
 * should reject it rather than draw it.
 */
export function isStageType(type: string): type is StageType {
  return Object.hasOwn(STAGE_TYPE_COLORS, type);
}

/**
 * The stage type's colour as CSS variable references, for inline styling.
 */
export function stageTypeColorStyle(type: StageType): ThemeColorStyle {
  return paletteColorStyles[STAGE_TYPE_COLORS[type]];
}
