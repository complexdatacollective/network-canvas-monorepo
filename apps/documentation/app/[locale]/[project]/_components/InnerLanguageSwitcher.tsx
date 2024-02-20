import { getAvailableLocales } from '@/lib/helper_functions';
import { getTranslator } from 'next-intl/server';
import Link from 'next/link';

type InnerLanguageSwitcherProps = {
  filePath: string;
  currentLocale: string;
};

const InnerLanguageSwitcher = async ({
  filePath,
  currentLocale,
}: InnerLanguageSwitcherProps) => {
  const t = await getTranslator(currentLocale, 'DocPage');
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
            className="mx-1 text-blue-400 transition-colors hover:text-cyan-400"
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
