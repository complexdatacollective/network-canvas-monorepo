import { useTranslations } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';
import { MotionHeading } from '@codaco/ui/components/typography/Heading';
import PageHeader from '@codaco/ui/components/typography/PageHeader';

const Page = ({ params: { locale } }: { params: { locale: string } }) => {
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);
  const t = useTranslations('Home');

  // TODO: We have to show some document or content here
  // TODO: or we should redirect to /desktop by default

  return (
    <div>
      <MotionHeading variant="h1" className="text-sea-serpent">
        THIS IS HEADING
      </MotionHeading>
      <PageHeader
        headerText="Dashboard"
        subHeaderText="Welcome to Fresco! This page provides an overview of your recent activity and key metrics."
      />
      <h2>
        {t('title')} {locale}
      </h2>
    </div>
  );
};

export default Page;
