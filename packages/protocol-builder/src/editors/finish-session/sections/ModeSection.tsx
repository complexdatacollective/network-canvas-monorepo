import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { FINISH_MODES } from '@codaco/protocol-validation';

import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  finishModeWords,
  finishSessionMessages,
} from './finishSessionMessages.ts';

export const MODE_FIELD = 'mode';

/**
 * Whether participants confirm that they are finished, or the interview
 * finishes as soon as they reach this stage. Decides which of the other
 * sections' words a participant can see.
 */
export default function ModeSection() {
  const intl = useAppIntl();
  const options = useMemo<RichSelectOption[]>(
    () =>
      FINISH_MODES.map((value) => ({
        value,
        label: intl.formatMessage(finishModeWords[value].label),
        description: intl.formatMessage(finishModeWords[value].description),
      })),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.modeTitle)}
      description={intl.formatMessage(finishSessionMessages.modeDescription)}
    >
      <Field<typeof RichSelectGroupField>
        name={MODE_FIELD}
        component={RichSelectGroupField}
        label={intl.formatMessage(finishSessionMessages.modeLabel)}
        options={options}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
