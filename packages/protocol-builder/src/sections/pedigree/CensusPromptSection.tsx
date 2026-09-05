import RichTextField from '../../fields/RichTextField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';

const CENSUS_PROMPT_FIELD = 'censusPrompt';

export type CensusPromptCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  placeholder: string;
}>;

const DEFAULT_COPY: CensusPromptCopy = {
  sectionTitle: 'Family-building prompt',
  description:
    'Write the question the participant answers while they build their family.',
  fieldLabel: 'Census prompt',
  fieldHint:
    'Shown throughout the family-building phase, so it should describe the whole task rather than one step of it.',
  placeholder: 'Enter your prompt...',
};

export type CensusPromptSectionProps = Readonly<{
  copy?: Partial<CensusPromptCopy>;
}>;

/**
 * The one question the pedigree asks while the participant builds their
 * family.
 *
 * Deliberately not the shared prompt list: a pedigree does not rotate through
 * prompts, it shows this one for the whole census, and the schema holds it as
 * a single string rather than an ordered array.
 */
export default function CensusPromptSection({
  copy,
}: CensusPromptSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof RichTextField>
        name={CENSUS_PROMPT_FIELD}
        component={RichTextField}
        singleLine
        label={words.fieldLabel}
        hint={words.fieldHint}
        placeholder={words.placeholder}
        required
      />
    </BuilderSection>
  );
}
