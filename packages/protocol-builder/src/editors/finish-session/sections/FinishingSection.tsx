import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { finishSessionMessages } from './finishSessionMessages.ts';

const FINISH_LABEL_FIELD = 'finishLabel';
const FINISH_CONFIRMATION_FIELD = 'finishConfirmation';
const FINISHED_NOTICE_FIELD = 'finishedNotice';
const FINISH_FAILED_FIELD = 'finishFailed';

/**
 * The words a participant sees while finishing the interview: the button, the
 * question it asks, the notice once the interview has ended, and what it says
 * when ending fails. Each is required, and starts with wording Network Canvas
 * supplies in each of the protocol's languages that it has.
 */
export default function FinishingSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.finishingTitle)}
      description={intl.formatMessage(
        finishSessionMessages.finishingDescription,
      )}
    >
      <Field<typeof LocalizedInputField>
        name={FINISH_LABEL_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(finishSessionMessages.finishLabelLabel)}
        required={REQUIRED}
      />
      <Field<typeof LocalizedInputField>
        name={FINISH_CONFIRMATION_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(
          finishSessionMessages.finishConfirmationLabel,
        )}
        required={REQUIRED}
      />
      <Field<typeof LocalizedInputField>
        name={FINISHED_NOTICE_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(finishSessionMessages.finishedNoticeLabel)}
        hint={intl.formatMessage(finishSessionMessages.finishedNoticeHint)}
        required={REQUIRED}
      />
      <Field<typeof LocalizedInputField>
        name={FINISH_FAILED_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(finishSessionMessages.finishFailedLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
