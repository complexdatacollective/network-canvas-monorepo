import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { tieStrengthCensusPrompts } from './sections/tieStrengthCensusPrompts.tsx';

/**
 * The stage a participant rates every pair of people in.
 *
 * The same composition as the Dyad Census: both walk the participant through
 * every possible pair, and differ only in what an answer records — a
 * connection, or a connection and how strong it is.
 */
export const tieStrengthCensusStageEditor = defineStageEditor(
  'TieStrengthCensus',
  [
    subjectPicker({ entity: 'node', filter: true }),
    tieStrengthCensusPrompts(),
    skipLogic(),
    interviewerGuidance(),
  ],
);
