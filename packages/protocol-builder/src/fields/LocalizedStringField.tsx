import type { ComponentProps } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { FieldValueProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  type DynamicValueSite,
  dynamicValueNamesIn,
  type LocalizedString,
} from '@codaco/protocol-validation';

import DynamicTextField from './DynamicTextField.tsx';
import {
  LocalizedStringField,
  type UntranslatedNoteOption,
} from './LocalizedStringControl.tsx';
import OptionLabelField from './OptionLabelField.tsx';
import RichTextField from './RichTextField.tsx';
import WrappingTextField from './WrappingTextField.tsx';

const messages = defineMessages({
  showsValuesNotEditable: {
    id: 'protocolBuilder.localization.showsValuesNotEditable',
    defaultMessage:
      'This text shows values the interview fills in, so it can’t be edited in this field. It is kept as it is.',
    description:
      'Shown in place of a text field when the stored text includes values filled in during the interview, such as the participant’s name, and this field cannot show them. The stored text is shown below it unchanged.',
  },
});

type LocalizedControlProps<Props> = Omit<Props, 'value' | 'onChange'> &
  FieldValueProps<LocalizedString> &
  UntranslatedNoteOption;

type DynamicValuesOption = Readonly<{
  /**
   * Where the text sits, when it may show values the interview fills in
   * (see `DynamicTextField`). Absent for text that is always literal.
   */
  dynamicValues?: DynamicValueSite;
  /** Where the text sits in a dialog's row, for a form field's caption. */
  fieldPath?: readonly string[];
}>;

/**
 * Whether a translation shows values, which a plain text control would write
 * back as literal braces. Such text is shown, not edited, where values are not
 * offered.
 */
const showsValues = (message: string): boolean =>
  message.includes('{') && dynamicValueNamesIn(message).length > 0;

function ValuesNotEditableHere({ message }: { message: string }) {
  const intl = useAppIntl();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-current/70">
        {intl.formatMessage(messages.showsValuesNotEditable)}
      </p>
      <pre className="text-sm break-words whitespace-pre-wrap">{message}</pre>
    </div>
  );
}

type WrapsOption = Readonly<{
  /**
   * For text that runs to a sentence or more, such as a notice or a message:
   * the control wraps and grows to show all of it, rather than scrolling it
   * past the edge of a one-line box. The text stays one paragraph.
   */
  wraps?: boolean;
}>;

/** Plain participant-facing text, one paragraph per language. */
export function LocalizedInputField({
  value,
  onChange,
  hideUntranslatedNote,
  dynamicValues,
  fieldPath,
  wraps = false,
  ...props
}: LocalizedControlProps<ComponentProps<typeof InputField>> &
  DynamicValuesOption &
  WrapsOption) {
  if (dynamicValues !== undefined) {
    return (
      <DynamicTextField
        id={props.id ?? ''}
        name={props.name ?? ''}
        aria-describedby={props['aria-describedby'] ?? ''}
        aria-labelledby={props['aria-labelledby']}
        aria-invalid={props['aria-invalid']}
        aria-required={props['aria-required']}
        disabled={props.disabled}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        value={value}
        onChange={onChange}
        hideUntranslatedNote={hideUntranslatedNote}
        dynamicValues={dynamicValues}
        fieldPath={fieldPath}
        compact
      />
    );
  }
  return (
    <LocalizedStringField
      value={value}
      onChange={onChange}
      hideUntranslatedNote={hideUntranslatedNote}
    >
      {(translation) =>
        showsValues(translation.message) ? (
          <ValuesNotEditableHere message={translation.message} />
        ) : wraps ? (
          <WrappingTextField
            id={props.id}
            name={props.name}
            aria-describedby={props['aria-describedby']}
            aria-labelledby={props['aria-labelledby']}
            aria-invalid={props['aria-invalid']}
            aria-required={props['aria-required']}
            disabled={props.disabled}
            readOnly={props.readOnly === true || translation.readOnly}
            placeholder={props.placeholder}
            value={translation.value}
            onChange={(text) => translation.onChange(text)}
          />
        ) : (
          <InputField
            {...props}
            readOnly={props.readOnly === true || translation.readOnly}
            value={translation.value}
            onChange={(text) => translation.onChange(text)}
          />
        )
      }
    </LocalizedStringField>
  );
}

/** Markdown participant-facing text, per language. */
export function LocalizedRichTextField({
  value,
  onChange,
  hideUntranslatedNote,
  dynamicValues,
  fieldPath,
  ...props
}: LocalizedControlProps<ComponentProps<typeof RichTextField>> &
  DynamicValuesOption) {
  if (dynamicValues !== undefined) {
    return (
      <DynamicTextField
        id={props.id}
        name={props.name}
        aria-describedby={props['aria-describedby']}
        aria-labelledby={props['aria-labelledby']}
        aria-invalid={props['aria-invalid']}
        aria-required={props['aria-required']}
        disabled={props.disabled}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        value={value}
        onChange={onChange}
        hideUntranslatedNote={hideUntranslatedNote}
        dynamicValues={dynamicValues}
        fieldPath={fieldPath}
        markdown
        singleLine={props.singleLine}
        compact={props.compact}
      />
    );
  }
  return (
    <LocalizedStringField
      value={value}
      onChange={onChange}
      hideUntranslatedNote={hideUntranslatedNote}
    >
      {(translation) =>
        showsValues(translation.message) ? (
          <ValuesNotEditableHere message={translation.message} />
        ) : (
          <RichTextField
            {...props}
            readOnly={props.readOnly === true || translation.readOnly}
            value={translation.value}
            onChange={translation.onChange}
          />
        )
      }
    </LocalizedStringField>
  );
}

/** An answer's label, per language. See `OptionLabelField`. */
export function LocalizedOptionLabelField({
  value,
  onChange,
  hideUntranslatedNote,
  ...props
}: LocalizedControlProps<ComponentProps<typeof OptionLabelField>>) {
  return (
    <LocalizedStringField
      value={value}
      onChange={onChange}
      hideUntranslatedNote={hideUntranslatedNote}
    >
      {(translation) => (
        <OptionLabelField
          {...props}
          readOnly={props.readOnly === true || translation.readOnly}
          value={translation.value}
          onChange={translation.onChange}
        />
      )}
    </LocalizedStringField>
  );
}
