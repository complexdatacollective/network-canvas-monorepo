import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type fs from 'node:fs';
import matter from 'gray-matter';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import type {
  LocalesEnum,
  SidebarFolder,
  SidebarPage,
  SidebarProject,
} from '~/app/types';
import { locales, MetadataFile } from '~/app/types';
import { env } from '../env.mjs';

export const relativePathToDocs = join(
  process.cwd(),
  env.NEXT_PUBLIC_DOCS_PATH,
);

// Converts markdown to text which we use to push to Algolia
export async function markdownToText(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  return result
    .toString()
    .replace(/<[^>]*>/g, '')
    .replace(/\.\.\//g, ''); // remove HTML tags and relative paths
}

// Converts text to URL eg: Network Canvas => network-canvas
export function convertToUrlText(text: string): string {
  const lowercaseText = text.toLowerCase();
  const hyphenatedText = lowercaseText.replace(/\s+/g, '-');
  const cleanedText = hyphenatedText.replace(/[^a-z0-9-\u0400-\u04FF]/g, '');

  return cleanedText;
}

// get available locales for the document
export function getAvailableLocales() {
  // const availableLocales = locales.filter((locale) => {
  //   const localeBasedSidebarData = getLocaleBasedSidebarData(
  //     sidebarData,
  //     locale,
  //   );
  //   let result;

  //   for (const folder of localeBasedSidebarData) {
  //     result = isPathExist(folder, filePath);
  //     if (result) break;
  //   }

  //   return result;
  // });

  // return availableLocales;

  // eslint-disable-next-line no-console
  console.log('reimplement getAvailableLocales');
  return locales;
}

/**
 * Given a path, return an array for each path segment, inserting 'children'
 * between each value (to mirror for format needed by TSideBar).
 *
 * @param path {string} - The path to convert
 * @returns
 */
export const getNestedPath = (path: string) => {
  // Remove the relative path to the docs
  const withoutRelativePath = path.replace(relativePathToDocs, '');

  // Split the path into an array of folders
  const asArray = withoutRelativePath.split('/').filter(Boolean);

  // insert 'children', between each value
  return asArray
    .map((value) => {
      return [value, 'children'];
    })
    .flat();
};

// WARNING: This is not a drop in replacement solution and
// it might not work for some edge cases. Test your code!
export const get = (obj, path, defValue) => {
  // If path is not defined or it has false value
  if (!path) return undefined;
  // Check if path is string or array. Regex : ensure that we do not have '.' and brackets.
  // Regex explained: https://regexr.com/58j0k
  const pathArray = Array.isArray(path) ? path : path.match(/([^[.\]])+/g);
  // Find value
  const result = pathArray.reduce(
    (prevObj, key) => prevObj && prevObj[key],
    obj,
  );
  // If found value is undefined return default value; otherwise return the value
  return result === undefined ? defValue : result;
};

/**
 * Replacement for lodash's set function. Given an object, a path array, and a
 * value, set the value at the path. If the path doesn't exist, create it.
 *
 * @param obj {Record<string | number, unknown>}
 * @param pathArray {(string | number)[]}
 * @param value {unknown}
 */
export const set = (
  obj: Record<string | number, unknown>,
  pathArray: (string | number)[],
  value: unknown,
): void => {
  // @ts-expect-error: No way to type this that I can think of...
  pathArray.reduce((acc: Record<string | number, unknown>, key, i) => {
    if (acc[key] === undefined) {
      acc[key] = {};
    }
    if (i === pathArray.length - 1) {
      acc[key] = value;
    }
    return acc[key];
  }, obj);
};

/**
 * Given a directoryPath, look for a metadata.json file within, and parse it
 * against a zod schema into a MetadataFile type.
 * @param directoryPath {string}
 * @returns {MetadataFile}
 */
export const getMetaDataForDirectory = (directoryPath: string) => {
  const metadataPath = join(directoryPath, 'metadata.json');
  if (!existsSync(metadataPath)) {
    throw new Error(`No metadata.json found at ${directoryPath}`);
  }

  const metadataString = readFileSync(metadataPath, 'utf-8');
  const metadataRaw = JSON.parse(metadataString) as unknown;

  const parsed = MetadataFile.parse(metadataRaw);

  return parsed;
};

/**
 * Given a file, a locale, and metadata, create a project entry for the sidebar.
 *
 * @param file {fs.Dirent}
 * @param locale {LocalesEnum}
 * @param metadata {MetadataFile}
 * @returns {SidebarProject}
 */
export const createProjectEntry = (
  file: fs.Dirent,
  locale: LocalesEnum,
  metadata: MetadataFile,
): SidebarProject => {
  const localeIndexFile = metadata.localeIndexFiles?.[locale];
  const sourceFile = localeIndexFile
    ? join(file.path, file.name, localeIndexFile).replace(process.cwd(), '')
    : undefined;

  console.log('projectsourcefile', {
    sourceFile,
    path: file.path,
    localeIndexFile,
    metadata,
    name: file.name,
    locale,
  });

  return {
    type: 'project',
    sourceFile,
    label: metadata.localeLabels?.[locale] ?? file.name,
    children: {},
  };
};

/**
 * Given a file, a locale, and metadata, create a folder entry for the sidebar.
 *
 * @param file {fs.Dirent}
 * @param locale {LocalesEnum}
 * @param metadata {MetadataFile}
 * @returns {SidebarFolder}
 */
export const createFolderEntry = (
  file: fs.Dirent,
  locale: LocalesEnum,
  metadata: MetadataFile,
): SidebarFolder => {
  const localeIndexFile = metadata.localeIndexFiles?.[locale];
  const sourceFile = localeIndexFile
    ? join(file.path, file.name, localeIndexFile).replace(process.cwd(), '')
    : undefined;

  return {
    type: 'folder',
    expanded: metadata.isExpanded ?? false,
    sourceFile,
    label: metadata.localeLabels?.[locale] ?? file.name,
    children: {},
  };
};

/**
 * Given a file and a matter result, create a page entry for the sidebar.
 *
 * @param file {fs.Dirent}
 * @param matterResult {matter.GrayMatterFile<string>}
 * @returns {SidebarPage}
 */
export const createPageEntry = (
  file: fs.Dirent,
  matterResult: matter.GrayMatterFile<string>,
): SidebarPage => {
  const title = matterResult.data?.title as string | undefined;
  return {
    type: 'page',
    sourceFile: join(file.path, file.name).replace(process.cwd(), ''),
    label: title ?? file.name,
  };
};

/**
 * Given a file, return the nav_order from the frontmatter, or Infinity if it
 * doesn't exist.
 *
 * @param file {fs.Dirent}
 * @returns {number}
 */
export const getOrder = (file: fs.Dirent): number => {
  if (!file.isDirectory()) {
    const path = join(file.path, file.name);
    const markdownFile = readFileSync(path, 'utf-8');
    const { data } = matter(markdownFile);
    return (data.nav_order as number) ?? Infinity;
  }
  return Infinity;
};

/**
 * Given a list of files, sort them based on whether they are directories, and
 * then based on their nav_order or file name if nav_order is not present.
 *
 * @param files {fs.Dirent[]}
 * @returns {fs.Dirent[]}
 */
export const sortDirectoryListing = (files: fs.Dirent[]) =>
  files.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;

    // compare based on nav_order or file name if nav_order is not present
    const orderA = getOrder(a);
    const orderB = getOrder(b);

    return orderA - orderB || a.name.localeCompare(b.name);
  });
