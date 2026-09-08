import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.introduction.title',
    defaultMessage: 'Task introduction',
    description:
      'Heading of the section where a researcher writes what a participant reads before this step of the interview begins.',
  },
  description: {
    id: 'protocolBuilder.introduction.description',
    defaultMessage:
      'Introduce this task to the participant before they start it.',
    description: 'Description of the task-introduction section.',
  },
  headingLabel: {
    id: 'protocolBuilder.introduction.headingLabel',
    defaultMessage: 'Introduction heading',
    description:
      'Label of the field holding the heading at the top of the introduction screen a participant reads.',
  },
  headingHint: {
    id: 'protocolBuilder.introduction.headingHint',
    defaultMessage: 'The heading shown at the top of the introduction screen.',
    description: 'Guidance under the introduction-heading field.',
  },
  headingPlaceholder: {
    id: 'protocolBuilder.introduction.headingPlaceholder',
    defaultMessage: 'Enter a heading...',
    description:
      'Placeholder shown in the empty introduction-heading field. The trailing dots are an ellipsis written as three full stops.',
  },
  textLabel: {
    id: 'protocolBuilder.introduction.textLabel',
    defaultMessage: 'Introduction text',
    description:
      'Label of the field holding the prose a participant reads before this step of the interview begins.',
  },
  textHint: {
    id: 'protocolBuilder.introduction.textHint',
    defaultMessage:
      'Explain what the participant is about to do. This is the only thing they will read before the task begins.',
    description: 'Guidance under the introduction-text field.',
  },
  textPlaceholder: {
    id: 'protocolBuilder.introduction.textPlaceholder',
    defaultMessage: 'Enter your introduction here...',
    description:
      'Placeholder shown in the empty introduction-text field. The trailing dots are an ellipsis written as three full stops.',
  },
});

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
export default function IntroductionSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
    >
      <ProtocolField<typeof InputField>
        name={TITLE_FIELD}
        component={InputField}
        label={intl.formatMessage(messages.headingLabel)}
        hint={intl.formatMessage(messages.headingHint)}
        placeholder={intl.formatMessage(messages.headingPlaceholder)}
        required
        maxLength={TITLE_LIMIT}
      />
      <ProtocolField<typeof RichTextField>
        name={TEXT_FIELD}
        component={RichTextField}
        label={intl.formatMessage(messages.textLabel)}
        hint={intl.formatMessage(messages.textHint)}
        placeholder={intl.formatMessage(messages.textPlaceholder)}
        required
      />
    </BuilderSection>
  );
}
