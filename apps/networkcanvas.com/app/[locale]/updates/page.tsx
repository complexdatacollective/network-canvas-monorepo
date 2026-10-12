import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { Container } from '~/components/ui/Container';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { PageIntro } from '~/components/ui/PageIntro';
import { UpdatesList } from '~/components/updates/UpdatesList';
import { routing } from '~/lib/i18n/routing';
import { loadUpdates } from '~/lib/siteContent';

type UpdatesPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: UpdatesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'UpdatesPage' });

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: {
      canonical: `https://networkcanvas.com/${locale}/updates`,
      languages: {
        'en-US': 'https://networkcanvas.com/en-US/updates',
        'en-GB': 'https://networkcanvas.com/en-GB/updates',
        'es': 'https://networkcanvas.com/es/updates',
        'zh-Hans': 'https://networkcanvas.com/zh-Hans/updates',
        'zh-Hant': 'https://networkcanvas.com/zh-Hant/updates',
        'de': 'https://networkcanvas.com/de/updates',
        'nl': 'https://networkcanvas.com/nl/updates',
        'pt-BR': 'https://networkcanvas.com/pt-BR/updates',
        'it': 'https://networkcanvas.com/it/updates',
        'fr': 'https://networkcanvas.com/fr/updates',
      },
    },
  };
}

export default async function UpdatesPage({ params }: UpdatesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const [updates, t] = await Promise.all([
    loadUpdates(locale),
    getTranslations({ locale, namespace: 'UpdatesPage' }),
  ]);

  return (
    <div className="relative isolate">
      <HomepagePageBackground />
      <Header activeItemId="updates" />
      <main>
        <PageIntro heading={t('heading')} paragraphs={[t('introduction')]} />
        <Container margin="bottom" className="mt-12">
          <UpdatesList updates={updates} />
        </Container>
      </main>
      <Footer />
    </div>
  );
}
