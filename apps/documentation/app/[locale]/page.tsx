import { setRequestLocale } from 'next-intl/server';

import { Hero } from '~/components/Hero';
import type { Locale } from '~/lib/i18n/locales';

const Page = async (props: { params: Promise<{ locale: Locale }> }) => {
  const params = await props.params;

  const { locale } = params;

  // setting setRequestLocale to support next-intl for static rendering
  setRequestLocale(locale);

  return <Hero />;
};
export default Page;
