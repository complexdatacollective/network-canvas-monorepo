import { formFields } from '../../sections/form-fields/formFields.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
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
 * Unlike the per-alter and per-relationship forms, its form has a title: the
 * interview shows it as the heading above the participant's questions.
 */
export const egoFormStageEditor = defineStageEditor('EgoForm', [
  formFields({ subject: 'ego', hasTitle: true }),
  skipLogic(),
  interviewerGuidance(),
]);
