import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.introTitle',
    defaultMessage: 'Setting up a Tie-Strength Census stage',
    description:
      'Title of the first step of a guided walkthrough of the Tie-Strength Census stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.introBody',
    defaultMessage:
      'On a Tie-Strength Census stage, the participant is shown every pair of the people they have named, one pair at a time, and rates how strong their relationship is, or says there is none. Each rating, other than none, adds a connection between the two people that stores the rating. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description:
      'Body of the first step of the Tie-Strength Census walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.subjectTitle',
    defaultMessage: 'Choose who is paired',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.subjectBody',
    defaultMessage:
      'Pick the node type whose members are paired on this stage. Every person of this type already in the interview is included. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.filterTitle',
    defaultMessage: 'Pair only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.filterBody',
    defaultMessage:
      'Switch this on and add rules to pair only the people who match them. The number of pairs grows quickly with each person, so a filter also shortens the stage.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.promptsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the prompts of a Tie-Strength Census stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.tieStrengthCensus.promptsBody',
    defaultMessage:
      'Each prompt is one question asked about every pair, such as how close the two are. Add a prompt, write its question, and pick the edge type an answer creates. Then pick an ordinal variable of that edge type, whose options are the points of the scale, and write the answer that means there is no connection.',
    description:
      'Body of the walkthrough step about the prompts of a Tie-Strength Census stage. An edge type is a kind of connection between two people, such as friendship. An ordinal variable is one whose answers come from an ordered list of options.',
  },
});

const census = (stage: Stage) => stageOfType(stage, 'TieStrengthCensus');

/** The Tie-Strength Census editor, one step per setting, in the editor's order. */
export const tieStrengthCensusWalkthrough: StageWalkthrough = [
  introStep('TieStrengthCensus', messages.introTitle, messages.introBody),
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
