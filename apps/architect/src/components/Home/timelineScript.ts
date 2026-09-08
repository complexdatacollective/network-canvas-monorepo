import { defineMessages } from '@codaco/app-i18n/messages';
import type { ConfigMessage, MessageConfig } from '~/i18n/formatConfig';
import categoricalIcon from '~/images/landing/categorical.svg';
import interfaceIcon from '~/images/landing/interface.svg';
import menuOrdIcon from '~/images/landing/menu-ord.svg';
import menuSociogramIcon from '~/images/landing/menu-sociogram.svg';
import nameGeneratorIcon from '~/images/landing/name-generator.svg';
import relationshipIcon from '~/images/landing/relationship.svg';
const configMessages = defineMessages({
  information: {
    id: 'architect.home.timelineScript.config.information',
    defaultMessage: 'Information',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  nameGenerator: {
    id: 'architect.home.timelineScript.config.nameGenerator',
    defaultMessage: 'Name Generator',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  ordinalBin: {
    id: 'architect.home.timelineScript.config.ordinalBin',
    defaultMessage: 'Ordinal Bin',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  categoricalBin: {
    id: 'architect.home.timelineScript.config.categoricalBin',
    defaultMessage: 'Categorical Bin',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  sociogram: {
    id: 'architect.home.timelineScript.config.sociogram',
    defaultMessage: 'Sociogram',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  narrative: {
    id: 'architect.home.timelineScript.config.narrative',
    defaultMessage: 'Narrative',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  welcome: {
    id: 'architect.home.timelineScript.config.welcome',
    defaultMessage: 'Welcome',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  consent: {
    id: 'architect.home.timelineScript.config.consent',
    defaultMessage: 'Consent',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  demographics: {
    id: 'architect.home.timelineScript.config.demographics',
    defaultMessage: 'Demographics',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  closeTies: {
    id: 'architect.home.timelineScript.config.closeTies',
    defaultMessage: 'Close ties',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  weakTies: {
    id: 'architect.home.timelineScript.config.weakTies',
    defaultMessage: 'Weak ties',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  supportNetwork: {
    id: 'architect.home.timelineScript.config.supportNetwork',
    defaultMessage: 'Support network',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  relationshipType: {
    id: 'architect.home.timelineScript.config.relationshipType',
    defaultMessage: 'Relationship type',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  groupMembership: {
    id: 'architect.home.timelineScript.config.groupMembership',
    defaultMessage: 'Group membership',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  contactFrequency: {
    id: 'architect.home.timelineScript.config.contactFrequency',
    defaultMessage: 'Contact frequency',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  closeness: {
    id: 'architect.home.timelineScript.config.closeness',
    defaultMessage: 'Closeness',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  trustLevel: {
    id: 'architect.home.timelineScript.config.trustLevel',
    defaultMessage: 'Trust level',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  supportPaths: {
    id: 'architect.home.timelineScript.config.supportPaths',
    defaultMessage: 'Support paths',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  storyExchange: {
    id: 'architect.home.timelineScript.config.storyExchange',
    defaultMessage: 'Story exchange',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  keyMoments: {
    id: 'architect.home.timelineScript.config.keyMoments',
    defaultMessage: 'Key moments',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  debrief: {
    id: 'architect.home.timelineScript.config.debrief',
    defaultMessage: 'Debrief',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  closeOut: {
    id: 'architect.home.timelineScript.config.closeOut',
    defaultMessage: 'Close out',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
});

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

export const STAGE_META: Record<StageKind, MessageConfig<StageMeta>> = {
  info: {
    key: 'info',
    label: configMessages.information,
    color: 'hsl(237 79% 67%)',
    icon: interfaceIcon,
  },
  namegen: {
    key: 'namegen',
    label: configMessages.nameGenerator,
    color: 'hsl(342 77% 51%)',
    icon: nameGeneratorIcon,
  },
  ordbin: {
    key: 'ordbin',
    label: configMessages.ordinalBin,
    color: 'hsl(27 93% 54%)',
    icon: menuOrdIcon,
  },
  cat: {
    key: 'cat',
    label: configMessages.categoricalBin,
    color: 'hsl(103 46% 56%)',
    icon: categoricalIcon,
  },
  sociogram: {
    key: 'sociogram',
    label: configMessages.sociogram,
    color: 'hsl(46 100% 47%)',
    icon: menuSociogramIcon,
  },
  narrative: {
    key: 'narrative',
    label: configMessages.narrative,
    color: 'hsl(237 79% 67%)',
    icon: relationshipIcon,
  },
};

export type TimelineStop = {
  key: StageKind;
  label: string;
  sub: string;
};

const demoSubtitleMessages = defineMessages({
  information: {
    id: 'architect.home.demoSubtitle.information',
    defaultMessage: 'Information',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  nameGenerator: {
    id: 'architect.home.demoSubtitle.nameGenerator',
    defaultMessage: 'Name Generator',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  categoricalBin: {
    id: 'architect.home.demoSubtitle.categoricalBin',
    defaultMessage: 'Categorical Bin',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  ordinalBin: {
    id: 'architect.home.demoSubtitle.ordinalBin',
    defaultMessage: 'Ordinal Bin',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  connections: {
    id: 'architect.home.demoSubtitle.connections',
    defaultMessage: 'Connections',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  narrative: {
    id: 'architect.home.demoSubtitle.narrative',
    defaultMessage: 'Narrative',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
});

export const TIMELINE_SCRIPT: (Omit<TimelineStop, 'label' | 'sub'> & {
  label: ConfigMessage;
  sub: ConfigMessage;
})[] = [
  {
    key: 'info',
    label: configMessages.welcome,
    sub: demoSubtitleMessages.information,
  },
  {
    key: 'info',
    label: configMessages.consent,
    sub: demoSubtitleMessages.information,
  },
  {
    key: 'info',
    label: configMessages.demographics,
    sub: demoSubtitleMessages.information,
  },
  {
    key: 'namegen',
    label: configMessages.closeTies,
    sub: demoSubtitleMessages.nameGenerator,
  },
  {
    key: 'namegen',
    label: configMessages.weakTies,
    sub: demoSubtitleMessages.nameGenerator,
  },
  {
    key: 'namegen',
    label: configMessages.supportNetwork,
    sub: demoSubtitleMessages.nameGenerator,
  },
  {
    key: 'cat',
    label: configMessages.relationshipType,
    sub: demoSubtitleMessages.categoricalBin,
  },
  {
    key: 'cat',
    label: configMessages.groupMembership,
    sub: demoSubtitleMessages.categoricalBin,
  },
  {
    key: 'ordbin',
    label: configMessages.contactFrequency,
    sub: demoSubtitleMessages.ordinalBin,
  },
  {
    key: 'ordbin',
    label: configMessages.closeness,
    sub: demoSubtitleMessages.ordinalBin,
  },
  {
    key: 'ordbin',
    label: configMessages.trustLevel,
    sub: demoSubtitleMessages.ordinalBin,
  },
  {
    key: 'sociogram',
    label: configMessages.sociogram,
    sub: demoSubtitleMessages.connections,
  },
  {
    key: 'sociogram',
    label: configMessages.supportPaths,
    sub: demoSubtitleMessages.connections,
  },
  {
    key: 'narrative',
    label: configMessages.storyExchange,
    sub: demoSubtitleMessages.narrative,
  },
  {
    key: 'narrative',
    label: configMessages.keyMoments,
    sub: demoSubtitleMessages.narrative,
  },
  {
    key: 'info',
    label: configMessages.debrief,
    sub: demoSubtitleMessages.information,
  },
  {
    key: 'info',
    label: configMessages.closeOut,
    sub: demoSubtitleMessages.information,
  },
];
