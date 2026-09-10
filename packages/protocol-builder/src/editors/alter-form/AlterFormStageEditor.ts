import { formFields } from '../../sections/form-fields/formFields.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { introduction } from '../../sections/introduction/introduction.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';

/**
 * A form the participant fills in once for each person in their network.
 *
 * The same form as an ego form, asked repeatedly and about somebody else — so
 * the stage starts by saying which people it asks about: the node type it
 * collects into, and optionally a filter narrowing which of those nodes the
 * participant is asked about at all.
 */
export const alterFormStageEditor = defineStageEditor('AlterForm', [
  stageHeading({ documentation: 'per-alter-form' }),
  subjectPicker({ entity: 'node', filter: true }),
  introduction(),
  formFields({ subject: 'node' }),
  skipLogic(),
  interviewerGuidance(),
]);
