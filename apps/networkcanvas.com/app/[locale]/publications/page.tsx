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
import { Container } from '~/components/ui/Container';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { externalLinks } from '~/lib/content';
import { routing } from '~/lib/i18n/routing';
import { loadSiteContent } from '~/lib/siteContent';

type PublicationsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PublicationsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'PublicationsPage' });

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: {
      canonical: `https://networkcanvas.com/${locale}/publications`,
      languages: {
        'en-US': 'https://networkcanvas.com/en-US/publications',
        'en-GB': 'https://networkcanvas.com/en-GB/publications',
        'es': 'https://networkcanvas.com/es/publications',
      },
    },
  };
}

function renderArticleLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={externalLinks.publications}
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

function renderThreadLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={externalLinks.shareYourWork}
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

export default async function PublicationsPage({
  params,
}: PublicationsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const [{ publications }, t] = await Promise.all([
    loadSiteContent(locale),
    getTranslations({ locale, namespace: 'PublicationsPage' }),
  ]);

  // The CSV is curated newest-first within each batch rather than globally, so
  // the full listing sorts by year while the homepage keeps its file order.
  const sorted = publications.toSorted(
    (a, b) => Number(b.year) - Number(a.year),
  );

  return (
    <main className="relative isolate">
      <HomepagePageBackground />
      <div>
        <Header />
        <div className="tablet-portrait:pt-24 mx-auto max-w-4xl px-6 pt-16 text-center">
          <Heading
            level="h1"
            variant="display-heading"
            margin="none"
            className="text-text"
          >
            {t('heading')}
          </Heading>
          <Paragraph
            intent="lead"
            margin="none"
            className="text-text/75 mt-6 text-lg text-pretty"
          >
            {t.rich('citing', { article: renderArticleLink })}
          </Paragraph>
          <Paragraph
            intent="lead"
            margin="none"
            className="text-text/75 mt-3 text-lg text-pretty"
          >
            {t.rich('submission', { thread: renderThreadLink })}
          </Paragraph>
        </div>
        <Container>
          <ul className="divide-text/10 mx-auto max-w-4xl divide-y">
            {sorted.map((publication) => (
              <li key={publication.id} className="py-6">
                <Heading level="h3" margin="none">
                  <NativeLink
                    href={publication.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {publication.title}
                  </NativeLink>
                </Heading>
                <Paragraph intent="smallText" margin="none" className="mt-2">
                  {publication.authors}
                </Paragraph>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  margin="none"
                  className="mt-1"
                >
                  {publication.source}
                  <span aria-hidden="true"> · </span>
                  <time dateTime={publication.year}>{publication.year}</time>
                </Paragraph>
              </li>
            ))}
          </ul>
        </Container>
        <Footer />
      </div>
    </main>
  );
}
