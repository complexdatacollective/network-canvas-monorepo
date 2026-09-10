import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { introduction } from '../../sections/introduction/introduction.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { tieStrengthCensusPrompts } from './sections/tieStrengthCensusPrompts.tsx';

/**
 * The stage a participant rates every pair of people in.
 *
 * The same composition as the Dyad Census, and for the same reason: both walk
 * the participant through every possible pair, so both require the screen that
 * explains what is about to happen. They differ only in what an answer records
 * — a connection, or a connection and how strong it is.
 */
export const tieStrengthCensusStageEditor = defineStageEditor(
  'TieStrengthCensus',
  [
    stageHeading({ documentation: 'tie-strength-census' }),
    subjectPicker({ entity: 'node', filter: true }),
    introduction(),
    tieStrengthCensusPrompts(),
    skipLogic(),
    interviewerGuidance(),
  ],
);
