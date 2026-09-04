import type { StageType } from '@codaco/protocol-validation';

export type TimelineStop = {
  type: StageType;
  label: string;
  sub: string;
};

// `sub` is written here rather than read from `INTERFACE_NAMES`: those are the
// New Stage screen's names, deliberately long enough to pick an interface by
// ("Name Generator (using forms)"), and this is a tracking-wide 12px caption.
export const TIMELINE_SCRIPT: TimelineStop[] = [
  { type: 'Information', label: 'Welcome', sub: 'Information' },
  { type: 'Information', label: 'Consent', sub: 'Information' },
  { type: 'EgoForm', label: 'Demographics', sub: 'Ego Form' },
  { type: 'NameGenerator', label: 'Close ties', sub: 'Name Generator' },
  { type: 'NameGeneratorQuickAdd', label: 'Weak ties', sub: 'Quick Add' },
  { type: 'NameGeneratorRoster', label: 'Support network', sub: 'Roster' },
  {
    type: 'CategoricalBin',
    label: 'Relationship type',
    sub: 'Categorical Bin',
  },
  { type: 'CategoricalBin', label: 'Group membership', sub: 'Categorical Bin' },
  { type: 'OrdinalBin', label: 'Contact frequency', sub: 'Ordinal Bin' },
  { type: 'OrdinalBin', label: 'Closeness', sub: 'Ordinal Bin' },
  { type: 'DyadCensus', label: 'Who knows whom', sub: 'Dyad Census' },
  { type: 'TieStrengthCensus', label: 'Trust level', sub: 'Tie Strength' },
  { type: 'Sociogram', label: 'Sociogram', sub: 'Connections' },
  { type: 'Sociogram', label: 'Support paths', sub: 'Connections' },
  { type: 'Narrative', label: 'Story exchange', sub: 'Narrative' },
  { type: 'Narrative', label: 'Key moments', sub: 'Narrative' },
  { type: 'Information', label: 'Debrief', sub: 'Information' },
  { type: 'Information', label: 'Close out', sub: 'Information' },
];
