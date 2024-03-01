import fs, { existsSync, readFileSync } from 'fs';
import { readdir } from 'node:fs/promises';
import { join, sep } from 'path';
import sidebar from '~/public/sidebar.json' assert { type: 'json' };
import { get, relativePathToDocs } from './helper_functions';
import { z } from 'zod';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeReact, {type Options } from 'rehype-react';
import processYamlMatter from './processYamlMatter';
import { Heading, ListItem, OrderedList, Paragraph, UnorderedList } from '@acme/ui';
import * as prod from 'react/jsx-runtime'
import Link from '~/components/Link';

export type DocRouteParams = {
  params: {
    docPath: string;
  };
};

export const FrontmatterSchema = z.object({
  title: z.string(),
  lastUpdated: z.string().optional(),
  hidden: z.boolean().optional(),
  wip: z.boolean().optional(),
  nav_order: z.number().optional(),
  toc: z.boolean().optional(),
  // Tutorials
    summary: z.string().optional(), // Summary of the tutorial
  prerequisites: z.string().optional(), // Prerequisites for the tutorial
  completion_time: z.string().optional(), // Estimated time to complete the tutorial
  // interfaces
    image: z.string().optional(), // Path to hero image
  type: z.string().optional(), // Name of interface
  creates: z.string().optional(), // What the interface creates
  uses_prompts: z.string().optional(), // If the interface supports prompts
  good: z.array(z.string()).optional(), // List of best practices
  bad: z.array(z.string()).optional(), // List of bad practices
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

// Process docPaths to remove CWD, docs subdirectory, file extensions, and split into segments
const processPath = (docPath: string) => {
  const processedPath = docPath
    .replace(process.cwd() + sep, '') // Remove CWD
    .replace('docs' + sep, '') // Remove docs subdirectory
    .replace(sep + 'index', '') // Remove folder page path
    .replace('.mdx', '')
    .replace('.md', ''); // Remove file extensions

  const locale = processedPath.split('.')[1]; // get locale from file path
  // Remove file locale and split into segments based on the platform directory separator
  const processedPathList = processedPath.replace(/\.\w+$/, '').split(sep);
  return [...processedPathList, locale];
};

export const getDocsForRouteSegment = async ({ locale, project }: { locale: string, project: string }) => {
  const files = await readdir(relativePathToDocs, {
    withFileTypes: true,
    recursive: true,
  });

  return files
    .filter((dirent) => dirent.isFile()) // Only get files
    .filter(
      (dirent) => dirent.name.endsWith('.mdx') || dirent.name.endsWith('.md'),
    ) // Only get files with .md or .mdx extension
    .map((dirent) => join(dirent.path, dirent.name)) // Get the full path
    .map(processPath) // Process the path to remove CWD, docs subdirectory, file extensions, and split into segments
    .filter((pathSegments) => { // Filter out paths that don't match the current locale and project
      const docProject = pathSegments[0]; 
      const docLocale = pathSegments[pathSegments.length - 1];

      return locale === docLocale && project === docProject;
    });
};

// Get the sourceFile path from the sidebar.json
const getSourceFile = (locale: string, project: string, pathSegment?: string[]) => {
  const sourceFile = get(sidebar, [locale, project, 'sourceFile'], null) as string;

  if (!pathSegment) return join(process.cwd(), sourceFile);


  // TODO: handle sourcefiles for folders
  const pathSegmentWithChildren = pathSegment.map((segment, index) => {
    if (index === 0) {
      return segment;
    }

    return ['children', segment];
  }).flat();

  return join(process.cwd(), get(sidebar, [locale, project, 'children', ...pathSegmentWithChildren, 'sourceFile'], null) as string);
}

// Get all project names
export const getAllProjects = function () {
  const projects = fs.readdirSync(relativePathToDocs);

  // Make projects unique
  return [...new Set(projects.flat())];
};

export async function getDocumentForPath({
  locale,
  project,
  pathSegment,
}: {
  locale: string;
  project: string;
  pathSegment?: string[];
}) {
  const sourceFile = getSourceFile(locale, project, pathSegment);

  if (!existsSync(sourceFile)) {
    // eslint-disable-next-line no-console
    console.log(`File not found: ${sourceFile}`);
    return null;
  }

  const markdownFile = readFileSync(sourceFile, 'utf-8');

  const result = await unified()
    .use(remarkParse, {fragment: true})
    .use(remarkFrontmatter)
    .use(processYamlMatter)
    .use(remarkRehype)
    .use(rehypeReact, {
      Fragment: prod.Fragment,
      jsx: prod.jsx,
      jsxs: prod.jsxs,
      components: {
        h1: (props: JSX.IntrinsicElements['h1']) => <Heading variant='h1' {...props} />,
        h2: (props: JSX.IntrinsicElements['h2']) => <Heading variant='h2' {...props} />,
        h3: (props: JSX.IntrinsicElements['h3']) => <Heading variant='h3' {...props} />,
        h4: (props: JSX.IntrinsicElements['h4']) => <Heading variant='h4' {...props} />,
        p: Paragraph,
        a: Link,
        ul: UnorderedList,
        ol: OrderedList,
        li: ListItem,
      }
    } as Options)
    .process(markdownFile);


  const validatedFrontmatter = FrontmatterSchema.parse(result.data.matter);

  return {
    frontmatter: validatedFrontmatter,
    component: result.result,
  }
}
