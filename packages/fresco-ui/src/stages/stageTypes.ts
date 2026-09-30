import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Dna,
  FileUser,
  GitCompare,
  GitFork,
  IdCard,
  Info,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  MapPinned,
  Network,
  Share2,
  Spline,
  UserRoundPlus,
  Users,
  UserSearch,
  VectorSquare,
  Weight,
} from 'lucide-react';

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
  EgoForm: 'cerulean-blue',
  AlterForm: 'slate-blue',
  AlterEdgeForm: 'slate-blue-dark',
  Sociogram: 'neon-coral',
  NetworkComposer: 'tomato',
  TieStrengthCensus: 'paradise-pink',
  OneToManyDyadCensus: 'barbie-pink-dark',
  DyadCensus: 'barbie-pink',
  OrdinalBin: 'mustard',
  CategoricalBin: 'neon-carrot',
  FamilyPedigree: 'purple-pizazz',
  NarrativePedigree: 'purple-pizazz-dark',
  Narrative: 'neon-coral-dark',
  Geospatial: 'sea-serpent',
  Information: 'platinum-dark',
  Anonymisation: 'cyber-grape',
};

/**
 * One Lucide icon per interface, chosen for what the interface *does* rather
 * than what it is called, and — where Network Canvas already drew that
 * interface its own icon — for the closest silhouette to it, so the set still
 * reads as Network Canvas in a family the rest of the app already uses.
 */
export const STAGE_TYPE_ICONS: Record<StageType, LucideIcon> = {
  NameGenerator: Users,
  NameGeneratorQuickAdd: UserRoundPlus,
  NameGeneratorRoster: UserSearch,
  EgoForm: IdCard,
  AlterForm: FileUser,
  AlterEdgeForm: Spline,
  Sociogram: Share2,
  NetworkComposer: VectorSquare,
  TieStrengthCensus: Weight,
  OneToManyDyadCensus: GitFork,
  DyadCensus: GitCompare,
  OrdinalBin: ChartNoAxesColumnIncreasing,
  CategoricalBin: LayoutGrid,
  FamilyPedigree: Network,
  NarrativePedigree: Dna,
  Narrative: BookOpen,
  Geospatial: MapPinned,
  Information: Info,
  Anonymisation: KeyRound,
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

/**
 * The stage type's icon component. Decorative wherever the stage is already
 * named in text, so render it with `aria-hidden`.
 */
export function stageTypeIcon(type: StageType): LucideIcon {
  return STAGE_TYPE_ICONS[type];
}
