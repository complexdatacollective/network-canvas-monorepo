import { env } from '@/env.mjs';
import fs from 'fs';
import matter from 'gray-matter';
import { readdir } from 'node:fs/promises';
import { join, sep } from 'path';
import { isFolderPageAvailableForLocale } from './universal_helper_functions.mjs';

export type DocRouteParams = {
  params: {
    docPath: string;
  };
};

// Process docPaths to remove CWD, docs subdirectory, file extensions, and split into segments
export const processPath = (docPath: string) => {
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

export const relativePathToDocs = join(
  process.cwd(),
  env.NEXT_PUBLIC_DOCS_PATH,
);

export const getAllMarkdownDocs = async () => {
  const files = await readdir(relativePathToDocs, {
    withFileTypes: true,
    recursive: true,
  });

  return files
    .filter((dirent) => dirent.isFile()) // Only get files
    .filter(
      (dirent) => dirent.name.endsWith('.mdx') || dirent.name.endsWith('.md'),
    ) // Only get files with .md or .mdx extension
    .map((dirent) => join(dirent.path, dirent.name)); // Get the full path
};

// Get all project names
export const getAllProjects = function () {
  const projects = fs.readdirSync(relativePathToDocs);

  // Make projects unique
  return [...new Set(projects.flat())];
};

export function getDoc({
  locale,
  project,
  pathSegment,
}: {
  locale: string;
  project: string;
  pathSegment: string[];
}) {
  let pathSegmentWithLocale = pathSegment.join('/') + `.${locale}`;
  const result = isFolderPageAvailableForLocale(
    [project, ...pathSegment].join('/'),
    locale,
  );

  // Check if the file exists.
  let file;

  if (result) {
    pathSegmentWithLocale = pathSegment.join('/') + `/index.${locale}`;
  }

  const path = join(relativePathToDocs, project, pathSegmentWithLocale);

  if (fs.existsSync(path + '.md')) {
    file = path + '.md';
  } else if (fs.existsSync(path + '.mdx')) {
    file = path + '.mdx';
  } else {
    return null;
  }

  const markdownFile = fs.readFileSync(file, 'utf-8');
  const matterResult = matter(markdownFile);
  const { data: matterData } = matterResult;

  const getSummaryData = () => {
    const { summary, prerequisites, completion_time } = matterData;

    if (summary && prerequisites && completion_time) {
      return {
        summary: summary as string,
        prerequisites: prerequisites as string,
        completion_time: completion_time as string,
      };
    }

    return null;
  };

  const getInterfaceSummary = () => {
    const { image, type, creates, uses_prompts } = matterData;

    if (image && type && creates && uses_prompts) {
      return {
        image: image as string,
        type: type as string,
        creates: creates as string,
        uses_prompts: uses_prompts as string,
      };
    }

    return null;
  };

  const getBestPractices = () => {
    const { good, bad } = matterData;

    if (good && bad) {
      return {
        good: good as string[],
        bad: bad as string[],
      };
    }

    return null;
  };

  return {
    // Add other elements of the frontmatter here as needed.
    title: matterData.title as string,
    lastUpdated: matterData.date ? (matterData.date as string) : null,
    content: matterResult.content,
    toc: matterData.toc !== undefined ? (matterData.toc as boolean) : null,
    wip: matterData.wip !== undefined ? (matterData.wip as boolean) : null,
    summaryData: getSummaryData(),
    interfaceSummary: getInterfaceSummary(),
    bestPractices: getBestPractices(),
  };
}
