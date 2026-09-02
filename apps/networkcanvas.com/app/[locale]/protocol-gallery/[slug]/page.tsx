import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import Surface from '@codaco/fresco-ui/layout/Surface';
import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { Eyebrow } from '~/components/protocol-gallery/Eyebrow';
import { OverlineHeading } from '~/components/protocol-gallery/OverlineHeading';
import { ProtocolCitation } from '~/components/protocol-gallery/ProtocolCitation';
import { ProtocolDetailFacts } from '~/components/protocol-gallery/ProtocolDetailFacts';
import { ProtocolDownloads } from '~/components/protocol-gallery/ProtocolDownloads';
import { StageSequenceRail } from '~/components/protocol-gallery/StageSequenceRail';
import { Container } from '~/components/ui/Container';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { NativeLink } from '~/components/ui/NativeLink';
import { Pill } from '~/components/ui/Pill';
import { routing } from '~/lib/i18n/routing';
import { getProtocolBySlug, loadProtocolGallery } from '~/lib/protocolGallery';
import { protocolGalleryHref, protocolGalleryUrl } from '~/lib/siteUrls';

type ProtocolDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const protocols = await loadProtocolGallery();
  return protocols.map((protocol) => ({ slug: protocol.slug }));
}

function localeAlternates(slug: string) {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, protocolGalleryUrl(locale, slug)]),
  );
}

export async function generateMetadata({
  params,
}: ProtocolDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const protocol = await getProtocolBySlug(slug);
  if (!protocol) notFound();

  const canonical = protocolGalleryUrl(locale, protocol.slug);
  return {
    title: protocol.title,
    description: protocol.description,
    alternates: {
      canonical,
      languages: localeAlternates(protocol.slug),
    },
    openGraph: {
      title: protocol.title,
      description: protocol.description,
      url: canonical,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: protocol.title,
      description: protocol.description,
    },
  };
}

const stageSequenceHeadingId = 'protocol-stage-sequence';

export default async function ProtocolDetailPage({
  params,
}: ProtocolDetailPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const protocol = await getProtocolBySlug(slug);
  if (!protocol) notFound();

  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });
  const [firstWave] = protocol.downloads;

  return (
    <main className="relative isolate">
      <HomepagePageBackground target="[data-protocol-detail-weave-target]" />
      <Header activeItemId="protocolGallery" host="protocolGallery" />

      <Container maxWidth="full" margin="none" className="mt-12">
        <div
          id={SITE_NAVIGATION_SKIP_TARGET_ID}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <span className="inline-flex items-center gap-2">
            <ArrowLeft aria-hidden className="text-link size-5" />
            <NativeLink href={protocolGalleryHref(locale)}>
              {t('detail.back')}
            </NativeLink>
          </span>
          {firstWave ? (
            <Pill variant="filled">
              <span className="sr-only">{t('detail.protocolFile')} </span>
              {firstWave.protocolFilename}
            </Pill>
          ) : null}
        </div>

        <div className="tablet-landscape:grid-cols-[minmax(0,1.4fr)_minmax(24rem,1fr)] mt-8 grid grid-cols-1 gap-8">
          <div className="min-w-0 space-y-8">
            <div data-protocol-detail-weave-target>
              {protocol.featured ? (
                <Eyebrow tone="primary">{t('intro.featured')}</Eyebrow>
              ) : null}
              <Heading
                level="h1"
                variant="section-heading"
                margin="none"
                className="mt-2"
              >
                {protocol.shortName}
              </Heading>
              <Paragraph intent="lead" margin="none" className="mt-4">
                {protocol.title}
              </Paragraph>
              <Paragraph
                margin="none"
                intent="smallText"
                emphasis="muted"
                className="font-monospace mt-3"
              >
                {protocol.authors}
              </Paragraph>
              <div className="mt-6">
                <ProtocolDownloads
                  downloads={protocol.downloads}
                  supplementaryMaterials={protocol.supplementaryMaterials}
                  sandboxUrl={protocol.sandboxUrl}
                />
              </div>
              <Paragraph margin="none" className="mt-8">
                {protocol.summary}
              </Paragraph>
            </div>

            <Surface noContainer spacing="lg" shadow="md">
              <OverlineHeading>{t('detail.demonstrates')}</OverlineHeading>
              <Paragraph margin="none" className="mt-3">
                {protocol.description}
              </Paragraph>
            </Surface>

            <ProtocolDetailFacts protocol={protocol} locale={locale} />

            <ProtocolCitation
              citation={protocol.citation}
              publicationUrl={protocol.publicationUrl}
            />
          </div>

          <Surface
            as="aside"
            noContainer
            spacing="lg"
            shadow="md"
            aria-labelledby={stageSequenceHeadingId}
            className="min-w-0 self-start"
          >
            <OverlineHeading id={stageSequenceHeadingId}>
              {t('stages.heading')}
            </OverlineHeading>
            <div className="mt-4">
              <StageSequenceRail downloads={protocol.downloads} />
            </div>
          </Surface>
        </div>
      </Container>

      <Footer />
    </main>
  );
}
