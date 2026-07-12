'use client';

import { useLocale, useTranslations } from 'next-intl';

import Button from '@codaco/fresco-ui/Button';
import type { Locale } from '~/lib/i18n/locales';
import { usePathname, useRouter } from '~/lib/i18n/navigation';

export function LanguageSelector({ onNavigate }: { onNavigate?: () => void }) {
  const locale = useLocale();
  const t = useTranslations('LanguageSelector');
  const pathname = usePathname();
  const router = useRouter();

  const navigate = (targetLocale: Locale) => {
    router.replace(pathname, { locale: targetLocale });
    onNavigate?.();
  };

  return (
    <fieldset className="border-cyber-grape/15 flex w-fit items-center gap-0.5 rounded-full border bg-white/55 p-1 backdrop-blur-md">
      <legend className="sr-only">{t('label')}</legend>
      <Button
        variant="text"
        color="dynamic"
        size="sm"
        aria-current={locale === 'en' ? 'true' : undefined}
        onClick={() => navigate('en')}
        className="aria-current:bg-cyber-grape aria-current:hover:bg-cyber-grape min-w-0 rounded-full px-2.5 shadow-none aria-current:text-white"
      >
        {t('english')}
      </Button>
      <span aria-hidden className="text-cyber-grape/35">
        /
      </span>
      <Button
        variant="text"
        color="dynamic"
        size="sm"
        aria-current={locale === 'es' ? 'true' : undefined}
        onClick={() => navigate('es')}
        className="aria-current:bg-cyber-grape aria-current:hover:bg-cyber-grape min-w-0 rounded-full px-2.5 shadow-none aria-current:text-white"
      >
        {t('spanish')}
      </Button>
    </fieldset>
  );
}
