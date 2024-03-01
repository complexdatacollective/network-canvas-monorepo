import { useTranslations } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';

import { Heading } from '@acme/ui';

import type { LocalesEnum } from '../types';

const Page = ({ params: { locale } }: { params: { locale: LocalesEnum } }) => {
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);
  const t = useTranslations('Home');

  // TODO: We have to show some document or content here
  // TODO: or we should redirect to /desktop by default

  return (
    <div>
      <Heading variant="h2">Welcome to our documentation.</Heading>
    </div>
  );
};

export default Page;
