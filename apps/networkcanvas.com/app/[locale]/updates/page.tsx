import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { Container } from '~/components/ui/Container';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { PageIntro } from '~/components/ui/PageIntro';
import { UpdatesList } from '~/components/updates/UpdatesList';
import { externalLinks } from '~/lib/content';
import { routing } from '~/lib/i18n/routing';
import { loadUpdates } from '~/lib/siteContent';
import { documentationUrl } from '~/lib/siteUrls';

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
      },
    },
  };
}

function renderChangelogLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={externalLinks.releases}
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

function renderFrescoUpgradeLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={documentationUrl('/en/collect-data/fresco/upgrading')}
      target="_blank"
      rel="noreferrer"
    >
      {chunks}
    </NativeLink>
  );
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
    <main className="relative isolate">
      <HomepagePageBackground />
      <div>
        <Header activeItemId="updates" />
        <PageIntro
          heading={t('heading')}
          paragraphs={[
            t.rich('introduction', { changelog: renderChangelogLink }),
          ]}
        />
        <Container margin="bottom" className="mt-12">
          <UpdatesList updates={updates} />
          <section
            aria-labelledby="upgrading"
            className="border-text/10 mx-auto max-w-4xl border-t pt-12"
          >
            <Alert variant="info">
              <AlertTitle id="upgrading" headingLevel="h2">
                {t('upgrading.heading')}
              </AlertTitle>
              <AlertDescription>
                <Paragraph>{t('upgrading.automatic')}</Paragraph>
                <Paragraph margin="none">
                  {t.rich('upgrading.fresco', {
                    link: renderFrescoUpgradeLink,
                  })}
                </Paragraph>
              </AlertDescription>
            </Alert>
          </section>
        </Container>
        <Footer />
      </div>
    </main>
  );
}
