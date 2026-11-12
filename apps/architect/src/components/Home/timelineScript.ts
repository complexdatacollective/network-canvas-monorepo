import { defineMessages } from '@codaco/app-i18n/messages';
import { interfaceNameMessages } from '@codaco/protocol-builder/interfaces/interfaceNames';
import type { StageType } from '@codaco/protocol-validation';
import type { ConfigMessage } from '~/i18n/formatConfig';

const titleMessages = defineMessages({
  welcome: {
    id: 'architect.home.timelineScript.config.welcome',
    defaultMessage: 'Welcome',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  agreeToTakePart: {
    id: 'architect.home.timelineScript.title.agreeToTakePart',
    defaultMessage: 'Agree to take part',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  aboutYou: {
    id: 'architect.home.timelineScript.title.aboutYou',
    defaultMessage: 'About you',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  nameCloseFriends: {
    id: 'architect.home.timelineScript.title.nameCloseFriends',
    defaultMessage: 'Name close friends',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  addAcquaintances: {
    id: 'architect.home.timelineScript.title.addAcquaintances',
    defaultMessage: 'Add acquaintances',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  findClassmates: {
    id: 'architect.home.timelineScript.title.findClassmates',
    defaultMessage: 'Find classmates',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  sortByRelationship: {
    id: 'architect.home.timelineScript.title.sortByRelationship',
    defaultMessage: 'Sort by relationship',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  sortByGroup: {
    id: 'architect.home.timelineScript.title.sortByGroup',
    defaultMessage: 'Sort by group',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  rateContact: {
    id: 'architect.home.timelineScript.title.rateContact',
    defaultMessage: 'Rate contact',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room. Here the participant rates how often they are in contact with each person.',
  },
  rateCloseness: {
    id: 'architect.home.timelineScript.title.rateCloseness',
    defaultMessage: 'Rate closeness',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  whoKnowsWhom: {
    id: 'architect.home.timelineScript.config.whoKnowsWhom',
    defaultMessage: 'Who knows whom',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  rateTieStrength: {
    id: 'architect.home.timelineScript.title.rateTieStrength',
    defaultMessage: 'Rate tie strength',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  mapYourNetwork: {
    id: 'architect.home.timelineScript.title.mapYourNetwork',
    defaultMessage: 'Map your network',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  drawSupportTies: {
    id: 'architect.home.timelineScript.title.drawSupportTies',
    defaultMessage: 'Draw support ties',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  discussYourNetwork: {
    id: 'architect.home.timelineScript.title.discussYourNetwork',
    defaultMessage: 'Discuss your network',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  discussSupport: {
    id: 'architect.home.timelineScript.title.discussSupport',
    defaultMessage: 'Discuss support',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  debrief: {
    id: 'architect.home.timelineScript.config.debrief',
    defaultMessage: 'Debrief',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
  finishTheInterview: {
    id: 'architect.home.timelineScript.title.finishTheInterview',
    defaultMessage: 'Finish the interview',
    description:
      'Title of a stage in the illustrative home-page timeline, saying what happens on that stage. App demo copy, not an authored protocol; keep it short, as the label has little room.',
  },
});

export type TimelineStop = {
  type: StageType;
  label: string;
  sub: string;
};

/**
 * An illustrative protocol, in interview order. Each stop names what happens
 * on the stage; its subtitle is the interface's own researcher-facing name,
 * read from the stage type so a stop cannot claim the wrong interface.
 */
const STOPS: { type: StageType; label: ConfigMessage }[] = [
  { type: 'Information', label: titleMessages.welcome },
  { type: 'Information', label: titleMessages.agreeToTakePart },
  { type: 'EgoForm', label: titleMessages.aboutYou },
  { type: 'NameGenerator', label: titleMessages.nameCloseFriends },
  { type: 'NameGeneratorQuickAdd', label: titleMessages.addAcquaintances },
  { type: 'NameGeneratorRoster', label: titleMessages.findClassmates },
  { type: 'CategoricalBin', label: titleMessages.sortByRelationship },
  { type: 'CategoricalBin', label: titleMessages.sortByGroup },
  { type: 'OrdinalBin', label: titleMessages.rateContact },
  { type: 'OrdinalBin', label: titleMessages.rateCloseness },
  { type: 'DyadCensus', label: titleMessages.whoKnowsWhom },
  { type: 'TieStrengthCensus', label: titleMessages.rateTieStrength },
  { type: 'Sociogram', label: titleMessages.mapYourNetwork },
  { type: 'Sociogram', label: titleMessages.drawSupportTies },
  { type: 'Narrative', label: titleMessages.discussYourNetwork },
  { type: 'Narrative', label: titleMessages.discussSupport },
  { type: 'Information', label: titleMessages.debrief },
  { type: 'FinishSession', label: titleMessages.finishTheInterview },
];

export const TIMELINE_SCRIPT: (Omit<TimelineStop, 'label' | 'sub'> & {
  label: ConfigMessage;
  sub: ConfigMessage;
})[] = STOPS.map((stop) => ({
  ...stop,
  sub: interfaceNameMessages[stop.type],
}));
