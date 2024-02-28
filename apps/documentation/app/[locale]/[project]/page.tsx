import { notFound } from 'next/navigation';
import { unstable_setRequestLocale } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';

import { Heading } from '@acme/ui';

import { getDoc } from '~/lib/docs';
import { options } from '~/lib/mdxOptions';
import { customComponents } from './_components/customComponents/customComponents';
import InnerLanguageSwitcher from './_components/InnerLanguageSwitcher';

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

  if (!doc?.content) notFound();

  // Frontmatter data of markdown files
  const { title, content, lastUpdated } = doc;

  return (
    <article className="mx-5">
      <Heading variant="h1">{title}</Heading>
      <InnerLanguageSwitcher currentLocale={locale} filePath={filePath} />
      <MDXRemote
        options={options}
        components={customComponents}
        source={content}
      />
      <p className="text-sm text-destructive">Last updated: {lastUpdated}</p>
    </article>
  );
}
