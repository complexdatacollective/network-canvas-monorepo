import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { LocalizedString } from '@codaco/protocol-validation';

import { LocalizedInputField } from '../fields/LocalizedStringField.tsx';
import { REQUIRED } from './requiredField.ts';

/** One text setting a stage editor asks for: where it is held and what it is called. */
export type WordingSetting = Readonly<{
  /** The dotted path the stage holds the setting at, such as `tooltips.resumeLayout`. */
  path: string;
  label: MessageDescriptor;
  hint?: MessageDescriptor;
}>;

/**
 * A required text setting in every protocol language, started with the wording
 * it was given: what the stage holds, or Network Canvas's wording when the
 * stage does not hold it yet.
 */
export function WordingRow({
  setting,
  initialValue,
}: Readonly<{
  setting: WordingSetting;
  initialValue: LocalizedString | undefined;
}>) {
  const intl = useAppIntl();
  return (
    <Field<typeof LocalizedInputField>
      name={setting.path}
      component={LocalizedInputField}
      label={intl.formatMessage(setting.label)}
      hint={
        setting.hint === undefined
          ? undefined
          : intl.formatMessage(setting.hint)
      }
      initialValue={initialValue}
      required={REQUIRED}
    />
  );
}
