import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import {
  FIELDS_PATH,
  formFieldsMessages,
} from '../../sections/form-fields/FormFieldsSection.tsx';
import {
  introductionMessages,
  TEXT_FIELD,
  TITLE_FIELD,
} from '../../sections/introduction/IntroductionSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import {
  closingSteps,
  introStep,
  stageOfType,
  hasText,
} from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.egoForm.introTitle',
    defaultMessage: 'Setting up an Ego Form stage',
    description:
      'Title of the first step of a guided walkthrough of the Ego Form stage editor. Ego Form is the name of an interface; a stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.egoForm.introBody',
    defaultMessage:
      'An Ego Form asks the participant questions about themselves, such as their age or where they live. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the Ego Form walkthrough. Ego is the participant being interviewed.',
  },
  headingTitle: {
    id: 'protocolBuilder.walkthrough.egoForm.headingTitle',
    defaultMessage: 'Give the form a heading',
    description:
      'Title of the walkthrough step about the heading shown above the questions.',
  },
  headingBody: {
    id: 'protocolBuilder.walkthrough.egoForm.headingBody',
    defaultMessage:
      'The heading is shown at the top of the screen, above the questions. Every Ego Form needs one.',
    description:
      'Body of the walkthrough step about the heading shown above the questions.',
  },
  textTitle: {
    id: 'protocolBuilder.walkthrough.egoForm.textTitle',
    defaultMessage: 'Introduce the questions',
    description:
      'Title of the walkthrough step about the introduction text shown above the questions.',
  },
  textBody: {
    id: 'protocolBuilder.walkthrough.egoForm.textBody',
    defaultMessage:
      'This text appears under the heading, before the first question. Use it to say what the questions are about, or leave it empty to show the heading alone.',
    description:
      'Body of the walkthrough step about the introduction text shown above the questions.',
  },
  fieldsTitle: {
    id: 'protocolBuilder.walkthrough.egoForm.fieldsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the questions the form asks.',
  },
  fieldsBody: {
    id: 'protocolBuilder.walkthrough.egoForm.fieldsBody',
    defaultMessage:
      'Add a question for each thing to record about the participant. Each question saves its answer in a variable and is answered with the control you pick, such as a text box or a list of options. Drag questions to change the order they are asked in.',
    description:
      'Body of the walkthrough step about the questions the form asks. A variable is a named piece of data recorded about the participant.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.egoForm.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.egoForm.wordingBody',
    defaultMessage:
      'Network Canvas supplies the few words the form shows on its own, such as the hint to scroll for more questions. They are shared by every Ego Form stage in the protocol, so a change here applies to all of them.',
    description:
      'Body of the walkthrough step about the wording Network Canvas supplies for the stage.',
  },
});

const egoForm = (stage: Stage) => stageOfType(stage, 'EgoForm');

/** The Ego Form editor, one step per setting, in the editor's order. */
export const egoFormWalkthrough: StageWalkthrough = [
  introStep('EgoForm', messages.introTitle, messages.introBody),
  {
    id: 'heading',
    title: messages.headingTitle,
    body: messages.headingBody,
    target: { section: introductionMessages.title, field: TITLE_FIELD },
    done: (stage) => hasText(egoForm(stage)?.introductionPanel?.title),
  },
  {
    id: 'text',
    title: messages.textTitle,
    body: messages.textBody,
    target: { section: introductionMessages.title, field: TEXT_FIELD },
    optional: true,
  },
  {
    id: 'fields',
    title: messages.fieldsTitle,
    body: messages.fieldsBody,
    target: { section: formFieldsMessages.title, field: FIELDS_PATH },
    done: (stage) => (egoForm(stage)?.form?.fields?.length ?? 0) > 0,
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
