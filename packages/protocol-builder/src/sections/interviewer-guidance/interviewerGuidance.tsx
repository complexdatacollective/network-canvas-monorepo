import type { StageSection } from '../../editors/defineStageEditor.tsx';
import InterviewerGuidanceSection from './InterviewerGuidanceSection.tsx';

/** What the interviewer is told to do while this stage is on screen. */
export const interviewerGuidance = (): StageSection => () => (
  <InterviewerGuidanceSection />
);
