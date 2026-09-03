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
 * Drawn for a stage type this build does not know — a protocol authored
 * against a newer schema can name an interface that has no entry yet.
 */
export const UNKNOWN_STAGE_COLOR: PaletteColor = 'platinum';

export function isStageType(type: string): type is StageType {
  return Object.hasOwn(STAGE_TYPE_COLORS, type);
}

export function getStageTypeColor(type: string): PaletteColor {
  return isStageType(type) ? STAGE_TYPE_COLORS[type] : UNKNOWN_STAGE_COLOR;
}

/**
 * The stage type's colour as CSS variable references, for inline styling.
 */
export function stageTypeColorStyle(type: string): ThemeColorStyle {
  return paletteColorStyles[getStageTypeColor(type)];
}
