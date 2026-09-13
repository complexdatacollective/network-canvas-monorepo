import type { StageSection } from '../../editors/defineStageEditor.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import StageHeadingSection, {
  type StageHeadingSectionProps,
} from './StageHeadingSection.tsx';

export type StageHeadingOptions = Readonly<{
  /** The interface's documentation slug. */
  documentation: string;
  /**
   * What a proposed name is derived from, for an interface whose stages are
   * named after something more than their type.
   *
   * A HOOK rather than a value, because what the name is derived from is the
   * draft: a name generator is named for the side panels beside it, and those
   * live in the stage form, which exists only inside the editor. Interfaces
   * that have nothing to add to their type name leave it out.
   */
  autoName?: () => StageHeadingSectionProps['autoName'];
}>;

/**
 * The stage's name, with where it sits in the interview.
 *
 * Takes the interface's documentation SLUG rather than an address, so where
 * the documentation site lives stays one fact in `interfaces/documentation.ts`
 * rather than something every editor spells out.
 *
 * Two headings rather than one that reads `autoName` conditionally: which of
 * them an interface gets is settled when the editor is defined and never
 * changes afterwards, and a hook cannot be called only sometimes.
 */
export const stageHeading = ({
  documentation,
  autoName,
}: StageHeadingOptions): StageSection => {
  const documentationUrl = interfaceDocumentationUrl(documentation);
  if (autoName === undefined) {
    return () => <StageHeadingSection documentationUrl={documentationUrl} />;
  }
  return function StageHeadingWithProposedName() {
    return (
      <StageHeadingSection
        documentationUrl={documentationUrl}
        autoName={autoName()}
      />
    );
  };
};
