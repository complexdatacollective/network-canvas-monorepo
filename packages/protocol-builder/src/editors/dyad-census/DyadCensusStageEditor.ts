import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { introduction } from '../../sections/introduction/introduction.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { dyadCensusPrompts } from './sections/dyadCensusPrompts.tsx';

/**
 * The stage a participant is walked through every pair of people in.
 *
 * The introduction comes before the prompts because that is the order the
 * participant meets them in: a census works through every possible pair, which
 * is a long task nobody should arrive at unexplained — so the protocol schema
 * requires the introduction, and this editor puts it where it happens.
 */
export const dyadCensusStageEditor = defineStageEditor('DyadCensus', [
  stageHeading({ documentation: 'dyad-census' }),
  subjectPicker({ entity: 'node', filter: true }),
  introduction(),
  dyadCensusPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);
