import { defineMessages } from '@codaco/app-i18n/messages';
import type { StageType } from '@codaco/protocol-validation';
import type { ConfigMessage } from '~/i18n/formatConfig';

const configMessages = defineMessages({
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
  whoKnowsWhom: {
    id: 'architect.home.timelineScript.config.whoKnowsWhom',
    defaultMessage: 'Who knows whom',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  trustLevel: {
    id: 'architect.home.timelineScript.config.trustLevel',
    defaultMessage: 'Trust level',
    description:
      'Presentation label or description in components/Home/timelineScript.ts. Identifiers are not translated.',
  },
  sociogram: {
    id: 'architect.home.timelineScript.config.sociogram',
    defaultMessage: 'Sociogram',
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

// `sub` is written here rather than read from `INTERFACE_NAMES`: those are the
// New Stage screen's names, deliberately long enough to pick an interface by
// ("Name Generator (using forms)"), and this is a tracking-wide 12px caption.
const demoSubtitleMessages = defineMessages({
  information: {
    id: 'architect.home.demoSubtitle.information',
    defaultMessage: 'Information',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  egoForm: {
    id: 'architect.home.demoSubtitle.egoForm',
    defaultMessage: 'Ego Form',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  nameGenerator: {
    id: 'architect.home.demoSubtitle.nameGenerator',
    defaultMessage: 'Name Generator',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  quickAdd: {
    id: 'architect.home.demoSubtitle.quickAdd',
    defaultMessage: 'Quick Add',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  roster: {
    id: 'architect.home.demoSubtitle.roster',
    defaultMessage: 'Roster',
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
  dyadCensus: {
    id: 'architect.home.demoSubtitle.dyadCensus',
    defaultMessage: 'Dyad Census',
    description:
      'Interface-style subtitle in the illustrative home-page timeline, which is app demo copy rather than an authored protocol.',
  },
  tieStrength: {
    id: 'architect.home.demoSubtitle.tieStrength',
    defaultMessage: 'Tie Strength',
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

export type TimelineStop = {
  type: StageType;
  label: string;
  sub: string;
};

export const TIMELINE_SCRIPT: (Omit<TimelineStop, 'label' | 'sub'> & {
  label: ConfigMessage;
  sub: ConfigMessage;
})[] = [
  {
    type: 'Information',
    label: configMessages.welcome,
    sub: demoSubtitleMessages.information,
  },
  {
    type: 'Information',
    label: configMessages.consent,
    sub: demoSubtitleMessages.information,
  },
  {
    type: 'EgoForm',
    label: configMessages.demographics,
    sub: demoSubtitleMessages.egoForm,
  },
  {
    type: 'NameGenerator',
    label: configMessages.closeTies,
    sub: demoSubtitleMessages.nameGenerator,
  },
  {
    type: 'NameGeneratorQuickAdd',
    label: configMessages.weakTies,
    sub: demoSubtitleMessages.quickAdd,
  },
  {
    type: 'NameGeneratorRoster',
    label: configMessages.supportNetwork,
    sub: demoSubtitleMessages.roster,
  },
  {
    type: 'CategoricalBin',
    label: configMessages.relationshipType,
    sub: demoSubtitleMessages.categoricalBin,
  },
  {
    type: 'CategoricalBin',
    label: configMessages.groupMembership,
    sub: demoSubtitleMessages.categoricalBin,
  },
  {
    type: 'OrdinalBin',
    label: configMessages.contactFrequency,
    sub: demoSubtitleMessages.ordinalBin,
  },
  {
    type: 'OrdinalBin',
    label: configMessages.closeness,
    sub: demoSubtitleMessages.ordinalBin,
  },
  {
    type: 'DyadCensus',
    label: configMessages.whoKnowsWhom,
    sub: demoSubtitleMessages.dyadCensus,
  },
  {
    type: 'TieStrengthCensus',
    label: configMessages.trustLevel,
    sub: demoSubtitleMessages.tieStrength,
  },
  {
    type: 'Sociogram',
    label: configMessages.sociogram,
    sub: demoSubtitleMessages.connections,
  },
  {
    type: 'Sociogram',
    label: configMessages.supportPaths,
    sub: demoSubtitleMessages.connections,
  },
  {
    type: 'Narrative',
    label: configMessages.storyExchange,
    sub: demoSubtitleMessages.narrative,
  },
  {
    type: 'Narrative',
    label: configMessages.keyMoments,
    sub: demoSubtitleMessages.narrative,
  },
  {
    type: 'Information',
    label: configMessages.debrief,
    sub: demoSubtitleMessages.information,
  },
  {
    type: 'Information',
    label: configMessages.closeOut,
    sub: demoSubtitleMessages.information,
  },
];
