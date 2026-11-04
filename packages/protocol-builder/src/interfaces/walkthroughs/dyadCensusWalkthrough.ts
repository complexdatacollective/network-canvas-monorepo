import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.dyadCensus.introTitle',
    defaultMessage: 'Setting up a Dyad Census stage',
    description:
      'Title of the first step of a guided walkthrough of the Dyad Census stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.dyadCensus.introBody',
    defaultMessage:
      'On a Dyad Census stage, the participant is shown every pair of the people they have named, one pair at a time, and answers yes or no for each. A yes adds a connection between the two. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description: 'Body of the first step of the Dyad Census walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.dyadCensus.subjectTitle',
    defaultMessage: 'Choose who is paired',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.dyadCensus.subjectBody',
    defaultMessage:
      'Pick the node type whose members are paired on this stage. Every person of this type already in the interview is included. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.dyadCensus.filterTitle',
    defaultMessage: 'Pair only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.dyadCensus.filterBody',
    defaultMessage:
      'Switch this on and add rules to pair only the people who match them. The number of pairs grows quickly with each person, so a filter also shortens the stage.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.dyadCensus.promptsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the prompts of a Dyad Census stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.dyadCensus.promptsBody',
    defaultMessage:
      'Each prompt is one yes-or-no question asked about every pair, such as whether the two know each other. Add a prompt, write its question, and pick the edge type a yes creates between the two people.',
    description:
      'Body of the walkthrough step about the prompts of a Dyad Census stage. An edge type is a kind of connection between two people, such as friendship.',
  },
});

const census = (stage: Stage) => stageOfType(stage, 'DyadCensus');

/** The Dyad Census editor, one step per setting, in the editor's order. */
export const dyadCensusWalkthrough: StageWalkthrough = [
  introStep('DyadCensus', messages.introTitle, messages.introBody),
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
  ...closingSteps,
];
