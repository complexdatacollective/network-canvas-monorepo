import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { ProtocolGallery } from '~/components/protocol-gallery/ProtocolGallery';
import { SubmitProtocolCard } from '~/components/protocol-gallery/SubmitProtocolCard';
import { Container } from '~/components/ui/Container';
import { routing } from '~/lib/i18n/routing';
import { loadProtocolGallery } from '~/lib/protocolGallery';
import { protocolGalleryUrl } from '~/lib/siteUrls';

type ProtocolGalleryPageProps = {
  params: Promise<{ locale: string }>;
};

function localeAlternates(slug?: string) {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, protocolGalleryUrl(locale, slug)]),
  );
}

export async function generateMetadata({
  params,
}: ProtocolGalleryPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: {
      canonical: protocolGalleryUrl(locale),
      languages: localeAlternates(),
    },
    openGraph: {
      title: t('metadata.title'),
      description: t('metadata.description'),
      url: protocolGalleryUrl(locale),
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: t('metadata.title'),
      description: t('metadata.description'),
    },
  };
}

export default async function ProtocolGalleryPage({
  params,
}: ProtocolGalleryPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });
  const protocols = await loadProtocolGallery();

  return (
    <main className="relative isolate">
      <Header activeItemId="protocolGallery" host="protocolGallery" />

      <div className="type-scale-product">
        <Container maxWidth="full" margin="none" className="mt-12">
          <div
            id={SITE_NAVIGATION_SKIP_TARGET_ID}
            className="tablet-landscape:grid-cols-[minmax(0,1fr)_minmax(32rem,48rem)] tablet-landscape:items-start grid gap-8"
          >
            <div className="min-w-0">
              <Heading level="h1" variant="section-heading" margin="none">
                {t('intro.heading')}
              </Heading>
              <Paragraph
                intent="lead"
                margin="none"
                emphasis="muted"
                className="mt-6 max-w-3xl"
              >
                {t('intro.introduction')}
              </Paragraph>
            </div>
            <SubmitProtocolCard />
          </div>
        </Container>

        <ProtocolGallery protocols={protocols} />
      </div>

      <Footer />
    </main>
  );
}
