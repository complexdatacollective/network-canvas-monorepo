import { formFields } from '../../sections/form-fields/formFields.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { introduction } from '../../sections/introduction/introduction.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { sharedWording } from '../../sections/supplied-wording/sharedWording.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';

/**
 * A form the participant fills in about themselves.
 *
 * The one form interface with no subject section: an ego form always collects
 * against the interview's ego, which the schema fixes rather than the
 * researcher authoring, so there is no type to choose and nothing to filter.
 * That is also why the form fields are told their subject is `ego` rather than
 * reading it from the stage — there is no `subject` in the document to read.
 *
 * Its introduction is the heading and text shown above the questions, so the
 * form itself has no title.
 */
export const egoFormStageEditor = defineStageEditor('EgoForm', [
  introduction(),
  formFields({ subject: 'ego' }),
  sharedWording('EgoForm'),
  skipLogic(),
  interviewerGuidance(),
]);
