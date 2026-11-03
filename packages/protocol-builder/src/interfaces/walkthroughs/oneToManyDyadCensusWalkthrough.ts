import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { removeAfterConsiderationSectionTitle } from '../../editors/one-to-many-dyad-census/sections/RemoveAfterConsiderationSection.tsx';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.introTitle',
    defaultMessage: 'Setting up a One-to-Many Dyad Census stage',
    description:
      'Title of the first step of a guided walkthrough of the One-to-Many Dyad Census stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.introBody',
    defaultMessage:
      'On a One-to-Many Dyad Census stage, the participant is shown one of the people they have named at a time, beside everyone else, and selects each of the others a question applies to. Each selection adds a connection between the two. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the One-to-Many Dyad Census walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.subjectTitle',
    defaultMessage: 'Choose who is asked about',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.subjectBody',
    defaultMessage:
      'Pick the node type this stage asks about. Every person of this type already in the interview is included. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.filterTitle',
    defaultMessage: 'Include only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.filterBody',
    defaultMessage:
      'Switch this on and add rules to include only the people who match them. Leave it off to include everyone of this type.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.promptsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the prompts of a One-to-Many Dyad Census stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.promptsBody',
    defaultMessage:
      'Each prompt is one question about the person shown and the others, such as who among the others they know. Add a prompt, write its question, and pick the edge type each selection creates. You can also set the order people are shown in.',
    description:
      'Body of the walkthrough step about the prompts of a One-to-Many Dyad Census stage. An edge type is a kind of connection between two people, such as friendship.',
  },
  removeTitle: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.removeTitle',
    defaultMessage: 'Choose what happens after each person',
    description:
      'Title of the walkthrough step about whether a person already asked about stays in the list to choose from.',
  },
  removeBody: {
    id: 'protocolBuilder.walkthrough.oneToManyDyadCensus.removeBody',
    defaultMessage:
      'Once a person has been asked about, they can be removed from the list the participant chooses from, or kept in it. Removing them means each pair is only asked about once. Pick one of the two.',
    description:
      'Body of the walkthrough step about whether a person already asked about stays in the list to choose from.',
  },
});

const census = (stage: Stage) => stageOfType(stage, 'OneToManyDyadCensus');

/**
 * The One-to-Many Dyad Census editor, one step per setting, in the editor's
 * order.
 */
export const oneToManyDyadCensusWalkthrough: StageWalkthrough = [
  introStep('OneToManyDyadCensus', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => census(stage)?.subject?.type !== undefined,
  },
  {
    id: 'filter',
    title: messages.filterTitle,
    body: messages.filterBody,
    target: { section: networkFilterSectionTitle },
    optional: true,
  },
  {
    id: 'prompts',
    title: messages.promptsTitle,
    body: messages.promptsBody,
    target: { section: promptsSectionMessages.title },
    done: (stage) => (census(stage)?.prompts?.length ?? 0) > 0,
  },
  {
    id: 'removeAfterConsideration',
    title: messages.removeTitle,
    body: messages.removeBody,
    target: { section: removeAfterConsiderationSectionTitle },
    done: (stage) =>
      typeof census(stage)?.behaviours?.removeAfterConsideration === 'boolean',
  },
  ...closingSteps,
];
