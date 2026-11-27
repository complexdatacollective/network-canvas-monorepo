import { formDocument } from '../../sections/form-document/FormDocumentSection.tsx';
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
 * The form is one document: its heading and the text that introduces the
 * questions are written in it, among the fields. It shows no built-in wording
 * of its own.
 */
export const egoFormStageEditor = defineStageEditor('EgoForm', [
  formDocument({ subject: 'ego' }),
  skipLogic(),
  interviewerGuidance(),
]);
