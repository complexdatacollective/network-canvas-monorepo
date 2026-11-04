import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { cardDisplayMessages } from '../../editors/name-generator-roster/sections/CardDisplaySection.tsx';
import { rosterSourceSectionTitle } from '../../editors/name-generator-roster/sections/ExternalDataSourceSection.tsx';
import { rosterPanelSectionTitle } from '../../editors/name-generator-roster/sections/RosterPanelSection.tsx';
import { rosterSearchSectionTitle } from '../../editors/name-generator-roster/sections/SearchOptionsSection.tsx';
import { sortOptionsMessages } from '../../editors/name-generator-roster/sections/SortOptionsSection.tsx';
import { alterLimitsSectionTitle } from '../../sections/alter-limits/AlterLimitsSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.introTitle',
    defaultMessage: 'Setting up a Name Generator for Roster Data stage',
    description:
      'Title of the first step of a guided walkthrough of the roster Name Generator stage editor. A stage is one step of an interview; a roster is a list of people imported from a data file.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.introBody',
    defaultMessage:
      'On this stage, the participant answers a question by picking people from a list that comes from a data file, such as everyone in a class. Nobody is typed in. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description:
      'Body of the first step of the roster Name Generator walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.subjectTitle',
    defaultMessage: 'Choose who is added',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.subjectBody',
    defaultMessage:
      'Pick the node type that each name chosen from the list is added as, such as Person. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  sourceTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.sourceTitle',
    defaultMessage: 'Choose the data file',
    description:
      'Title of the walkthrough step about the data file the roster lists people from.',
  },
  sourceBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.sourceBody',
    defaultMessage:
      'The list the participant picks from is read from this network data file. The card, sorting and search settings later on all use its attributes, so choosing a different file clears them.',
    description:
      'Body of the walkthrough step about the data file the roster lists people from.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.promptsTitle',
    defaultMessage: 'Write the prompts',
    description:
      'Title of the walkthrough step about the prompts. A prompt is one question the participant answers on the stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.promptsBody',
    defaultMessage:
      'A prompt is the question the participant answers, such as “Which of these people do you study with?”. Add at least one; with several, the participant moves through them in order. A prompt can also set values on everyone picked under it.',
    description:
      'Body of the walkthrough step about the prompts. The quoted question is an example and may be translated.',
  },
  panelTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.panelTitle',
    defaultMessage: 'Name the list',
    description:
      'Title of the walkthrough step about the heading above the list of people the participant picks from.',
  },
  panelBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.panelBody',
    defaultMessage:
      'This heading sits above the list the participant picks from. It starts with wording Network Canvas supplies, which you can change.',
    description:
      'Body of the walkthrough step about the heading above the list of people the participant picks from.',
  },
  cardsTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.cardsTitle',
    defaultMessage: 'Show more on each card',
    description:
      'Title of the walkthrough step about the extra details shown on each card in the list.',
  },
  cardsBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.cardsBody',
    defaultMessage:
      'Each person in the list is shown as a card with their name. Switch this on to add other details from the data file to each card, such as age, to help the participant tell people apart.',
    description:
      'Body of the walkthrough step about the extra details shown on each card in the list.',
  },
  sortTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.sortTitle',
    defaultMessage: 'Sort the list',
    description: 'Title of the walkthrough step about sorting the list.',
  },
  sortBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.sortBody',
    defaultMessage:
      'Switch this on to set the order the list starts in, and the attributes the participant can sort it by.',
    description: 'Body of the walkthrough step about sorting the list.',
  },
  searchTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.searchTitle',
    defaultMessage: 'Let the participant search',
    description: 'Title of the walkthrough step about searching the list.',
  },
  searchBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.searchBody',
    defaultMessage:
      'Switch this on to add a search box above the list. Choose which attributes a search looks in, and how closely what is typed has to match.',
    description: 'Body of the walkthrough step about searching the list.',
  },
  limitsTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.limitsTitle',
    defaultMessage: 'Limit how many people are picked',
    description: 'Title of the walkthrough step about nomination limits.',
  },
  limitsBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.limitsBody',
    defaultMessage:
      'Switch this on to set a minimum or maximum number of people across the whole stage. The participant cannot continue below the minimum, and cannot add more once the maximum is reached.',
    description: 'Body of the walkthrough step about nomination limits.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorRoster.wordingBody',
    defaultMessage:
      'Network Canvas supplies the messages shown on this stage, such as the one shown once everyone in the list has been added. Switch this on to write your own.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
});

const roster = (stage: Stage) => stageOfType(stage, 'NameGeneratorRoster');

export const nameGeneratorRosterWalkthrough: StageWalkthrough = [
  introStep('NameGeneratorRoster', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => roster(stage)?.subject?.type !== undefined,
  },
  {
    id: 'source',
    title: messages.sourceTitle,
    body: messages.sourceBody,
    target: { section: rosterSourceSectionTitle },
    done: (stage) => (roster(stage)?.dataSource ?? '') !== '',
  },
  {
    id: 'prompts',
    title: messages.promptsTitle,
    body: messages.promptsBody,
    target: { section: promptsSectionMessages.title },
    done: (stage) => (roster(stage)?.prompts?.length ?? 0) > 0,
  },
  {
    id: 'panel',
    title: messages.panelTitle,
    body: messages.panelBody,
    target: { section: rosterPanelSectionTitle },
  },
  {
    id: 'cards',
    title: messages.cardsTitle,
    body: messages.cardsBody,
    target: { section: cardDisplayMessages.title },
    optional: true,
  },
  {
    id: 'sort',
    title: messages.sortTitle,
    body: messages.sortBody,
    target: { section: sortOptionsMessages.title },
    optional: true,
  },
  {
    id: 'search',
    title: messages.searchTitle,
    body: messages.searchBody,
    target: { section: rosterSearchSectionTitle },
    optional: true,
  },
  {
    id: 'limits',
    title: messages.limitsTitle,
    body: messages.limitsBody,
    target: { section: alterLimitsSectionTitle },
    optional: true,
  },
  {
    id: 'wording',
    title: messages.wordingTitle,
    body: messages.wordingBody,
    target: { section: stageWordingMessages.title },
    optional: true,
  },
  ...closingSteps,
];
