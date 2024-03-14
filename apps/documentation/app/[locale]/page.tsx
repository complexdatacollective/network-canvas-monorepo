import { Heading, Paragraph } from '@codaco/ui';
import { unstable_setRequestLocale } from 'next-intl/server';
import type { LocalesEnum } from '../types';
import { Card } from '~/components/ui/card';
import { useTranslations } from 'next-intl';

const Page = ({ params: { locale } }: { params: { locale: LocalesEnum } }) => {
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);

  return;
};
export default Page;
