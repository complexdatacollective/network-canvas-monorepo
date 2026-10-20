'use client';

import type { AppLocale } from '@codaco/app-i18n/locales';
import { useAppIntl } from '@codaco/app-i18n/react';

import { automaticLocaleMessage } from '../../navigation/automaticLocaleMessage';
import SelectField from './Select/Native';
import type { SelectOption } from './Select/shared';

/**
 * Stands in for "no stored preference" inside the native `<select>`, whose
 * value is always a string. An underscore cannot appear in a BCP 47 tag, so
 * this can never collide with a locale in `options`.
 */
const AUTOMATIC_VALUE = '__automatic';

type LocaleSelectProps = {
  /**
   * The locales to offer, in display order. `label` is the autonym — the
   * language's name in itself — and is rendered under that option's own
   * `lang` and `dir` so a screen reader pronounces it correctly.
   */
  'options': readonly AppLocale[];
  /**
   * The selected BCP 47 tag, or `null` for "no explicit choice". With an
   * automatic entry offered, `null` selects it; without one, `null` shows the
   * placeholder.
   */
  'value': string | null;
  'onChange': (value: string | null) => void;
  /**
   * Label for the leading "follow the device/browser" entry, for a host whose
   * automatic behaviour needs its own wording. Takes precedence over
   * `automaticLocale`. Omit both to offer no such entry.
   */
  'automaticLabel'?: string;
  /**
   * The locale the automatic entry resolves to on this device right now. The
   * entry then reads "Automatic (Español)", in the same words as
   * `LocaleSwitcher`, naming the language rather than where it came from.
   */
  'automaticLocale'?: string;
  /** Shown while nothing is selected. Defaults to the select's own text. */
  'placeholder'?: string;
  'name'?: string;
  'id'?: string;
  'size'?: React.ComponentProps<typeof SelectField>['size'];
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'className'?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'onBlur'?: React.ComponentProps<typeof SelectField>['onBlur'];
};

/**
 * Language picker for a UI-locale preference: autonym labels, an optional
 * automatic entry, and the platform's own `<select>` behaviour (typeahead,
 * arrow keys, the native picker on touch) rather than a re-implementation.
 *
 * ```tsx
 * <LocaleSelect
 *   options={appLocales}
 *   value={preference}
 *   onChange={setPreference}
 *   automaticLabel={t('account.language.automatic')}
 *   aria-labelledby={labelId}
 * />
 * ```
 */
export default function LocaleSelect({
  options,
  value,
  onChange,
  automaticLabel,
  automaticLocale,
  placeholder,
  ...rest
}: LocaleSelectProps) {
  const intl = useAppIntl();
  const automaticEntry =
    automaticLabel ??
    (automaticLocale === undefined
      ? undefined
      : intl.formatMessage(automaticLocaleMessage, {
          language:
            options.find((entry) => entry.locale === automaticLocale)?.label ??
            automaticLocale,
        }));
  const selectOptions: SelectOption[] = [
    ...(automaticEntry === undefined
      ? []
      : [{ value: AUTOMATIC_VALUE, label: automaticEntry }]),
    ...options.map((locale) => ({
      value: locale.locale,
      // The label is written in the language it names, not in the page's
      // language: without this a screen reader reads "Deutsch" with English
      // phonetics.
      label: {
        text: locale.label,
        lang: locale.locale,
        dir: locale.direction,
      },
    })),
  ];

  return (
    <SelectField
      {...rest}
      options={selectOptions}
      placeholder={placeholder}
      value={
        value ?? (automaticEntry === undefined ? undefined : AUTOMATIC_VALUE)
      }
      onChange={(next) => {
        const tag = String(next);
        onChange(tag === AUTOMATIC_VALUE || tag === '' ? null : tag);
      }}
    />
  );
}
