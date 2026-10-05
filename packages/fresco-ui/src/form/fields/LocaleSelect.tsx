'use client';

import type { AppLocale } from '@codaco/app-i18n/locales';

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
   * `lang` so a screen reader pronounces it correctly.
   */
  'options': readonly AppLocale[];
  /**
   * The selected BCP 47 tag, or `null` for "no explicit choice". With
   * `automaticLabel` set, `null` selects the automatic entry; without it,
   * `null` shows the placeholder.
   */
  'value': string | null;
  'onChange': (value: string | null) => void;
  /**
   * Label for the leading "follow the device/browser" entry. Host-supplied
   * because only the host knows what its automatic behaviour is called (and
   * in which language to say it). Omit the prop to offer no such entry.
   */
  'automaticLabel'?: string;
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
  placeholder,
  ...rest
}: LocaleSelectProps) {
  const selectOptions: SelectOption[] = [
    ...(automaticLabel === undefined
      ? []
      : [{ value: AUTOMATIC_VALUE, label: automaticLabel }]),
    ...options.map((locale) => ({
      value: locale.locale,
      label: locale.label,
      // The label is written in the language it names, not in the page's
      // language: without this a screen reader reads "Deutsch" with English
      // phonetics.
      lang: locale.locale,
    })),
  ];

  return (
    <SelectField
      {...rest}
      options={selectOptions}
      placeholder={placeholder}
      value={
        value ?? (automaticLabel === undefined ? undefined : AUTOMATIC_VALUE)
      }
      onChange={(next) => {
        const tag = String(next);
        onChange(tag === AUTOMATIC_VALUE || tag === '' ? null : tag);
      }}
    />
  );
}
