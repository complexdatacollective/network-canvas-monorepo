import { useTranslations } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';

const Page = ({ params: { locale } }: { params: { locale: string } }) => {
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);
  const t = useTranslations('Home');

  // TODO: We have to show some document or content here
  // TODO: or we should redirect to /desktop by default

  return (
    <div>
      <h2>
        {t('title')} {locale}
      </h2>
    </div>
  );
};

export default Page;
