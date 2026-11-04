import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import {
  FIELDS_PATH,
  formFieldsMessages,
} from '../../sections/form-fields/FormFieldsSection.tsx';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.alterForm.introTitle',
    defaultMessage: 'Setting up a Per Alter Form stage',
    description:
      'Title of the first step of a guided walkthrough of the Per Alter Form stage editor. Per Alter Form is the name of an interface; a stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.alterForm.introBody',
    defaultMessage:
      'A Per Alter Form asks the same questions about each person the participant has already named, one person at a time. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description: 'Body of the first step of the Per Alter Form walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.alterForm.subjectTitle',
    defaultMessage: 'Choose who the form is about',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.alterForm.subjectBody',
    defaultMessage:
      'Pick the node type the participant answers questions about. The form is shown once for each person of this type in the network. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.alterForm.filterTitle',
    defaultMessage: 'Ask about only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.alterForm.filterBody',
    defaultMessage:
      'Switch this on and add rules to show the form only for the people that match them, such as those the participant sees every week. Without a filter, the form is shown for everyone of the chosen type.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  fieldsTitle: {
    id: 'protocolBuilder.walkthrough.alterForm.fieldsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the questions the form asks.',
  },
  fieldsBody: {
    id: 'protocolBuilder.walkthrough.alterForm.fieldsBody',
    defaultMessage:
      'Add a question for each thing to record about a person. Each question saves its answer in a variable and is answered with the control you pick, such as a text box or a list of options. Drag questions to change the order they are asked in.',
    description:
      'Body of the walkthrough step about the questions the form asks. A variable is a named piece of data recorded about each person.',
  },
});

const alterForm = (stage: Stage) => stageOfType(stage, 'AlterForm');

/** The Per Alter Form editor, one step per section, in the editor's order. */
export const alterFormWalkthrough: StageWalkthrough = [
  introStep('AlterForm', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => alterForm(stage)?.subject?.type !== undefined,
  },
  {
    id: 'filter',
    title: messages.filterTitle,
    body: messages.filterBody,
    target: { section: networkFilterSectionTitle },
    optional: true,
  },
  {
    id: 'fields',
    title: messages.fieldsTitle,
    body: messages.fieldsBody,
    target: { section: formFieldsMessages.title, field: FIELDS_PATH },
    done: (stage) => (alterForm(stage)?.form?.fields?.length ?? 0) > 0,
  },
  ...closingSteps,
];
