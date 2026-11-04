import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import {
  FIELDS_PATH,
  formFieldsMessages,
} from '../../sections/form-fields/FormFieldsSection.tsx';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { edgeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.introTitle',
    defaultMessage: 'Setting up a Per Alter Edge Form stage',
    description:
      'Title of the first step of a guided walkthrough of the Per Alter Edge Form stage editor. Per Alter Edge Form is the name of an interface; a stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.introBody',
    defaultMessage:
      'A Per Alter Edge Form asks the same questions about each connection the participant has already recorded, one connection at a time. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description:
      'Body of the first step of the Per Alter Edge Form walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.subjectTitle',
    defaultMessage: 'Choose which connections the form is about',
    description: 'Title of the walkthrough step about the edge type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.subjectBody',
    defaultMessage:
      'Pick the edge type the participant answers questions about. The form is shown once for each connection of this type in the network. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the edge type. An edge is a connection between two members of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.filterTitle',
    defaultMessage: 'Ask about only some connections',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.filterBody',
    defaultMessage:
      'Switch this on and add rules to show the form only for the connections that match them. Without a filter, the form is shown for every connection of the chosen type.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  fieldsTitle: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.fieldsTitle',
    defaultMessage: 'Write the questions',
    description:
      'Title of the walkthrough step about the questions the form asks.',
  },
  fieldsBody: {
    id: 'protocolBuilder.walkthrough.alterEdgeForm.fieldsBody',
    defaultMessage:
      'Add a question for each thing to record about a connection, such as how often the two people talk. Each question saves its answer in a variable and is answered with the control you pick. Drag questions to change the order they are asked in.',
    description:
      'Body of the walkthrough step about the questions the form asks. A variable is a named piece of data recorded about each connection.',
  },
});

const alterEdgeForm = (stage: Stage) => stageOfType(stage, 'AlterEdgeForm');

/** The Per Alter Edge Form editor, one step per section, in the editor's order. */
export const alterEdgeFormWalkthrough: StageWalkthrough = [
  introStep('AlterEdgeForm', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: edgeSubjectSectionTitle },
    done: (stage) => alterEdgeForm(stage)?.subject?.type !== undefined,
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
    done: (stage) => (alterEdgeForm(stage)?.form?.fields?.length ?? 0) > 0,
  },
  ...closingSteps,
];
