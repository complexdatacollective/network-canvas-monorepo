import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedRichTextField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { finishSessionMessages } from './finishSessionMessages.ts';

const FINISHED_CONTENT_FIELD = 'finishedContent';

/**
 * The text a participant reads once the interview has finished, heading
 * included, in either mode. It starts with wording Network Canvas supplies
 * in each of the protocol's languages that it has.
 */
export default function FinishedScreenSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.finishedTitle)}
      description={intl.formatMessage(
        finishSessionMessages.finishedDescription,
      )}
    >
      <Field<typeof LocalizedRichTextField>
        name={FINISHED_CONTENT_FIELD}
        component={LocalizedRichTextField}
        label={intl.formatMessage(finishSessionMessages.finishedTextLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
