import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getAvailableLocales } from '~/lib/helper_functions';

type InnerLanguageSwitcherProps = {
  filePath: string;
  currentLocale: string;
};

const InnerLanguageSwitcher = async ({
  filePath,
  currentLocale,
}: InnerLanguageSwitcherProps) => {
  const t = await getTranslations('DocPage');
  const availableLocales = getAvailableLocales(filePath);

  // removes the current locale from availableLocales
  const supportedLanguages = availableLocales.filter(
    (locale) => locale !== currentLocale,
  );

  if (!supportedLanguages.length) return null;

  return (
    <div className="my-1 flex gap-2">
      <span>{t('docAvailableTxt')}</span>
      {supportedLanguages.map((lang) => (
        <div key={lang}>
          <Link
            className="text-blue-400 hover:text-cyan-400 mx-1 transition-colors"
            href={`/${lang}${filePath}`}
          >
            {lang}
          </Link>
        </div>
      ))}
    </div>
  );
};

export default InnerLanguageSwitcher;
