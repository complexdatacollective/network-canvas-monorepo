import InputField from '@codaco/fresco-ui/form/fields/InputField';

import RichTextField from '../../fields/RichTextField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';

/** The schema keeps this stage's explanation in one object with two parts. */
const TITLE_FIELD = 'explanationText.title';
const BODY_FIELD = 'explanationText.body';

/** A heading, so it has to read as one rather than as a paragraph. */
const TITLE_LIMIT = 50;

export type AnonymisationExplanationCopy = Readonly<{
  sectionTitle: string;
  description: string;
  titleLabel: string;
  titleHint: string;
  titlePlaceholder: string;
  bodyLabel: string;
  bodyHint: string;
  bodyPlaceholder: string;
}>;

const DEFAULT_COPY: AnonymisationExplanationCopy = {
  sectionTitle: 'Passphrase explanation',
  description:
    'Explain what the passphrase protects and what happens if it is lost, before the participant is asked to choose one.',
  titleLabel: 'Explanation heading',
  titleHint: 'The heading at the top of the screen that asks for a passphrase.',
  titlePlaceholder: 'This interview protects some of your answers',
  bodyLabel: 'Explanation',
  bodyHint:
    'Say which answers the passphrase protects, who can read them, and that the answers cannot be recovered without it. This is the only thing the participant reads before choosing one.',
  bodyPlaceholder:
    'Some of your answers are stored so that only you can unlock them. Choose a passphrase you will remember: without it, those answers cannot be read again.',
};

export type AnonymisationExplanationSectionProps = Readonly<{
  copy?: Partial<AnonymisationExplanationCopy>;
}>;

/**
 * What the participant is told before they choose a passphrase.
 *
 * Not a capability: an anonymisation stage without an explanation is a stage
 * that asks a participant for a secret and tells them nothing about it, and
 * the protocol schema refuses it. Both halves are owned together because they
 * are the two parts of one schema object — a section owning part of a nested
 * value has to render all of it, or the part it does not render is written
 * back over on save.
 */
export default function AnonymisationExplanationSection({
  copy,
}: AnonymisationExplanationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof InputField>
        name={TITLE_FIELD}
        component={InputField}
        label={words.titleLabel}
        hint={words.titleHint}
        placeholder={words.titlePlaceholder}
        required
        maxLength={TITLE_LIMIT}
      />
      <ProtocolField<typeof RichTextField>
        name={BODY_FIELD}
        component={RichTextField}
        label={words.bodyLabel}
        hint={words.bodyHint}
        placeholder={words.bodyPlaceholder}
        required
      />
    </BuilderSection>
  );
}
