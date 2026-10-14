import { useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { finishSessionMessages } from './finishSessionMessages.ts';
import { useFinishMode } from './useFinishMode.ts';

const FINISH_LABEL_FIELD = 'finishLabel';
const FINISH_CONFIRMATION_FIELD = 'finishConfirmation';
const FINISH_FAILED_FIELD = 'finishFailed';

/**
 * Whether a localized setting is missing or blank in any language it has: the
 * stage cannot be saved like that, whichever mode it is in.
 */
const isUnfinished = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return true;
  const texts = Object.values(value);
  return (
    texts.length === 0 ||
    texts.some((text) => typeof text !== 'string' || text.trim() === '')
  );
};

/**
 * The words a participant sees while finishing the interview: the button, the
 * question it asks, and what it says when ending fails. Each is required, and
 * starts with wording Network Canvas supplies in each of the protocol's
 * languages that it has.
 *
 * Only a stage that asks participants to confirm asks the question, so that
 * field is absent in automatic mode, unless it was left blank: the stage still
 * keeps the question, and could not be saved without a way to fill it in. The
 * button stays: an automatic stage whose finishing fails offers it to try
 * again.
 */
export default function FinishingSection() {
  const intl = useAppIntl();
  const finishMode = useFinishMode();
  const { [FINISH_CONFIRMATION_FIELD]: confirmation } = useFormValue([
    FINISH_CONFIRMATION_FIELD,
  ] as const);
  // Once shown for repair it stays until the mode changes back, rather than
  // vanishing at the first character typed into it.
  const [keptToRepair, setKeptToRepair] = useState(false);
  const needsRepair = finishMode === 'automatic' && isUnfinished(confirmation);
  if (needsRepair && !keptToRepair) setKeptToRepair(true);
  if (finishMode === 'confirmation' && keptToRepair) setKeptToRepair(false);
  const asksToConfirm =
    finishMode === 'confirmation' || needsRepair || keptToRepair;

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
      {asksToConfirm && (
        <Field<typeof LocalizedInputField>
          name={FINISH_CONFIRMATION_FIELD}
          component={LocalizedInputField}
          label={intl.formatMessage(
            finishSessionMessages.finishConfirmationLabel,
          )}
          required={REQUIRED}
        />
      )}
      <Field<typeof LocalizedInputField>
        name={FINISH_FAILED_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(finishSessionMessages.finishFailedLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
