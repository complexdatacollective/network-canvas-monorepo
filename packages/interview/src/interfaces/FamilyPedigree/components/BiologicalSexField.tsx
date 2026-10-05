'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import {
  BIOLOGICAL_SEX_OPTIONS,
  type BiologicalSex,
} from '@codaco/protocol-validation';

import {
  biologicalSexMessages,
  BIOLOGICAL_SEX_HINT,
  BIOLOGICAL_SEX_QUESTION,
} from '../biologicalSexCopy';

type BiologicalSexFieldProps = {
  // Form field name; defaults to the pedigree node's biological-sex attribute.
  name?: string;
  // Whose sex is being recorded — the participant themselves ('self') or a
  // relative ('other'). Only the grammatical subject of the question changes;
  // the options, hint, and stored values are identical.
  subject?: 'self' | 'other';
  initialValue?: BiologicalSex;
};

/**
 * The single participant-facing biological-sex question, used wherever a person
 * is added to the pedigree so the wording, hint, and options never drift. Asks
 * for the sex recorded at birth (needed for sex-linked inheritance, distinct
 * from gender) and is required — "Don't know" is the answer when it is not
 * known, rather than leaving it blank.
 */
export default function BiologicalSexField({
  name = 'biologicalSex',
  subject = 'other',
  initialValue,
}: BiologicalSexFieldProps) {
  const intl = useAppIntl();
  return (
    <Field
      name={name}
      label={intl.formatMessage(BIOLOGICAL_SEX_QUESTION[subject])}
      component={RadioGroupField}
      options={BIOLOGICAL_SEX_OPTIONS.map(({ value }) => ({
        value,
        label: intl.formatMessage(biologicalSexMessages[value]),
      }))}
      hint={intl.formatMessage(BIOLOGICAL_SEX_HINT)}
      required
      initialValue={initialValue}
    />
  );
}
