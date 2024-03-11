import { useTranslations } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';
import { Heading } from '@codaco/ui';
import type { LocalesEnum } from '../types';

const Page = ({ params: { locale } }: { params: { locale: LocalesEnum } }) => {
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);
  const t = useTranslations('Home');

  return (
    <div>
      <Heading variant="h2">{t('title')}</Heading>
    </div>
  );
};

export default Page;
