import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import {
  completeness,
  framing,
  nodeConfiguration,
  nominationPrompts,
  participantWording,
  pedigreePrompt,
  pedigreeSubject,
  personFormFields,
  relationships,
} from './sections/familyPedigreeSections.tsx';

/**
 * The stage a participant draws their family on: they select anyone on the
 * canvas and add that person's parent, sibling, partner or child, describing
 * each new person in a side panel.
 *
 * The sections run in the order a researcher decides them: which node type
 * people are, the instruction shown while the participant draws their family,
 * where the interface records what it asks about each person (and whether it
 * asks about gender identity), how relationships are recorded, the words used for
 * family members, any further questions about each person, how complete the
 * family must be, the words the participant sees while drawing, and the
 * questions asked of the whole family once it is drawn.
 */
export const familyPedigreeStageEditor = defineStageEditor('FamilyPedigree', [
  pedigreeSubject(),
  pedigreePrompt(),
  nodeConfiguration(),
  relationships(),
  framing(),
  personFormFields(),
  completeness(),
  participantWording(),
  nominationPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);
