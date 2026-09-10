import type { StageSection } from '../../editors/defineStageEditor.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import StageHeadingSection from './StageHeadingSection.tsx';

/**
 * The stage's name, with where it sits in the interview.
 *
 * Takes the interface's documentation SLUG rather than an address, so where
 * the documentation site lives stays one fact in `interfaces/documentation.ts`
 * rather than something every editor spells out.
 */
export const stageHeading =
  ({ documentation }: Readonly<{ documentation: string }>): StageSection =>
  () => (
    <StageHeadingSection
      documentationUrl={interfaceDocumentationUrl(documentation)}
    />
  );
