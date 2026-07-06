import categoricalIcon from '~/images/landing/categorical.svg';
import interfaceIcon from '~/images/landing/interface.svg';
import menuOrdIcon from '~/images/landing/menu-ord.svg';
import menuSociogramIcon from '~/images/landing/menu-sociogram.svg';
import nameGeneratorIcon from '~/images/landing/name-generator.svg';
import relationshipIcon from '~/images/landing/relationship.svg';

export type StageKind =
  | 'info'
  | 'namegen'
  | 'cat'
  | 'ordbin'
  | 'sociogram'
  | 'narrative';

type StageMeta = {
  key: StageKind;
  label: string;
  color: string;
  icon: string;
};

export const STAGE_META: Record<StageKind, StageMeta> = {
  info: {
    key: 'info',
    label: 'Information',
    color: 'hsl(237 79% 67%)',
    icon: interfaceIcon,
  },
  namegen: {
    key: 'namegen',
    label: 'Name Generator',
    color: 'hsl(342 77% 51%)',
    icon: nameGeneratorIcon,
  },
  ordbin: {
    key: 'ordbin',
    label: 'Ordinal Bin',
    color: 'hsl(27 93% 54%)',
    icon: menuOrdIcon,
  },
  cat: {
    key: 'cat',
    label: 'Categorical Bin',
    color: 'hsl(103 46% 56%)',
    icon: categoricalIcon,
  },
  sociogram: {
    key: 'sociogram',
    label: 'Sociogram',
    color: 'hsl(46 100% 47%)',
    icon: menuSociogramIcon,
  },
  narrative: {
    key: 'narrative',
    label: 'Narrative',
    color: 'hsl(237 79% 67%)',
    icon: relationshipIcon,
  },
};

export type TimelineStop = {
  key: StageKind;
  label: string;
  sub: string;
};

export const TIMELINE_SCRIPT: TimelineStop[] = [
  { key: 'info', label: 'Welcome', sub: 'Information' },
  { key: 'info', label: 'Consent', sub: 'Information' },
  { key: 'info', label: 'Demographics', sub: 'Information' },
  { key: 'namegen', label: 'Close ties', sub: 'Name Generator' },
  { key: 'namegen', label: 'Weak ties', sub: 'Name Generator' },
  { key: 'namegen', label: 'Support network', sub: 'Name Generator' },
  { key: 'cat', label: 'Relationship type', sub: 'Categorical Bin' },
  { key: 'cat', label: 'Group membership', sub: 'Categorical Bin' },
  { key: 'ordbin', label: 'Contact frequency', sub: 'Ordinal Bin' },
  { key: 'ordbin', label: 'Closeness', sub: 'Ordinal Bin' },
  { key: 'ordbin', label: 'Trust level', sub: 'Ordinal Bin' },
  { key: 'sociogram', label: 'Sociogram', sub: 'Connections' },
  { key: 'sociogram', label: 'Support paths', sub: 'Connections' },
  { key: 'narrative', label: 'Story exchange', sub: 'Narrative' },
  { key: 'narrative', label: 'Key moments', sub: 'Narrative' },
  { key: 'info', label: 'Debrief', sub: 'Information' },
  { key: 'info', label: 'Close out', sub: 'Information' },
];
