import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { alterLimitsSectionTitle } from '../../sections/alter-limits/AlterLimitsSection.tsx';
import { formFieldsMessages } from '../../sections/form-fields/FormFieldsSection.tsx';
import { nodePanelsMessages } from '../../sections/panels/NodePanelsSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.introTitle',
    defaultMessage: 'Setting up a Name Generator (using forms) stage',
    description:
      'Title of the first step of a guided walkthrough of the Name Generator stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.introBody',
    defaultMessage:
      'On a Name Generator, the participant answers a question by adding people, filling in a short form for each one. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description: 'Body of the first step of the Name Generator walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.subjectTitle',
    defaultMessage: 'Choose who is added',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.subjectBody',
    defaultMessage:
      'Pick the node type this stage creates, such as a person or a place. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  formTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.formTitle',
    defaultMessage: 'Write the form for each person',
    description:
      'Title of the walkthrough step about the form filled in for each node.',
  },
  formBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.formBody',
    defaultMessage:
      'Each time the participant adds someone, this form opens. Give it a title, then add at least one field: each field pairs a variable with the control used to answer it, such as a name box.',
    description:
      'Body of the walkthrough step about the form filled in for each node.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.promptsTitle',
    defaultMessage: 'Write the prompts',
    description:
      'Title of the walkthrough step about the prompts. A prompt is one question the participant answers on the stage.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.promptsBody',
    defaultMessage:
      'A prompt is the question the participant answers, such as “Who do you talk to about important matters?”. Add at least one; with several, the participant moves through them in order. A prompt can also set values on everyone named under it.',
    description:
      'Body of the walkthrough step about the prompts. The quoted question is an example and may be translated.',
  },
  panelsTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.panelsTitle',
    defaultMessage: 'Offer people to add from a list',
    description: 'Title of the walkthrough step about side panels.',
  },
  panelsBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.panelsBody',
    defaultMessage:
      'Switch this on to show up to two lists beside the prompt, holding people named earlier in the interview or listed in a data file. The participant drags someone from a list instead of adding them again.',
    description: 'Body of the walkthrough step about side panels.',
  },
  limitsTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.limitsTitle',
    defaultMessage: 'Limit how many people are named',
    description: 'Title of the walkthrough step about nomination limits.',
  },
  limitsBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.limitsBody',
    defaultMessage:
      'Switch this on to set a minimum or maximum number of people across the whole stage. The participant cannot continue below the minimum, and cannot add more once the maximum is reached.',
    description: 'Body of the walkthrough step about nomination limits.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.nameGenerator.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.nameGenerator.wordingBody',
    defaultMessage:
      'Network Canvas supplies the messages shown on this stage, such as the notice when the minimum has not been reached. Switch this on to write your own.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
});

const nameGenerator = (stage: Stage) => stageOfType(stage, 'NameGenerator');

export const nameGeneratorWalkthrough: StageWalkthrough = [
  introStep('NameGenerator', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => nameGenerator(stage)?.subject?.type !== undefined,
  },
  {
    id: 'form',
    title: messages.formTitle,
    body: messages.formBody,
    target: { section: formFieldsMessages.title },
    done: (stage) => (nameGenerator(stage)?.form?.fields?.length ?? 0) > 0,
  },
  {
    id: 'prompts',
    title: messages.promptsTitle,
    body: messages.promptsBody,
    target: { section: promptsSectionMessages.title },
    done: (stage) => (nameGenerator(stage)?.prompts?.length ?? 0) > 0,
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
