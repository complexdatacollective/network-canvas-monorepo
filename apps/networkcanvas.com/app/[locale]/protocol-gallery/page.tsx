import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { ProtocolGallery } from '~/components/protocol-gallery/ProtocolGallery';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { contactEmail } from '~/lib/content';
import { routing } from '~/lib/i18n/routing';
import { loadProtocolGallery } from '~/lib/protocolGallery';

type ProtocolGalleryPageProps = {
  params: Promise<{ locale: string }>;
};

function localeAlternates(pathname: string) {
  return Object.fromEntries(
    routing.locales.map((locale) => [
      locale,
      `https://networkcanvas.com/${locale}${pathname}`,
    ]),
  );
}

export async function generateMetadata({
  params,
}: ProtocolGalleryPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });
  const pathname = '/protocol-gallery';

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: {
      canonical: `https://networkcanvas.com/${locale}${pathname}`,
      languages: localeAlternates(pathname),
    },
  };
}

function renderContactLink(chunks: ReactNode) {
  return (
    <NativeLink href={`mailto:${contactEmail}`} className="font-bold">
      {chunks}
    </NativeLink>
  );
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
      <HomepagePageBackground target="[data-protocol-gallery-weave-target]" />
      <Header activeItemId="protocolGallery" />

      <div
        data-protocol-gallery-weave-target
        className="tablet-portrait:pt-24 tablet-portrait:pb-28 px-6 pt-16 pb-20 text-center"
      >
        <div className="mx-auto max-w-4xl">
          <Heading
            level="h1"
            variant="display-heading"
            margin="none"
            className="text-text"
          >
            {t('intro.heading')}
          </Heading>
          <Paragraph
            intent="lead"
            margin="none"
            className="text-text/75 mt-6 text-lg text-pretty"
          >
            {t('intro.introduction')}
          </Paragraph>
          <Paragraph
            intent="lead"
            margin="none"
            className="text-text/75 mt-3 text-lg text-pretty"
          >
            {t.rich('intro.submission', {
              address: contactEmail,
              email: renderContactLink,
            })}
          </Paragraph>
        </div>
      </div>

      <ProtocolGallery protocols={protocols} />

      <Footer />
    </main>
  );
}
