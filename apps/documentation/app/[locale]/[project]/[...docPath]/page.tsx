import { Separator } from '@/components/ui/separator';
import { getAllMarkdownDocs, getDoc, processPath } from '@/lib/docs';
import { getHeadings } from '@/lib/tableOfContents';
import { unstable_setRequestLocale } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import TableOfContents from './_components/TableOfContents';
import BestPractices from '../_components/customComponents/BestPractices';
import InterfaceSummary from '../_components/customComponents/InterfaceSummary';
import SummaryCard from '../_components/customComponents/SummaryCard';
import WorkInProgress from '../_components/customComponents/WorkInProgress';
import { customComponents } from '../_components/customComponents/customComponents';
import InnerLanguageSwitcher from '../_components/InnerLanguageSwitcher';
import { options } from '@/lib/mdxOptions';

type PageParams = {
  locale: string;
  project: string;
  docPath: string[];
};

type PageParamsWithoutDocPath = Omit<PageParams, 'docPath'>;

export function generateMetadata({ params }: { params: PageParams }) {
  const { locale, project, docPath } = params;
  const doc = getDoc({
    locale,
    project,
    pathSegment: docPath,
  });
  if (!doc || !doc.title) {
    throw new Error(`Error getting document title for:${docPath.join('')}`);
  }

  return { title: doc.title };
}

export async function generateStaticParams({
  params,
}: {
  params: PageParamsWithoutDocPath;
}) {
  const { locale, project } = params;
  const docs = await getAllMarkdownDocs();

  const filteredDocs = docs.map(processPath).filter((processedPathList) => {
    const docProject = processedPathList[0]; // get docProject
    const docLocale = processedPathList[processedPathList.length - 1]; // get docLocale;

    return locale === docLocale && project === docProject;
  });
  // removes the locale and project from filteredDocs
  const docsWithoutLocaleAndProject = filteredDocs.map((doc) =>
    doc.slice(1, -1),
  );
  // remove empty docPaths
  const filteredDocPaths = docsWithoutLocaleAndProject.filter(
    (docPath) => docPath.length,
  );

  return filteredDocPaths.map((docPath) => ({
    locale,
    project,
    docPath,
  }));
}

// The Page Component
const Page = async ({ params }: { params: PageParams }) => {
  const { locale, project, docPath } = params;
  const filePath = `/${project}/` + docPath.join('/'); //file path for InnerLanguage switcher
  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);

  const doc = getDoc({
    locale,
    project,
    pathSegment: docPath,
  });

  if (!doc || doc?.content === null) notFound();

  // Frontmatter data of markdown files
  const {
    title,
    content,
    lastUpdated,
    toc,
    wip,
    summaryData,
    interfaceSummary,
    bestPractices,
  } = doc;
  const headings = toc ? await getHeadings(content) : null;

  return (
    <div className="flex items-start gap-1">
      <article className="DocSearch-content prose prose-sm prose-slate mx-5 dark:prose-invert md:prose-base prose-blockquote:border-blue-500">
        <h1>{title}</h1>
        <InnerLanguageSwitcher currentLocale={locale} filePath={filePath} />
        {interfaceSummary && <InterfaceSummary data={interfaceSummary} />}
        {summaryData && <SummaryCard data={summaryData} />}
        {wip && <WorkInProgress />}
        <MDXRemote
          options={options}
          components={customComponents}
          source={content}
        />
        {bestPractices && <BestPractices data={bestPractices} />}
        <p className="text-sm text-red-400">{lastUpdated}</p>
      </article>
      {headings && (
        <div className="sticky top-20">
          <TableOfContents nodes={headings} />
          <Separator />
        </div>
      )}
    </div>
  );
};

export default Page;
