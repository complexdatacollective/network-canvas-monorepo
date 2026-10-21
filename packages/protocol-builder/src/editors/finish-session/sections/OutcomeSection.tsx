import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { FINISH_OUTCOMES } from '@codaco/protocol-validation';

import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  finishOutcomeWords,
  finishSessionMessages,
} from './finishSessionMessages.ts';

const OUTCOME_FIELD = 'outcome';

/**
 * The outcome an interview that ends at this stage is recorded with.
 *
 * Every outcome ends the interview the same way; the outcome is what lets an
 * analyst tell the endings apart. Required, and never shown to a participant.
 */
export default function OutcomeSection() {
  const intl = useAppIntl();
  const options = useMemo<RichSelectOption[]>(
    () =>
      FINISH_OUTCOMES.map((value) => ({
        value,
        label: intl.formatMessage(finishOutcomeWords[value].label),
        description: intl.formatMessage(finishOutcomeWords[value].description),
      })),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.outcomeTitle)}
      description={intl.formatMessage(finishSessionMessages.outcomeDescription)}
    >
      <Field<typeof RichSelectGroupField>
        name={OUTCOME_FIELD}
        component={RichSelectGroupField}
        label={intl.formatMessage(finishSessionMessages.outcomeLabel)}
        options={options}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
