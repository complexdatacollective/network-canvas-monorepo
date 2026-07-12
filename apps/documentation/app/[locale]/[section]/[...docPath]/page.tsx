import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import Article from '~/components/article';
import { getDocsForRouteSegment, getDocumentForPath } from '~/lib/docs';

type PageParams = {
  locale: string;
  section: string;
  docPath: string[];
};

export async function generateMetadata(props: { params: Promise<PageParams> }) {
  const params = await props.params;
  const { locale, section, docPath } = params;
  const document = await getDocumentForPath({
    locale,
    section,
    pathSegment: docPath,
  });

  return { title: document?.frontmatter.title };
}

export async function generateStaticParams({ params }: { params: PageParams }) {
  const { locale, section } = params;
  const docPathSegmentsForRoute = getDocsForRouteSegment({
    locale,
    section,
  });

  return docPathSegmentsForRoute;
}

export default async function Page(props: { params: Promise<PageParams> }) {
  const params = await props.params;
  const { locale, section, docPath } = params;
  // setting setRequestLocale to support next-intl for static rendering
  setRequestLocale(locale);

  const document = await getDocumentForPath({
    locale,
    section,
    pathSegment: docPath,
  });

  if (document === null) notFound();

  return (
    <Article
      content={document.component}
      title={document.frontmatter.title}
      headings={document.headings}
      showToc={document.frontmatter.toc && document.headings.length > 0}
      wip={document.frontmatter.wip}
    />
  );
}
