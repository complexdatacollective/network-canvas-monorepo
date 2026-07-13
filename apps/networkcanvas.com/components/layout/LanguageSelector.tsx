'use client';

import { useLocale, useTranslations } from 'next-intl';

import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';
import type { ComboboxOption } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import { switchLocale } from '~/lib/i18n/clientLocale';
import {
  getLocaleDefinition,
  locales,
  supportedLocales,
  type Locale,
} from '~/lib/i18n/locales';
import { usePathname } from '~/lib/i18n/navigation';

function normalizeSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

function isComboboxOption(value: unknown): value is ComboboxOption {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    (typeof value.value === 'string' || typeof value.value === 'number') &&
    'label' in value &&
    typeof value.label === 'string'
  );
}

function localeMatchesSearch(option: unknown, query: string) {
  if (!isComboboxOption(option)) return false;

  const definition = supportedLocales.find(
    ({ locale }) => locale === option.value,
  );
  if (!definition) return false;

  const normalizedQuery = normalizeSearchTerm(query);
  return [
    definition.locale,
    definition.nativeName,
    definition.englishName,
  ].some((term) => normalizeSearchTerm(term).includes(normalizedQuery));
}

export function LanguageSelector({ onNavigate }: { onNavigate?: () => void }) {
  const locale = useLocale();
  const t = useTranslations('LanguageSelector');
  const pathname = usePathname();
  const activeLocale = getLocaleDefinition(locale);
  const options: ComboboxOption[] = supportedLocales.map((definition) => ({
    value: definition.locale,
    label: definition.nativeName,
  }));

  const navigate = (targetLocale: Locale | undefined) => {
    if (!targetLocale || targetLocale === locale) return;

    switchLocale(targetLocale, pathname);
    onNavigate?.();
  };

  return (
    <ComboboxField
      aria-label={t('label')}
      value={[locale]}
      options={options}
      filter={localeMatchesSearch}
      searchPlaceholder={t('searchPlaceholder')}
      emptyMessage={t('emptyMessage')}
      showSelectAll={false}
      showDeselectAll={false}
      renderValue={() => (
        <span className="font-heading text-sm font-bold tracking-wide">
          <span aria-hidden="true">{activeLocale.compactLabel}</span>
          <span className="sr-only">{activeLocale.nativeName}</span>
        </span>
      )}
      onChange={(values) =>
        navigate(
          locales.find(
            (supportedLocale) =>
              supportedLocale !== locale && values?.includes(supportedLocale),
          ),
        )
      }
      className="border-cyber-grape/15 w-28 bg-white/55 backdrop-blur-md"
    />
  );
}
