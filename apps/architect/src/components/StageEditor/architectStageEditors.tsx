import { defineStageEditor } from '@codaco/protocol-builder/editors/defineStageEditor';
import { interviewerGuidance } from '@codaco/protocol-builder/sections/interviewer-guidance/interviewerGuidance';
import { skipLogic } from '@codaco/protocol-builder/sections/skip-logic/skipLogic';

import StageLanguagesSection from './StageLanguagesSection';

/**
 * Architect's own stage editors, over the package's.
 *
 * The language chooser lists the protocol's languages, and Architect is where
 * they are changed, so its list is the Languages page's own list rather than
 * the package's read-only one.
 */
export const architectStageEditors = defineStageEditor('LanguageChooser', [
  () => <StageLanguagesSection />,
  skipLogic(),
  interviewerGuidance(),
]);
