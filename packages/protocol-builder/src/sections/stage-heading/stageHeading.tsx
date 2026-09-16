import type { StageSection } from '../../editors/defineStageEditor.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import StageHeadingSection from './StageHeadingSection.tsx';

export type StageHeadingOptions = Readonly<{
  /** The interface's documentation slug. */
  documentation: string;
}>;

/**
 * The stage's name, with where it sits in the interview.
 *
 * Takes the interface's documentation SLUG rather than an address, so where
 * the documentation site lives stays one fact in `interfaces/documentation.ts`
 * rather than something every editor spells out.
 */
export const stageHeading = ({
  documentation,
}: StageHeadingOptions): StageSection => {
  const documentationUrl = interfaceDocumentationUrl(documentation);
  return () => <StageHeadingSection documentationUrl={documentationUrl} />;
};
