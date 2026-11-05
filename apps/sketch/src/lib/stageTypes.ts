// How each protocol stage type is named and drawn on the Ready and Compare
// screens. The colours and icons are the shared stage-type map from fresco-ui;
// the names are Sketch's own plain-language ones.
import type { CSSProperties } from 'react';

import {
  isStageType,
  stageTypeColorStyle,
  stageTypeIcon,
} from '@codaco/fresco-ui/stages/stageTypes';
import type { StageType } from '@codaco/protocol-validation';

type StageTypeStyle = {
  label: string;
  /** The stage type's background and foreground, as an inline style. */
  swatch: CSSProperties;
  /** The stage type's icon, or null for a type this build does not know. */
  icon: ReturnType<typeof stageTypeIcon> | null;
};

const LABELS: Partial<Record<StageType, string>> = {
  Information: 'Information',
  EgoForm: 'Ego form',
  NameGenerator: 'Name generator, form',
  NameGeneratorQuickAdd: 'Name generator',
  NameGeneratorRoster: 'Name generator, roster',
  AlterForm: 'Per-alter form',
  AlterEdgeForm: 'Per-tie form',
  OrdinalBin: 'Ordinal bin',
  CategoricalBin: 'Categorical bin',
  Sociogram: 'Sociogram',
  Narrative: 'Narrative',
  NetworkComposer: 'Network composer',
  DyadCensus: 'Dyad census',
  OneToManyDyadCensus: 'One-to-many dyad census',
  TieStrengthCensus: 'Tie strength census',
  Geospatial: 'Map',
};

const splitWords = (type: string) => type.replace(/([a-z])([A-Z])/g, '$1 $2');

// A stage type a newer schema added: drawn in the brand's neutral charcoal so
// it still reads as a stage, without claiming a group's colour.
const UNKNOWN_SWATCH: CSSProperties = {
  backgroundColor: 'oklch(var(--charcoal))',
  color: 'oklch(var(--white))',
};

export const stageTypeStyle = (type: string): StageTypeStyle => {
  if (!isStageType(type)) {
    return { label: splitWords(type), swatch: UNKNOWN_SWATCH, icon: null };
  }
  const { color, contrast } = stageTypeColorStyle(type);
  return {
    label: LABELS[type] ?? splitWords(type),
    swatch: { backgroundColor: color, color: contrast },
    icon: stageTypeIcon(type),
  };
};
