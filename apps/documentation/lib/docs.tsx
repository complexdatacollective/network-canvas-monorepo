import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import rehypeFigure from '@microflash/rehype-figure';
import type { ComponentProps, ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { Options } from 'rehype-react';
import rehypeReact from 'rehype-react';
import slug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { z } from 'zod';

import Button from '@codaco/fresco-ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  OrderedList,
  UnorderedList,
} from '@codaco/fresco-ui/typography/UnorderedList';
import { cx } from '@codaco/fresco-ui/utils/cva';
import InterfacePicture, {
  type InterfacePictureProps,
} from '@codaco/interface-images/InterfacePicture';
import type {
  SidebarFolder,
  SidebarPage,
  SidebarSection,
  TSideBar,
} from '~/app/types';
import AppCompatibilityTable from '~/components/customComponents/AppCompatibilityTable';
import { AppOnly } from '~/components/customComponents/AppOnly';
import { AppOption, AppSwitch } from '~/components/customComponents/AppSwitch';
import type {
  AppKey,
  InterviewerKey,
} from '~/components/customComponents/appVariants';
import {
  BadPractice,
  GoodPractice,
} from '~/components/customComponents/BestPractices';
import CoordinateClassificationExample from '~/components/customComponents/CoordinateClassificationExample';
import ImageFullWidth from '~/components/customComponents/ImageFullWidth';
import {
  InterfaceMeta,
  InterfaceSummary,
} from '~/components/customComponents/InterfaceSummary';
import KeyConcept from '~/components/customComponents/KeyConcept';
import Pre from '~/components/customComponents/Pre';
import ResponsiveSvgPreview, {
  type ResponsiveSvgPreviewProps,
} from '~/components/customComponents/ResponsiveSvgPreview';
import { Screenshot } from '~/components/customComponents/Screenshot';
import {
  PrerequisitesSection,
  SummaryCard,
  SummarySection,
} from '~/components/customComponents/SummaryCard';
import TipBox, { type TipBoxProps } from '~/components/customComponents/TipBox';
import type { AppAxis } from '~/components/customComponents/useSelectedApp';
import VideoIFrame from '~/components/customComponents/VideoIFrame';
import WorkflowsOverview from '~/components/customComponents/WorkflowsOverview';
import DownloadLink from '~/components/DownloadLink';
import Link from '~/components/Link';
import { Details, Summary } from '~/components/ui/typography/Details';
import { ListItem } from '~/components/ui/typography/ListItem';
import { getCompatibility } from '~/lib/interfaceCompatibility';

import { DOCS_PATH, get } from './helper_functions';
import processPreTags from './processPreTags';
import processYamlMatter from './processYamlMatter';
import { type HeadingNode, headingTree } from './tableOfContents';
import unwrapBlockComponents from './unwrapBlockComponents';

const getSidebar = (): Partial<TSideBar> => {
  const sidebarPath = join(process.cwd(), 'public', 'sidebar.json');
  if (!existsSync(sidebarPath)) {
    return {};
  }
  const sidebarContent = readFileSync(sidebarPath, 'utf-8');
  return JSON.parse(sidebarContent) as TSideBar;
};

const FrontmatterSchema = z.object({
  title: z.string(),
  lastUpdated: z.string().optional(),
  hidden: z.boolean().optional(),
  wip: z.boolean().optional(),
  navOrder: z.number().optional(),
  toc: z.boolean().optional().default(true),
  // interfaces
  good: z.array(z.string()).optional(), // List of best practices
  bad: z.array(z.string()).optional(), // List of bad practices
});

// Process docPaths to remove CWD, docs subdirectory, file extensions, and split into segments
const processPath = (docPath: string) => {
  const processedPath = docPath
    .split(sep)
    .slice(3) // First element is empty string, second is 'docs', third is the section name
    // Process the last item to remove the locale and file extension
    .map((segment, index, array) => {
      if (index === array.length - 1) {
        // biome-ignore lint/style/noNonNullAssertion: we know that the last element is a string
        return segment.split('.')[0]!;
      }
      return segment;
    });

  return processedPath;
};

// Given locale and section, generate all the possible docPaths.
// Return something in the format of:
// {
//   locale: 'ru',
//   section: 'collect-data',
//   docPath: [ 'getting-started', 'installation' ]
// }
type ReturnType = {
  locale: string;
  section: string;
  docPath: string[];
};

export const getDocsForRouteSegment = ({
  locale,
  section,
}: {
  locale: string;
  section: string;
}) => {
  const sidebar = getSidebar();
  const sidebarData = get(sidebar, [locale, section], null) as SidebarSection;

  if (!sidebarData) {
    // biome-ignore lint/suspicious/noConsole: Logging missing sidebar data
    console.log(`No sidebar data found for ${locale} and ${section}`);
    return [];
  }

  const results: ReturnType[] = [];

  const getSourceFilePaths = (
    data: SidebarSection | SidebarFolder | SidebarPage,
  ) => {
    // Leaf node
    if (data.type === 'page') {
      results.push({
        locale,
        section,
        docPath: processPath(data.sourceFile),
      });
      return;
    }

    if (data.sourceFile && data.type !== 'section') {
      // Handle folders differently - if they have a sourceFile
      // docPath should generate a path pointing to the folder.
      results.push({
        locale,
        section,
        docPath: processPath(data.sourceFile).slice(0, -1),
      });
    }

    for (const key in data.children) {
      if (Object.hasOwn(data.children, key)) {
        const child = data.children[key];
        if (child) {
          getSourceFilePaths(child);
        }
      }
    }

    return;
  };

  getSourceFilePaths(sidebarData);

  return results;
};

// Source files in sidebar.json are recorded as "/<DOCS_PATH>/..." paths; strip
// that prefix so the remainder can be re-anchored under the docs/ subfolder by
// getSourceFile below.
const stripDocsPrefix = (sourceFile: string) =>
  sourceFile.replace(new RegExp(`^/?${DOCS_PATH}/`), '');

// Resolves a sidebar entry to an absolute markdown path. The 'docs' segment is
// written as a string literal (kept in sync with DOCS_PATH) on purpose:
// Turbopack's NFT tracer only bounds a path.join(process.cwd(), ...) read to a
// subfolder when that segment is a literal it can read statically. It does not
// constant-fold the DOCS_PATH import, so passing the variable here makes it
// trace the entire project and emit an "unexpected file in NFT list" warning.
const getSourceFile = (
  locale: string,
  section: string,
  pathSegment?: string[],
) => {
  const sidebar = getSidebar();
  const sectionSourceFile = get(
    sidebar,
    [locale, section, 'sourceFile'],
    null,
  ) as string;

  if (!pathSegment)
    return join(process.cwd(), 'docs', stripDocsPrefix(sectionSourceFile));

  const pathSegmentWithChildren = pathSegment.flatMap((segment, index) => {
    if (index === 0) {
      return segment;
    }

    return ['children', segment];
  });

  const folderSourceFile = get(
    sidebar,
    [locale, section, 'children', ...pathSegmentWithChildren, 'sourceFile'],
    null,
  ) as string | null;

  if (!folderSourceFile) return null;

  return join(process.cwd(), 'docs', stripDocsPrefix(folderSourceFile));
};

const createMarkdownComponents = (docSlug?: string) => ({
  // Fresco Heading owns size/weight/scroll-margin and the prose rhythm: its
  // default margin variant applies a self-collapsing not-first/not-last spacing,
  // so we leave both top and bottom margins entirely to fresco here. (The one
  // exception — suppressing the top margin of a heading directly below an
  // eyebrow/kicker — is handled in components/article.tsx.)
  h1: (props: ComponentProps<typeof Heading>) => (
    <Heading level="h1" {...props} />
  ),
  h2: (props: ComponentProps<typeof Heading>) => (
    <Heading level="h2" {...props} />
  ),
  h3: (props: ComponentProps<typeof Heading>) => (
    <Heading level="h3" {...props} />
  ),
  h4: (props: ComponentProps<typeof Heading>) => (
    <Heading level="h4" {...props} />
  ),
  p: Paragraph,
  paragraph: Paragraph,
  a: Link,
  ul: UnorderedList,
  ol: OrderedList,
  li: ListItem,
  blockquote: (props: { children: ReactNode }) => (
    <blockquote className="border-accent bg-surface-1 my-4 border-s-4 p-4">
      {props.children}
    </blockquote>
  ),
  pre: Pre,
  button: (props: ComponentProps<typeof Button>) => (
    <Button color="primary" {...props} />
  ),
  link: Link,
  // Static download (protocol bundle, roster, etc.). Authors mark a link as a
  // download explicitly — <DownloadLink href="/protocols/Example.netcanvas">…</DownloadLink>
  // — rather than relying on href sniffing; these render as a plain <a download>
  // because next/link would route to a non-existent page.
  downloadlink: DownloadLink,
  tipbox: (props: TipBoxProps) => {
    return (
      <TipBox danger={props.danger !== undefined}>{props.children}</TipBox>
    );
  },
  imagefullwidth: (props: { src: string; alt: string }) => (
    <ImageFullWidth {...props} />
  ),
  responsivesvgpreview: (props: ResponsiveSvgPreviewProps) => (
    <ResponsiveSvgPreview {...props} />
  ),
  coordinateclassificationexample: () => <CoordinateClassificationExample />,
  // Generated interface screenshots from @codaco/interface-images, e.g.
  // <interfacepicture type="Sociogram" ratio="16:9" alt="..." />
  interfacepicture: (props: InterfacePictureProps) => (
    <div className="my-10 w-full px-8">
      <InterfacePicture
        sizes="(min-width: 56rem) 48rem, 100vw"
        {...props}
        className="w-full rounded"
      />
    </div>
  ),
  figure: (props: { children: ReactNode }) => (
    <figure
      {...props}
      className={cx(
        'my-10 flex w-full flex-col items-center justify-center',
        '[--shadow-color:color-mix(in_lab,var(--background)_80%,black)]',
        '[&>a]:m-0 [&>a]:w-full [&>a]:drop-shadow-[0_0.5rem_1rem_var(--shadow-color)]',
      )}
    />
  ),
  figcaption: (props: { children: ReactNode }) => (
    <figcaption {...props} className="mt-2 text-center text-sm italic" />
  ),
  img: (props: { src?: string; alt?: string }) => (
    <a
      href={props.src}
      target="_blank"
      rel="noreferrer"
      className="my-10 w-full px-8"
    >
      {/* biome-ignore lint/performance/noImgElement: markdown content with unknown dimensions */}
      <img {...props} alt={props.alt} className="w-full" />
    </a>
  ),
  keyconcept: (props: { title: string; children: ReactNode }) => (
    <KeyConcept {...props} />
  ),
  goodpractice: (props: { children: ReactNode }) => <GoodPractice {...props} />,
  badpractice: (props: { children: ReactNode }) => <BadPractice {...props} />,
  videoiframe: (props: { src: string; title: string }) => (
    <VideoIFrame {...props} />
  ),
  summarycard: (props: { duration: string; children: ReactNode }) => (
    <SummaryCard {...props} />
  ),
  prerequisitessection: (props: { children: ReactNode }) => (
    <PrerequisitesSection {...props} />
  ),
  summarysection: (props: { children: ReactNode }) => (
    <SummarySection {...props} />
  ),
  interfacesummary: (props: { type: string; children: ReactNode }) => (
    <InterfaceSummary {...props} />
  ),
  appcompatibilitytable: () => <AppCompatibilityTable />,
  workflowsoverview: () => <WorkflowsOverview />,
  interfacemeta: (props: {
    type: string;
    creates: string;
    usesprompts: string;
    requires?: string;
  }) => <InterfaceMeta {...props} compatibility={getCompatibility(docSlug)} />,
  definition: (props: { children: ReactNode }) => (
    <div className="text-lg font-normal">{props.children}</div>
  ),
  appswitch: (props: { children: ReactNode; axis?: AppAxis }) => (
    <AppSwitch {...props} />
  ),
  appoption: (props: {
    label: string;
    icon?: 'globe' | 'desktop';
    children: ReactNode;
  }) => <AppOption {...props} />,
  apponly: (
    props:
      | { axis?: 'architect'; app: AppKey; children: ReactNode }
      | { axis: 'interviewer'; app: InterviewerKey; children: ReactNode },
  ) => <AppOnly {...props} />,
  screenshot: (props: { axis: AppAxis; name: string; alt?: string }) => (
    <Screenshot {...props} />
  ),
  // Markdown tables render through fresco-ui's Table primitives so they match
  // the design system (surface-tinted header, row separators + hover, rounded
  // bordered container). Cells override fresco's data-table
  // `whitespace-nowrap` because docs tables carry prose (sentences, links) that
  // must wrap.
  // Spacing goes on the Surface via `surfaceProps`, not `className` — Table's
  // `className` targets the inner <table>, so `my-6` there would open a gap of
  // bare surface above/below the rows inside the bordered container.
  table: (props: ComponentProps<typeof Table>) => (
    <Table surfaceProps={{ className: 'my-6' }} {...props} />
  ),
  thead: (props: ComponentProps<typeof TableHeader>) => (
    <TableHeader {...props} />
  ),
  tbody: (props: ComponentProps<typeof TableBody>) => <TableBody {...props} />,
  tr: (props: ComponentProps<typeof TableRow>) => <TableRow {...props} />,
  th: (props: ComponentProps<typeof TableHead>) => (
    <TableHead
      {...props}
      className={cx('w-auto whitespace-normal', props.className)}
    />
  ),
  td: (props: ComponentProps<typeof TableCell>) => (
    <TableCell className="w-auto align-top whitespace-normal" {...props} />
  ),
  details: Details,
  summary: Summary,
});

export async function getDocumentForPath({
  locale,
  section,
  pathSegment,
}: {
  locale: string;
  section: string;
  pathSegment?: string[];
}) {
  const sourceFile = getSourceFile(locale, section, pathSegment);

  if (!sourceFile || (sourceFile && !existsSync(sourceFile))) {
    return null;
  }

  const markdownFile = readFileSync(sourceFile, 'utf-8');

  const docSlug = pathSegment?.at(-1);

  const result = await unified()
    .use(remarkParse, { fragment: true })
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(processYamlMatter)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeFigure)
    .use(rehypeRaw)
    .use(unwrapBlockComponents)
    .use(slug)
    .use(headingTree)
    .use(processPreTags)
    .use(rehypeHighlight, { detect: true })
    .use(rehypeReact, {
      Fragment,
      jsx,
      jsxs,
      components: createMarkdownComponents(docSlug),
    } as Options)
    .process(markdownFile);

  const validatedFrontmatter = FrontmatterSchema.parse(result.data.matter);

  return {
    frontmatter: validatedFrontmatter,
    headings: result.data.headings as HeadingNode[],
    component: result.result,
  };
}
