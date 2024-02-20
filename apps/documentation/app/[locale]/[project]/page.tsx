import { getDoc } from '@/lib/docs';
import { options } from '@/lib/mdxOptions';
import { unstable_setRequestLocale } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import InnerLanguageSwitcher from './_components/InnerLanguageSwitcher';
import { customComponents } from './_components/customComponents/customComponents';

type PageProps = { params: { locale: string; project: string } };

export default function Page({ params }: PageProps) {
  const { locale, project } = params;
  const filePath = `/${project}`; //file path for InnerLanguage switcher

  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(params.locale);

  const doc = getDoc({
    locale,
    project,
    pathSegment: ['index'], // pointing to home page for the project
  });

  if (!doc || doc?.content === null) notFound();

  // Frontmatter data of markdown files
  const { title, content, lastUpdated } = doc;

  return (
    <article className="DocSearch-content prose prose-sm prose-slate mx-5 dark:prose-invert md:prose-base prose-blockquote:border-blue-500">
      <h1>{title}</h1>
      <InnerLanguageSwitcher currentLocale={locale} filePath={filePath} />
      <MDXRemote
        options={options}
        components={customComponents}
        source={content}
      />
      <p className="text-sm text-red-400">{lastUpdated}</p>
    </article>
  );
}
