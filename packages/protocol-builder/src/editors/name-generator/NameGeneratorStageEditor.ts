import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { alterLimits } from './sections/alter-limits/alterLimits.tsx';
import { nameGeneratorFormFields } from './sections/form-fields/nameGeneratorFormFields.tsx';
import { nodePanels } from './sections/panels/nodePanels.tsx';
import { useAutoNameFromPanels } from './sections/panels/useAutoNameFromPanels.ts';
import { nameGeneratorPrompts } from './sections/prompts/nameGeneratorPrompts.tsx';

/**
 * The name generator a participant names people with, one form at a time.
 *
 * Five decisions, in the order a researcher makes them: which kind of person
 * this stage creates, what is recorded about each one, what the stage asks,
 * what it offers beside the question, and how many people it may name. The
 * form comes before the prompts because it describes the people the prompts
 * ask for — and because a prompt's own attribute stamps are chosen from what
 * the form does NOT already collect.
 *
 * The heading is qualified by the side panels, because a generator offering
 * the people named so far is a different stage from one that offers nothing,
 * and the name proposed to a new stage says so.
 */
export const nameGeneratorStageEditor = defineStageEditor('NameGenerator', [
  stageHeading({
    documentation: 'name-generator-using-forms',
    autoName: useAutoNameFromPanels,
  }),
  subjectPicker({ entity: 'node' }),
  nameGeneratorFormFields(),
  nameGeneratorPrompts(),
  nodePanels(),
  alterLimits(),
  skipLogic(),
  interviewerGuidance(),
]);
