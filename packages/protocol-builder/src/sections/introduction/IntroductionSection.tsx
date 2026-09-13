import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import RichTextField from '../../fields/RichTextField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import BuilderSection from '../BuilderSection.tsx';

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
      'Introduce the task before participants complete its forms.',
    description: 'Description of the task-introduction section.',
  },
  headingLabel: {
    id: 'protocolBuilder.introduction.headingLabel',
    defaultMessage: 'Title',
    description:
      'Label of the field holding the heading at the top of the introduction screen a participant reads.',
  },
  textLabel: {
    id: 'protocolBuilder.introduction.textLabel',
    defaultMessage: 'Introduction text',
    description:
      'Label of the field holding the prose a participant reads before this step of the interview begins.',
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
      <Field<typeof InputField>
        name={TITLE_FIELD}
        component={InputField}
        label={intl.formatMessage(messages.headingLabel)}
        required={REQUIRED}
        maxLength={TITLE_LIMIT}
      />
      <Field<typeof RichTextField>
        name={TEXT_FIELD}
        component={RichTextField}
        label={intl.formatMessage(messages.textLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
