import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ProtocolPreviewLoader } from '~/components/protocol-gallery/preview/ProtocolPreviewLoader';
import { routing } from '~/lib/i18n/routing';
import { getProtocolBySlug, loadProtocolGallery } from '~/lib/protocolGallery';
import { protocolGalleryHref } from '~/lib/siteUrls';

type ProtocolPreviewPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const protocols = await loadProtocolGallery();
  return protocols.map((protocol) => ({ slug: protocol.slug }));
}

export async function generateMetadata({
  params,
}: ProtocolPreviewPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const protocol = await getProtocolBySlug(slug);
  if (!protocol) notFound();

  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });
  return {
    title: t('preview.metadata.title', { name: protocol.shortName }),
    // A running interview is not a page to index or share.
    robots: { index: false, follow: false },
  };
}

export default async function ProtocolPreviewPage({
  params,
}: ProtocolPreviewPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const protocol = await getProtocolBySlug(slug);
  if (!protocol) notFound();

  return (
    <main>
      <ProtocolPreviewLoader
        waves={protocol.downloads.map(
          ({ wave, protocolFilename, protocolPath }) => ({
            wave,
            protocolFilename,
            protocolPath,
          }),
        )}
        backHref={protocolGalleryHref(locale, protocol.slug)}
      />
    </main>
  );
}
