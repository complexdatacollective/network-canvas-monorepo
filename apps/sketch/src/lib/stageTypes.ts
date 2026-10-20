// How each protocol stage type is named and coloured on the Ready and
// Compare screens. Class names are written out in full so Tailwind sees them.

type StageTypeStyle = { label: string; swatch: string };

const INFO = 'bg-cerulean text-on-light';
const EGO = 'bg-slate-blue text-white';
const NAMES = 'bg-neon-coral text-white';
const ROSTER = 'bg-sea-green text-on-light';
const FORM = 'bg-mustard text-on-light';
const BIN = 'bg-tangerine text-on-light';
const MAP = 'bg-purple-pizazz text-white';
const CENSUS = 'bg-barbie-pink text-white';

const STAGE_TYPES: Record<string, StageTypeStyle> = {
  Information: { label: 'Information', swatch: INFO },
  EgoForm: { label: 'Ego form', swatch: EGO },
  NameGenerator: { label: 'Name generator, form', swatch: NAMES },
  NameGeneratorQuickAdd: { label: 'Name generator', swatch: NAMES },
  NameGeneratorRoster: { label: 'Name generator, roster', swatch: ROSTER },
  AlterForm: { label: 'Per-alter form', swatch: FORM },
  AlterEdgeForm: { label: 'Per-tie form', swatch: FORM },
  OrdinalBin: { label: 'Ordinal bin', swatch: BIN },
  CategoricalBin: { label: 'Categorical bin', swatch: BIN },
  Sociogram: { label: 'Sociogram', swatch: MAP },
  Narrative: { label: 'Narrative', swatch: MAP },
  NetworkComposer: { label: 'Network composer', swatch: MAP },
  DyadCensus: { label: 'Dyad census', swatch: CENSUS },
  OneToManyDyadCensus: { label: 'One-to-many dyad census', swatch: CENSUS },
  TieStrengthCensus: { label: 'Tie strength census', swatch: CENSUS },
  Geospatial: { label: 'Map', swatch: ROSTER },
};

export const stageTypeStyle = (type: string): StageTypeStyle =>
  STAGE_TYPES[type] ?? {
    label: type.replace(/([a-z])([A-Z])/g, '$1 $2'),
    swatch: EGO,
  };
