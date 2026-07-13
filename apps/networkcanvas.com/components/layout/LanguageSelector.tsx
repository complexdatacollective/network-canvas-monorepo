'use client';

import { useLocale, useTranslations } from 'next-intl';

import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';
import type { ComboboxOption } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import { locales, type Locale } from '~/lib/i18n/locales';
import { usePathname, useRouter } from '~/lib/i18n/navigation';

const localeFlags = {
  'en-US': '🇺🇸',
  'en-GB': '🇬🇧',
  'es': '🇪🇸',
} satisfies Record<Locale, string>;

export function LanguageSelector({ onNavigate }: { onNavigate?: () => void }) {
  const locale = useLocale();
  const t = useTranslations('LanguageSelector');
  const pathname = usePathname();
  const router = useRouter();
  const options: ComboboxOption[] = [
    { value: 'en-US', label: t('englishUS') },
    { value: 'en-GB', label: t('englishUK') },
    { value: 'es', label: t('spanish') },
  ];

  const navigate = (targetLocale: Locale | undefined) => {
    if (!targetLocale || targetLocale === locale) return;

    router.replace(pathname, { locale: targetLocale });
    onNavigate?.();
  };

  return (
    <ComboboxField
      aria-label={t('label')}
      value={[locale]}
      options={options}
      searchPlaceholder={t('searchPlaceholder')}
      emptyMessage={t('emptyMessage')}
      showSelectAll={false}
      showDeselectAll={false}
      renderValue={() => (
        <span aria-hidden className="text-lg leading-none">
          {localeFlags[locale]}
        </span>
      )}
      renderOption={(option) => {
        const optionLocale = locales.find(
          (supportedLocale) => supportedLocale === option.value,
        );

        return (
          <span className="flex items-center gap-2">
            {optionLocale ? (
              <span aria-hidden className="text-lg leading-none">
                {localeFlags[optionLocale]}
              </span>
            ) : null}
            <span>{option.label}</span>
          </span>
        );
      }}
      onChange={(values) =>
        navigate(
          locales.find(
            (supportedLocale) =>
              supportedLocale !== locale && values?.includes(supportedLocale),
          ),
        )
      }
      className="border-cyber-grape/15 w-20 bg-white/55 backdrop-blur-md"
    />
  );
}
