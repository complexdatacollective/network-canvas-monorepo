import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedRichTextField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';

/**
 * The one instruction shown on the canvas while the participant draws their
 * family, written in each of the protocol's languages. One localized string
 * rather than the shared rotating prompt list, because
 * building the family is one step with one instruction. The questions asked
 * once it is drawn are the nomination prompts, which are a list of their own
 * (`NominationPromptsSection`).
 */
export default function PedigreePromptSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection title={intl.formatMessage(messages.promptTitle)}>
      <Field<typeof LocalizedRichTextField>
        name="prompt"
        component={LocalizedRichTextField}
        label={intl.formatMessage(messages.promptLabel)}
        hint={intl.formatMessage(messages.promptHint)}
        placeholder={intl.formatMessage(messages.promptPlaceholder)}
        singleLine
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
