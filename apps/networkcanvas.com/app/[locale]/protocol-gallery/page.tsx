import { ArrowUpRight, BookOpenText } from 'lucide-react';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Badge } from '@codaco/fresco-ui/Badge';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { ProtocolGallery } from '~/components/protocol-gallery/ProtocolGallery';
import { ProtocolPattern } from '~/components/protocol-gallery/ProtocolPattern';
import { Container } from '~/components/ui/Container';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { Link } from '~/lib/i18n/navigation';
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

export default async function ProtocolGalleryPage({
  params,
}: ProtocolGalleryPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });
  const protocols = await loadProtocolGallery();
  const featuredProtocol = protocols.find((protocol) => protocol.featured);

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
            className="text-text/75 mx-auto mt-6 max-w-3xl text-lg text-pretty"
          >
            {t('intro.introduction')}
          </Paragraph>
          <div className="font-heading text-primary mt-7 inline-flex items-center gap-2 font-black">
            <BookOpenText aria-hidden className="size-5" />
            {t('intro.count', { count: protocols.length })}
          </div>
        </div>
      </div>

      {featuredProtocol ? (
        <Container maxWidth="wide" className="mt-0! mb-28!">
          <Link
            href={`/protocol-gallery/${featuredProtocol.slug}`}
            aria-label={t('intro.exploreFeatured', {
              title: featuredProtocol.title,
            })}
            className="focusable group block rounded"
          >
            <Surface
              noContainer
              spacing="none"
              shadow="sm"
              className="border-outline/20 relative min-h-[30rem] border"
            >
              <ProtocolPattern
                name={featuredProtocol.title}
                className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-[1.025] group-focus-visible:scale-[1.025] motion-reduce:transform-none"
              />
              <div
                aria-hidden
                className="from-surface via-surface/95 tablet-landscape:bg-linear-to-r tablet-landscape:via-55% tablet-landscape:to-90% absolute inset-0 bg-linear-to-t via-65% to-transparent"
              />
              <div className="tablet-portrait:p-10 tablet-landscape:items-center relative z-10 flex min-h-[30rem] items-end p-7">
                <div className="tablet-landscape:max-w-[62%] max-w-3xl min-w-0">
                  <Badge color="neon-coral">{t('intro.featured')}</Badge>
                  <Heading
                    level="h2"
                    margin="none"
                    className="mt-6 text-3xl wrap-break-word"
                  >
                    {featuredProtocol.title}
                  </Heading>
                  <Paragraph
                    margin="none"
                    className="text-text/60 mt-3 text-sm"
                  >
                    {featuredProtocol.authors}
                  </Paragraph>
                  <Paragraph
                    margin="none"
                    className="text-text/80 mt-5 max-w-2xl text-lg leading-relaxed"
                  >
                    {featuredProtocol.description}
                  </Paragraph>
                  <span className="text-primary mt-7 flex items-center gap-2 font-bold">
                    {t('intro.viewFeatured')}
                    <ArrowUpRight
                      aria-hidden
                      className="size-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 group-focus-visible:translate-x-1 group-focus-visible:-translate-y-1 motion-reduce:transform-none"
                    />
                  </span>
                </div>
              </div>
            </Surface>
          </Link>
        </Container>
      ) : null}

      <Container maxWidth="wide" className="mt-0!">
        <ProtocolGallery protocols={protocols} />
      </Container>

      <Footer />
    </main>
  );
}
