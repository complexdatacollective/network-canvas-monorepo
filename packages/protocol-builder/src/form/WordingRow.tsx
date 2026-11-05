import { useMemo } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type {
  LocalizedString,
  MessageArguments,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../fields/LocalizedStringField.tsx';
import { REQUIRED } from './requiredField.ts';

/** One text setting a stage editor asks for: where it is held and what it is called. */
export type WordingSetting = Readonly<{
  /** The dotted path the stage holds the setting at, such as `tooltips.resumeLayout`. */
  path: string;
  label: MessageDescriptor;
  hint?: MessageDescriptor;
  /** Set for a setting worded as a sentence or more: its field wraps. */
  wraps?: boolean;
  /**
   * Set for a setting that may show values the interview fills in, such as
   * the name of the stage's node type (see `localizedMessage`): its field
   * offers them as piped text.
   */
  arguments?: MessageArguments;
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
  const label = intl.formatMessage(setting.label);
  const hint =
    setting.hint === undefined ? undefined : intl.formatMessage(setting.hint);
  const declaration = setting.arguments;
  const validation = useMemo(
    () =>
      declaration === undefined
        ? undefined
        : localizedMessageValidation(declaration, intl),
    [declaration, intl],
  );

  if (declaration !== undefined) {
    return (
      <Field<typeof LocalizedMessageField>
        name={setting.path}
        component={LocalizedMessageField}
        label={label}
        hint={hint}
        arguments={declaration}
        initialValue={initialValue}
        required={REQUIRED}
        custom={validation}
      />
    );
  }

  return (
    <Field<typeof LocalizedInputField>
      name={setting.path}
      component={LocalizedInputField}
      label={label}
      hint={hint}
      initialValue={initialValue}
      required={REQUIRED}
      wraps={setting.wraps}
    />
  );
}
