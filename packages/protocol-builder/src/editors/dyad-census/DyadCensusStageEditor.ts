import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { dyadCensusPrompts } from './sections/dyadCensusPrompts.tsx';

/**
 * The stage a participant is walked through every pair of people in.
 *
 * A census works through every possible pair, which is a long task nobody
 * should arrive at unexplained; the explanation is an Information stage placed
 * before this one rather than a part of it.
 */
export const dyadCensusStageEditor = defineStageEditor('DyadCensus', [
  subjectPicker({ entity: 'node', filter: true }),
  dyadCensusPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);
