import { Languages } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { FieldValueProps } from '@codaco/fresco-ui/form/Field/types';
import type { LocalizedString } from '@codaco/protocol-validation';

import { EditingLanguageSwitcher } from '../localization/EditingLanguageSwitcher.tsx';
import { languageMessages } from '../localization/languageNames.ts';
import { useLanguageNaming } from '../localization/LanguageNaming.tsx';
import {
  fallbackDependsOnBrowser,
  localeDirection,
  missingLocales,
  resolveTranslation,
  translationText,
  withMessage,
  withTranslation,
} from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';

/** One translation, as the text control under the language menu edits it. */
export type TranslationControl = Readonly<{
  /** The translation's plain text: what the researcher reads and types. */
  value: string;
  /** Write the translation; blank text removes it. */
  onChange: (text: string | undefined) => void;
  /** The translation as the protocol stores it: an ICU message, or empty. */
  message: string;
  /** Write the translation as a message, as given; undefined removes it. */
  onMessageChange: (message: string | undefined) => void;
  /** True until the protocol's languages are known, when nothing may be written. */
  readOnly: boolean;
}>;

export type LocalizedStringFieldProps = FieldValueProps<LocalizedString> &
  Readonly<{
    /** The text control, drawn for the editing language's translation. */
    children: (translation: TranslationControl) => ReactNode;
  }> &
  UntranslatedNoteOption;

export type UntranslatedNoteOption = Readonly<{
  /**
   * Leaves out the note under the control that says which language
   * participants see while the editing language has no translation. For a
   * host that already shows every language's text beside the field.
   */
  hideUntranslatedNote?: boolean;
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
  hideUntranslatedNote = false,
}: LocalizedStringFieldProps) {
  const intl = useAppIntl();
  const { name: languageName } = useLanguageNaming();
  const { localization, locale } = useEditingLanguage();

  if (localization === undefined || locale === undefined) {
    return children({
      value: resolveTranslation(value, undefined, undefined).text,
      onChange: () => undefined,
      message: '',
      onMessageChange: () => undefined,
      readOnly: true,
    });
  }

  const shown = resolveTranslation(value, localization, locale);
  const untranslated =
    !hideUntranslatedNote &&
    localization.locales.length > 1 &&
    missingLocales(value, localization).has(locale) &&
    shown.lang !== undefined;
  const untranslatedMessage = fallbackDependsOnBrowser(
    value,
    localization,
    shown,
  )
    ? languageMessages.notTranslatedUnlessBrowserLists
    : languageMessages.notTranslated;

  return (
    <div className="flex flex-col gap-2">
      <EditingLanguageSwitcher values={[value]} />
      <div key={locale} lang={locale} dir={localeDirection(locale)}>
        {children({
          value: translationText(value, locale),
          onChange: (text) =>
            onChange?.(withTranslation(value, locale, text ?? '')),
          message: value?.[locale] ?? '',
          onMessageChange: (message) =>
            onChange?.(withMessage(value, locale, message)),
          readOnly: false,
        })}
      </div>
      {untranslated && shown.lang !== undefined && (
        <p className="flex items-start gap-2 text-sm text-current/70">
          <Languages
            aria-hidden="true"
            className="text-warning mt-0.5 size-4 shrink-0"
          />
          {intl.formatMessage(untranslatedMessage, {
            language: languageName(locale),
            fallback: languageName(shown.lang),
          })}
        </p>
      )}
    </div>
  );
}
