import InputField from '@codaco/fresco-ui/form/fields/InputField';

import RichTextField from '../fields/RichTextField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection from './BuilderSection.tsx';

/** The schema keeps a stage's introduction in one object with two parts. */
const TITLE_FIELD = 'introductionPanel.title';
const TEXT_FIELD = 'introductionPanel.text';

/**
 * The introduction is a screen the participant reads before the task starts,
 * so its heading is a heading rather than a label of unbounded length.
 */
const TITLE_LIMIT = 50;

export type IntroductionCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  titleLabel: string;
  titleHint: string;
  titlePlaceholder: string;
  textLabel: string;
  textHint: string;
  textPlaceholder: string;
}>;

const DEFAULT_COPY: IntroductionCopy = {
  sectionTitle: 'Task introduction',
  description: 'Introduce this task to the participant before they start it.',
  titleLabel: 'Introduction heading',
  titleHint: 'The heading shown at the top of the introduction screen.',
  titlePlaceholder: 'Enter a heading...',
  textLabel: 'Introduction text',
  textHint:
    'Explain what the participant is about to do. This is the only thing they will read before the task begins.',
  textPlaceholder: 'Enter your introduction here...',
};

export type IntroductionSectionProps = Readonly<{
  copy?: Partial<IntroductionCopy>;
}>;

/**
 * What the participant reads before this stage's task begins.
 *
 * Not a capability: every interface that has an introduction requires one, so
 * there is nothing here to switch off — a stage with half an introduction is
 * a stage the protocol schema refuses.
 *
 * Both fields are owned together for the same reason. They are the two halves
 * of one schema object that the researcher decides as one thing: an
 * introduction with a title and no text, or text under no title, is a stage
 * the protocol schema refuses. (A save writes each mounted path on its own, so
 * leaving one half unrendered would keep it rather than blank it — this is
 * about what the researcher can author, not about what the draft preserves.)
 */
export default function IntroductionSection({
  copy,
}: IntroductionSectionProps) {
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
        name={TEXT_FIELD}
        component={RichTextField}
        label={words.textLabel}
        hint={words.textHint}
        placeholder={words.textPlaceholder}
        required
      />
    </BuilderSection>
  );
}
