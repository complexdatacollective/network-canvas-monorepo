import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import {
  LocalizedInputField,
  LocalizedRichTextField,
} from '../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import BuilderSection from '../BuilderSection.tsx';

/** The schema keeps a stage's introduction in one object with two parts. */
const TITLE_FIELD = 'introductionPanel.title';
const TEXT_FIELD = 'introductionPanel.text';

export const introductionMessages = defineMessages({
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
 * What the participant reads above an Ego Form's questions.
 *
 * Not a capability: an Ego Form requires an introduction, so there is nothing
 * here to switch off. The title is required; the text is not, because a panel
 * with only a title is a complete introduction (published protocols use one to
 * open a form with its heading alone). Clearing the text removes it from the
 * stage rather than storing it empty.
 */
export default function IntroductionSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(introductionMessages.title)}
      description={intl.formatMessage(introductionMessages.description)}
    >
      <Field<typeof LocalizedInputField>
        name={TITLE_FIELD}
        component={LocalizedInputField}
        dynamicValues="stageText"
        label={intl.formatMessage(introductionMessages.headingLabel)}
        required={REQUIRED}
      />
      <Field<typeof LocalizedRichTextField>
        name={TEXT_FIELD}
        component={LocalizedRichTextField}
        dynamicValues="stageText"
        label={intl.formatMessage(introductionMessages.textLabel)}
      />
    </BuilderSection>
  );
}
