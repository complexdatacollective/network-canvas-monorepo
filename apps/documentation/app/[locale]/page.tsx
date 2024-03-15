import { unstable_setRequestLocale } from 'next-intl/server';
import type { LocalesEnum } from '../types';
import { Hero } from '~/components/Hero';

const Page = ({ params: { locale } }: { params: { locale: LocalesEnum } }) => {
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);

  return <Hero />;
};
export default Page;
