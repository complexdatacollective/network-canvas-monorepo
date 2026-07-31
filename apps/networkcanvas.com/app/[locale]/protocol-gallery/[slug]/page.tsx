import { ArrowLeft, ExternalLink } from 'lucide-react';
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
import { ProtocolDownloads } from '~/components/protocol-gallery/ProtocolDownloads';
import { ProtocolPattern } from '~/components/protocol-gallery/ProtocolPattern';
import { Container } from '~/components/ui/Container';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { cn } from '~/lib/cn';
import { Link } from '~/lib/i18n/navigation';
import { routing } from '~/lib/i18n/routing';
import { getProtocolBySlug, loadProtocolGallery } from '~/lib/protocolGallery';

type ProtocolDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const protocols = await loadProtocolGallery();
  return protocols.map((protocol) => ({ slug: protocol.slug }));
}

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
}: ProtocolDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const protocol = await getProtocolBySlug(slug);
  if (!protocol) notFound();

  const pathname = `/protocol-gallery/${protocol.slug}`;
  return {
    title: protocol.title,
    description: protocol.description,
    alternates: {
      canonical: `https://networkcanvas.com/${locale}${pathname}`,
      languages: localeAlternates(pathname),
    },
  };
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-outline/40 border-b pb-5 last:border-b-0 last:pb-0">
      <dt className="font-heading text-text/55 text-xs font-black tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-2 leading-relaxed">{children}</dd>
    </div>
  );
}

const contactEmailPattern = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

function ProtocolContact({ contact }: { contact: string }) {
  const matches = [...contact.matchAll(contactEmailPattern)];
  if (matches.length === 0) return contact;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const email = match[0];
    const index = match.index;
    if (index > cursor) parts.push(contact.slice(cursor, index));
    parts.push(
      <a
        key={`${index}-${email}`}
        href={`mailto:${email}`}
        className="focusable text-primary rounded-sm underline underline-offset-4"
      >
        {email}
      </a>,
    );
    cursor = index + email.length;
  }

  if (cursor < contact.length) parts.push(contact.slice(cursor));
  return parts;
}

export default async function ProtocolDetailPage({
  params,
}: ProtocolDetailPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const protocol = await getProtocolBySlug(slug);
  if (!protocol) notFound();

  const t = await getTranslations({ locale, namespace: 'ProtocolGallery' });
  const dateAdded = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${protocol.dateAdded}T00:00:00Z`));
  const clinicalTrialsIsUrl =
    protocol.clinicalTrialsRegistration.startsWith('https://');

  return (
    <main className="relative isolate">
      <HomepagePageBackground target="[data-protocol-detail-weave-target]" />
      <Header activeItemId="protocolGallery" />

      <Container maxWidth="wide" className="mt-12!">
        <Link
          href="/protocol-gallery"
          className="focusable text-primary inline-flex items-center gap-2 rounded-sm font-bold"
        >
          <ArrowLeft aria-hidden className="size-5" />
          {t('detail.back')}
        </Link>

        <div
          data-protocol-detail-weave-target
          className="elevation-low bg-surface relative mt-10 min-h-[27rem] overflow-clip rounded"
        >
          <ProtocolPattern
            name={protocol.title}
            className="absolute inset-0 size-full"
          />
          <div
            aria-hidden
            className="from-surface via-surface/95 tablet-landscape:bg-linear-to-r tablet-landscape:via-55% tablet-landscape:to-90% absolute inset-0 bg-linear-to-t via-65% to-transparent"
          />
          <div className="tablet-portrait:p-12 tablet-landscape:items-center relative z-10 flex min-h-[27rem] items-end p-7">
            <div className="tablet-landscape:max-w-[62%] max-w-3xl min-w-0">
              {protocol.featured ? (
                <Badge color="neon-coral">{t('intro.featured')}</Badge>
              ) : null}
              <Heading
                level="h1"
                margin="none"
                className={cn(
                  'text-2xl font-black wrap-break-word',
                  protocol.featured && 'mt-6',
                )}
              >
                {protocol.title}
              </Heading>
              <Paragraph
                margin="none"
                className="text-text/70 mt-4 max-w-2xl leading-relaxed"
              >
                {protocol.authors}
              </Paragraph>
            </div>
          </div>
        </div>

        <div className="tablet-landscape:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.75fr)] mt-12 grid grid-cols-[minmax(0,1fr)] gap-8">
          <div className="min-w-0 space-y-8">
            <Surface spacing="lg" shadow="md">
              <Heading level="h2" margin="none" className="text-xl">
                {t('detail.summary')}
              </Heading>
              <Paragraph
                margin="none"
                className="text-text/80 mt-4 leading-relaxed"
              >
                {protocol.summary}
              </Paragraph>
            </Surface>

            <Surface spacing="lg" shadow="md">
              <Heading level="h2" margin="none" className="text-xl">
                {t('detail.citation')}
              </Heading>
              <Paragraph
                margin="none"
                className="text-text/80 mt-5 leading-relaxed whitespace-pre-line"
              >
                {protocol.citation}
              </Paragraph>
              <a
                href={protocol.publicationUrl}
                target="_blank"
                rel="noreferrer"
                className="focusable text-primary mt-5 inline-flex items-center gap-2 rounded-sm font-bold"
              >
                {t('detail.viewPublication')}
                <ExternalLink aria-hidden className="size-4" />
              </a>
            </Surface>

            <ProtocolDownloads
              downloads={protocol.downloads}
              supplementaryMaterials={protocol.supplementaryMaterials}
              sandboxUrl={protocol.sandboxUrl}
            />
          </div>

          <Surface
            as="aside"
            spacing="lg"
            shadow="md"
            className="min-w-0 self-start"
          >
            <Heading level="h2" margin="none" className="text-xl">
              {t('detail.details')}
            </Heading>
            <dl className="mt-7 space-y-5">
              <DetailItem label={t('detail.studyPi')}>
                {protocol.studyPi}
              </DetailItem>
              <DetailItem label={t('detail.grantNumber')}>
                {protocol.grantNumber}
              </DetailItem>
              <DetailItem label={t('detail.contact')}>
                <ProtocolContact contact={protocol.contact} />
              </DetailItem>
              <DetailItem label={t('detail.methods')}>
                {protocol.edgeGeneration}
              </DetailItem>
              <DetailItem label={t('detail.fields')}>
                {protocol.fields}
              </DetailItem>
              <DetailItem label={t('detail.population')}>
                {protocol.population}
              </DetailItem>
              <DetailItem label={t('detail.clinicalTrials')}>
                {clinicalTrialsIsUrl ? (
                  <a
                    href={protocol.clinicalTrialsRegistration}
                    target="_blank"
                    rel="noreferrer"
                    className="focusable text-primary inline-flex min-w-0 items-center gap-2 rounded-sm break-all underline underline-offset-4"
                  >
                    {protocol.clinicalTrialsRegistration}
                    <ExternalLink aria-hidden className="size-4 shrink-0" />
                  </a>
                ) : (
                  protocol.clinicalTrialsRegistration
                )}
              </DetailItem>
              <DetailItem label={t('detail.dateAdded')}>{dateAdded}</DetailItem>
            </dl>
          </Surface>
        </div>
      </Container>

      <Footer />
    </main>
  );
}
