import { notFound } from 'next/navigation';
import { unstable_setRequestLocale } from 'next-intl/server';
import { getDocumentForPath } from '~/lib/docs';
import Article from '~/components/article';
import type { LocalesEnum } from '~/app/types';

type PageProps = { params: { locale: LocalesEnum; project: string } };

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
    <Article
      content={document.component}
      title={document.frontmatter.title}
      headings={document.headings}
    />
  );
}
