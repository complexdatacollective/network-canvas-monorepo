import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import {
  completeness,
  pedigreePrompt,
  nodeConfiguration,
  personFormFields,
  relationships,
} from './sections/familyPedigreeSections.tsx';

/**
 * The stage a participant draws their family on: they select anyone on the
 * canvas and add that person's parent, sibling, partner or child, describing
 * each new person in a side panel.
 *
 * The sections run in the order a researcher decides them: which node type
 * people are, where the interface records what it asks about each person, how
 * relationships are recorded, the instruction shown on the canvas, and any
 * further questions about each person.
 */
export const familyPedigreeStageEditor = defineStageEditor('FamilyPedigree', [
  subjectPicker({ entity: 'node' }),
  nodeConfiguration(),
  relationships(),
  completeness(),
  pedigreePrompt(),
  personFormFields(),
  skipLogic(),
  interviewerGuidance(),
]);
