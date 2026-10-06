import { Languages } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { FieldValueProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { LocalizedString } from '@codaco/protocol-validation';

import { EditingLanguageSwitcher } from '../localization/EditingLanguageSwitcher.tsx';
import {
  languageMessages,
  useLanguageName,
} from '../localization/languageNames.ts';
import {
  localeDirection,
  missingLocales,
  resolveTranslation,
  translationText,
  withTranslation,
} from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import OptionLabelField from './OptionLabelField.tsx';
import RichTextField from './RichTextField.tsx';

/** One translation, as the text control under the language menu edits it. */
export type TranslationControl = Readonly<{
  /** The translation's plain text: what the researcher reads and types. */
  value: string;
  /** Write the translation; blank text removes it. */
  onChange: (text: string | undefined) => void;
  /** True until the protocol's languages are known, when nothing may be written. */
  readOnly: boolean;
}>;

export type LocalizedStringFieldProps = FieldValueProps<LocalizedString> &
  Readonly<{
    /** The text control, drawn for the editing language's translation. */
    children: (translation: TranslationControl) => ReactNode;
  }>;

/**
 * Participant-facing text written in each of the protocol's languages.
 *
 * The value is the whole translation map and the control edits one entry of
 * it: the editing language the menu above it shows, which every localized
 * field shares. A translation is shown and typed as plain text and stored as
 * the literal message the schema holds, so a researcher never meets message
 * syntax. Emptying a translation, or leaving only spaces in it, removes it,
 * and emptying the last one leaves the field unanswered, which a required
 * field then refuses. A language with no translation is a gap the menu and the
 * note below the control point out, never an error.
 *
 * The control is drawn inside the translation's own `lang` and `dir`, and
 * remounted per language, so an editor holding one language's document never
 * writes it into another's.
 */
export function LocalizedStringField({
  value,
  onChange,
  children,
}: LocalizedStringFieldProps) {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { localization, locale } = useEditingLanguage();

  if (localization === undefined || locale === undefined) {
    return children({
      value: resolveTranslation(value, undefined, undefined).text,
      onChange: () => undefined,
      readOnly: true,
    });
  }

  const shown = resolveTranslation(value, localization, locale);
  const untranslated =
    localization.locales.length > 1 &&
    missingLocales(value, localization).includes(locale) &&
    shown.lang !== undefined;

  return (
    <div className="flex flex-col gap-2">
      <EditingLanguageSwitcher values={[value]} />
      <div key={locale} lang={locale} dir={localeDirection(locale)}>
        {children({
          value: translationText(value, locale),
          onChange: (text) =>
            onChange?.(withTranslation(value, locale, text ?? '')),
          readOnly: false,
        })}
      </div>
      {untranslated && shown.lang !== undefined && (
        <p className="flex items-start gap-2 text-sm text-current/70">
          <Languages
            aria-hidden="true"
            className="text-warning mt-0.5 size-4 shrink-0"
          />
          {intl.formatMessage(languageMessages.notTranslated, {
            language: languageName(locale),
            fallback: languageName(shown.lang),
          })}
        </p>
      )}
    </div>
  );
}

type LocalizedControlProps<Props> = Omit<Props, 'value' | 'onChange'> &
  FieldValueProps<LocalizedString>;

/** Plain participant-facing text, one line per language. */
export function LocalizedInputField({
  value,
  onChange,
  ...props
}: LocalizedControlProps<ComponentProps<typeof InputField>>) {
  return (
    <LocalizedStringField value={value} onChange={onChange}>
      {(translation) => (
        <InputField
          {...props}
          readOnly={props.readOnly === true || translation.readOnly}
          value={translation.value}
          onChange={(text) => translation.onChange(text)}
        />
      )}
    </LocalizedStringField>
  );
}

/** Markdown participant-facing text, per language. */
export function LocalizedRichTextField({
  value,
  onChange,
  ...props
}: LocalizedControlProps<ComponentProps<typeof RichTextField>>) {
  return (
    <LocalizedStringField value={value} onChange={onChange}>
      {(translation) => (
        <RichTextField
          {...props}
          readOnly={props.readOnly === true || translation.readOnly}
          value={translation.value}
          onChange={translation.onChange}
        />
      )}
    </LocalizedStringField>
  );
}

/** An answer's label, per language. See `OptionLabelField`. */
export function LocalizedOptionLabelField({
  value,
  onChange,
  ...props
}: LocalizedControlProps<ComponentProps<typeof OptionLabelField>>) {
  return (
    <LocalizedStringField value={value} onChange={onChange}>
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
