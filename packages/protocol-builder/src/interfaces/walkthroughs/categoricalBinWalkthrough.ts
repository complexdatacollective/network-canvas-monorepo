import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { binBehavioursMessages } from '../../sections/bin-behaviours/binBehavioursMessages.ts';
import {
  INTERACTION_MODE_FIELD,
  REQUIRE_COMPLETE_PLACEMENT_FIELD,
} from '../../sections/bin-behaviours/BinBehavioursSection.tsx';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.introTitle',
    defaultMessage: 'Setting up a Categorical Bin stage',
    description:
      'Title of the first step of a guided walkthrough of the Categorical Bin stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.introBody',
    defaultMessage:
      'On a Categorical Bin stage, the participant sorts the people they have named into bins, one bin for each option of a question, such as where they met. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the Categorical Bin walkthrough. A bin is one of the groups the participant sorts people into.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.subjectTitle',
    defaultMessage: 'Choose who is sorted',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.subjectBody',
    defaultMessage:
      'Pick the node type the participant sorts on this stage. Every person of this type already in the interview is shown. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.filterTitle',
    defaultMessage: 'Show only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.filterBody',
    defaultMessage:
      'Switch this on and add rules to sort only the people who match them, such as only those the participant sees weekly. Leave it off to show everyone of this type.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.promptsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the prompts of a Categorical Bin stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.promptsBody',
    defaultMessage:
      'Each prompt is one question, answered by dragging people into bins. Add a prompt, write its question, and pick a categorical variable: each of its options becomes a bin. A prompt can also add an "other" bin that asks the participant to type an answer.',
    description:
      'Body of the walkthrough step about the prompts of a Categorical Bin stage. A categorical variable is one whose answers come from a fixed list of options.',
  },
  interactionTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.interactionTitle',
    defaultMessage: 'Choose how people are placed',
    description:
      'Title of the walkthrough step about how the participant places people into bins.',
  },
  interactionBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.interactionBody',
    defaultMessage:
      'The participant either drags each person onto a bin, or taps a bin to place the person who is selected. Leave it as it is to use dragging.',
    description:
      'Body of the walkthrough step about how the participant places people into bins.',
  },
  completeTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.completeTitle',
    defaultMessage: 'Decide whether everyone must be placed',
    description:
      'Title of the walkthrough step about requiring every person to be placed in a bin.',
  },
  completeBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.completeBody',
    defaultMessage:
      'With this on, the participant cannot move on from a prompt until every person is in a bin. With it off, they can continue with people left unplaced.',
    description:
      'Body of the walkthrough step about requiring every person to be placed in a bin.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.categoricalBin.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.categoricalBin.wordingBody',
    defaultMessage:
      'Network Canvas supplies some of the words on this stage, such as the message shown when people are still unplaced. Words shared by every Categorical Bin stage change for all of them.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
});

const bin = (stage: Stage) => stageOfType(stage, 'CategoricalBin');

/** The Categorical Bin editor, one step per setting, in the editor's order. */
export const categoricalBinWalkthrough: StageWalkthrough = [
  introStep('CategoricalBin', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => bin(stage)?.subject?.type !== undefined,
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
    done: (stage) => (bin(stage)?.prompts?.length ?? 0) > 0,
  },
  {
    id: 'interactionMode',
    title: messages.interactionTitle,
    body: messages.interactionBody,
    target: {
      section: binBehavioursMessages.title,
      field: INTERACTION_MODE_FIELD,
    },
    optional: true,
  },
  {
    id: 'requireCompletePlacement',
    title: messages.completeTitle,
    body: messages.completeBody,
    target: {
      section: binBehavioursMessages.title,
      field: REQUIRE_COMPLETE_PLACEMENT_FIELD,
    },
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
