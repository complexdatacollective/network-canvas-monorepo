import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import RichTextField from '../../../fields/RichTextField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';

/**
 * The one instruction shown on the canvas while the participant draws their
 * family. A single string rather than the shared rotating prompt list, because
 * the pedigree shows the same instruction for the whole stage.
 */
export default function PedigreePromptSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection title={intl.formatMessage(messages.promptTitle)}>
      <Field<typeof RichTextField>
        name="prompt"
        component={RichTextField}
        label={intl.formatMessage(messages.promptLabel)}
        hint={intl.formatMessage(messages.promptHint)}
        placeholder={intl.formatMessage(messages.promptPlaceholder)}
        singleLine
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
