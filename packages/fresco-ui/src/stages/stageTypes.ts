import {
  ChartNoAxesColumnIncreasing,
  Dna,
  Flag,
  GitFork,
  Info,
  KeyRound,
  Languages,
  LayoutGrid,
  type LucideIcon,
  MapPinned,
  Network,
  UserRoundPlus,
  Users,
  UserSearch,
} from 'lucide-react';

import type { StageType } from '@codaco/protocol-validation';

import type { ThemeColorStyle } from '../styles/palette';
import {
  AlterEdgeFormIcon,
  AlterFormIcon,
  DyadCensusIcon,
  EgoFormIcon,
  NarrativeIcon,
  NetworkComposerIcon,
  SociogramIcon,
  TieStrengthCensusIcon,
} from './stageTypeIcons';

type StageTypeDefinition = {
  /**
   * The stage type's token in `@codaco/tailwind-config/interfaces.css`, which
   * defines `--interface-<token>` (background) and `--interface-<token>-contrast`
   * (the icon and any text drawn on it).
   */
  token: string;
  icon: LucideIcon;
};

/**
 * Every stage type's colour token and icon, in the order the stage groups
 * read: naming, describing, grouping, mapping, connecting, reflecting and
 * screens. Keyed by the protocol schema's stage union, so a new stage type
 * cannot ship without both.
 */
export const STAGE_TYPES: Record<StageType, StageTypeDefinition> = {
  NameGenerator: { token: 'name-generator', icon: Users },
  NameGeneratorQuickAdd: {
    token: 'name-generator-quick-add',
    icon: UserRoundPlus,
  },
  NameGeneratorRoster: { token: 'name-generator-roster', icon: UserSearch },
  NetworkComposer: { token: 'network-composer', icon: NetworkComposerIcon },
  FamilyPedigree: { token: 'family-pedigree', icon: Network },
  EgoForm: { token: 'ego-form', icon: EgoFormIcon },
  AlterForm: { token: 'alter-form', icon: AlterFormIcon },
  AlterEdgeForm: { token: 'alter-edge-form', icon: AlterEdgeFormIcon },
  CategoricalBin: { token: 'categorical-bin', icon: LayoutGrid },
  OrdinalBin: { token: 'ordinal-bin', icon: ChartNoAxesColumnIncreasing },
  Geospatial: { token: 'geospatial', icon: MapPinned },
  Sociogram: { token: 'sociogram', icon: SociogramIcon },
  DyadCensus: { token: 'dyad-census', icon: DyadCensusIcon },
  OneToManyDyadCensus: { token: 'one-to-many-dyad-census', icon: GitFork },
  TieStrengthCensus: {
    token: 'tie-strength-census',
    icon: TieStrengthCensusIcon,
  },
  Narrative: { token: 'narrative', icon: NarrativeIcon },
  NarrativePedigree: { token: 'narrative-pedigree', icon: Dna },
  Information: { token: 'information', icon: Info },
  LanguageChooser: { token: 'language-chooser', icon: Languages },
  Anonymisation: { token: 'anonymisation', icon: KeyRound },
  FinishSession: { token: 'finish-session', icon: Flag },
};

/**
 * Narrows a stage `type` read from protocol JSON. A protocol authored against
 * a newer schema can name an interface this build does not know; readers
 * should reject it rather than draw it.
 */
export function isStageType(type: string): type is StageType {
  return Object.hasOwn(STAGE_TYPES, type);
}

/**
 * The stage type's background and foreground as CSS variable references, for
 * inline styling. They read the bare `--interface-*` variables, whose values
 * are the same in every theme.
 */
export function stageTypeColorStyle(type: StageType): ThemeColorStyle {
  const { token } = STAGE_TYPES[type];
  return {
    color: `var(--interface-${token})`,
    contrast: `var(--interface-${token}-contrast)`,
  };
}

/**
 * The stage type's icon component. Decorative wherever the stage is already
 * named in text, so render it with `aria-hidden`.
 */
export function stageTypeIcon(type: StageType): LucideIcon {
  return STAGE_TYPES[type].icon;
}
