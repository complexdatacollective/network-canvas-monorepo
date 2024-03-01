import { notFound } from 'next/navigation';
import { unstable_setRequestLocale } from 'next-intl/server';
import { getDocumentForPath } from '~/lib/docs';
import Article from '../_components/article';

type PageProps = { params: { locale: string; project: string } };

export default async function Page({ params }: PageProps) {
  const { locale, project } = params;

  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(params.locale);

  const document = await getDocumentForPath({
    locale,
    project,
  });

  if (document === null) notFound();

  return (
    <Article content={document.component} title={document.frontmatter.title} />
  );
}
