import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { participantLanguages } from './sections/participantLanguages.tsx';

/**
 * The stage where a participant chooses which of the protocol's languages the
 * rest of their interview is shown in.
 *
 * The choices are the protocol's own languages, so they are shown rather than
 * configured, and a protocol written in one language offers that one.
 */
export const languageChooserStageEditor = defineStageEditor('LanguageChooser', [
  participantLanguages(),
  skipLogic(),
  interviewerGuidance(),
]);
