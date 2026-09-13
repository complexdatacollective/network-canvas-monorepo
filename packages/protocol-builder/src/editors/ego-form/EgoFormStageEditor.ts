import { formFields } from '../../sections/form-fields/formFields.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { introduction } from '../../sections/introduction/introduction.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';

/**
 * A form the participant fills in about themselves.
 *
 * The one form interface with no subject section: an ego form always collects
 * against the interview's ego, which the schema fixes rather than the
 * researcher authoring, so there is no type to choose and nothing to filter.
 * That is also why the form fields are told their subject is `ego` rather than
 * reading it from the stage — there is no `subject` in the document to read.
 */
export const egoFormStageEditor = defineStageEditor('EgoForm', [
  stageHeading({ documentation: 'ego-form' }),
  introduction(),
  formFields({ subject: 'ego' }),
  skipLogic(),
  interviewerGuidance(),
]);
