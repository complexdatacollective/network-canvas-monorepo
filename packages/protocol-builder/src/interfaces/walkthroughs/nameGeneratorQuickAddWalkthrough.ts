import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { quickAddSectionTitle } from '../../editors/name-generator-quick-add/sections/QuickAddSection.tsx';
import { alterLimitsSectionTitle } from '../../sections/alter-limits/AlterLimitsSection.tsx';
import { nodePanelsMessages } from '../../sections/panels/NodePanelsSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.introTitle',
    defaultMessage: 'Setting up a Name Generator (quick add) stage',
    description:
      'Title of the first step of a guided walkthrough of the quick-add Name Generator stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.introBody',
    defaultMessage:
      'On this stage, the participant answers a question by typing names into a single box, one at a time. Each name adds a person straight away, with no form to fill in. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the quick-add Name Generator walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.subjectTitle',
    defaultMessage: 'Choose who is added',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.subjectBody',
    defaultMessage:
      'Pick the node type this stage creates, such as a person or a place. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  quickAddTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.quickAddTitle',
    defaultMessage: 'Choose where names are saved',
    description:
      'Title of the walkthrough step about the attribute the quick-add box fills in.',
  },
  quickAddBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.quickAddBody',
    defaultMessage:
      'Whatever the participant types in the box is saved in this text variable, which is usually a name. Pick one, or create one here.',
    description:
      'Body of the walkthrough step about the attribute the quick-add box fills in.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.promptsTitle',
    defaultMessage: 'Write the prompts',
    description:
      'Title of the walkthrough step about the prompts. A prompt is one question the participant answers on the stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.promptsBody',
    defaultMessage:
      'A prompt is the question the participant answers, such as “Who do you talk to about important matters?”. Add at least one; with several, the participant moves through them in order. A prompt can also set values on everyone named under it.',
    description:
      'Body of the walkthrough step about the prompts. The quoted question is an example and may be translated.',
  },
  panelsTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.panelsTitle',
    defaultMessage: 'Offer people to add from a list',
    description: 'Title of the walkthrough step about side panels.',
  },
  panelsBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.panelsBody',
    defaultMessage:
      'Switch this on to show up to two lists beside the prompt, holding people named earlier in the interview or listed in a data file. The participant drags someone from a list instead of typing their name again.',
    description: 'Body of the walkthrough step about side panels.',
  },
  limitsTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.limitsTitle',
    defaultMessage: 'Limit how many people are named',
    description: 'Title of the walkthrough step about nomination limits.',
  },
  limitsBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.limitsBody',
    defaultMessage:
      'Switch this on to set a minimum or maximum number of people across the whole stage. The participant cannot continue below the minimum, and cannot add more once the maximum is reached.',
    description: 'Body of the walkthrough step about nomination limits.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.nameGeneratorQuickAdd.wordingBody',
    defaultMessage:
      'Network Canvas supplies the words on this stage, such as the hint shown in the empty name box. Switch this on to write your own.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
});

const quickAddStage = (stage: Stage) =>
  stageOfType(stage, 'NameGeneratorQuickAdd');

export const nameGeneratorQuickAddWalkthrough: StageWalkthrough = [
  introStep('NameGeneratorQuickAdd', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => quickAddStage(stage)?.subject?.type !== undefined,
  },
  {
    id: 'quickAdd',
    title: messages.quickAddTitle,
    body: messages.quickAddBody,
    target: { section: quickAddSectionTitle },
    done: (stage) => (quickAddStage(stage)?.quickAdd ?? '') !== '',
  },
  {
    id: 'prompts',
    title: messages.promptsTitle,
    body: messages.promptsBody,
    target: { section: promptsSectionMessages.title },
    done: (stage) => (quickAddStage(stage)?.prompts?.length ?? 0) > 0,
  },
  {
    id: 'panels',
    title: messages.panelsTitle,
    body: messages.panelsBody,
    target: { section: nodePanelsMessages.title },
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
