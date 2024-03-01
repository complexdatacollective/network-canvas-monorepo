import { notFound } from 'next/navigation';
import { unstable_setRequestLocale } from 'next-intl/server';
import { createPortal } from 'react-dom';

import { getDocsForRouteSegment, getDocumentForPath } from '~/lib/docs';
import Article from '../../_components/article';

type PageParams = {
  locale: string;
  project: string;
  docPath: string[];
};

export async function generateMetadata({ params }: { params: PageParams }) {
  const { locale, project, docPath } = params;
  const document = await getDocumentForPath({
    locale,
    project,
    pathSegment: docPath,
  });

  return { title: document?.frontmatter.title };
}

export async function generateStaticParams({
  params,
}: {
  params: Omit<PageParams, 'docPath'>;
}) {
  const { locale, project } = params;
  const docPathSegmentsForRoute = await getDocsForRouteSegment({
    locale,
    project,
  });

  return docPathSegmentsForRoute
    .map((docPathSegments) => docPathSegments.slice(1, -1)) // Remove project and locale from the path
    .filter((docPathSegments) => docPathSegments.length) // Remove empty paths
    .map((docPathSegments) => ({
      // Map to the expected params shape
      locale,
      project,
      docPath: docPathSegments,
    }));
}

export default async function Page({ params }: { params: PageParams }) {
  const { locale, project, docPath } = params;
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);

  const document = await getDocumentForPath({
    locale,
    project,
    pathSegment: docPath,
  });

  if (document === null) notFound();

  // const tableOfContents = collectSections(nodes);

  return (
    <>
      <Article
        content={document.component}
        title={document.frontmatter.title}
      />
      {/* {createPortal(
        <ArticleTOC content={content} />,
        document.getElementById('article-toc')!,
      )} */}
    </>
  );
}
