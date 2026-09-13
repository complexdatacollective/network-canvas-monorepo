import { formFields } from '../../sections/form-fields/formFields.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { introduction } from '../../sections/introduction/introduction.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';

/**
 * A form the participant fills in once for each relationship in their network.
 *
 * Identical in shape to the per-alter form, and different in what it is about:
 * its subject is an edge type, so its fields collect against the codebook of a
 * relationship rather than of a person, and its filter narrows which edges the
 * participant is asked about.
 */
export const alterEdgeFormStageEditor = defineStageEditor('AlterEdgeForm', [
  stageHeading({ documentation: 'per-alter-edge-form' }),
  subjectPicker({ entity: 'edge', filter: true }),
  introduction(),
  formFields({ subject: 'edge' }),
  skipLogic(),
  interviewerGuidance(),
]);
