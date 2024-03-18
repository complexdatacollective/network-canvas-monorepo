import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import type fs from 'node:fs';
import type matter from 'gray-matter';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import type {
  LocalesEnum,
  MetadataFile,
  SidebarFolder,
  SidebarPage,
  SidebarProject,
} from '~/app/types';
import { MetadataFileSchema } from '~/app/types';
import { env } from '~/env.mjs';

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
  const asArray = withoutRelativePath.split(sep).filter(Boolean);

  // insert 'children', between each value
  return asArray
    .map((value) => {
      return [value, 'children'];
    })
    .flat();
};

// WARNING: This is not a drop in replacement solution and
// it might not work for some edge cases. Test your code!
export const get = (
  obj: Record<string | number, unknown>,
  path: string | string[],
  defValue: unknown = undefined,
) => {
  // If path is not defined or it has false value
  if (!path) return undefined;
  // Check if path is string or array. Regex : ensure that we do not have '.' and brackets.
  // Regex explained: https://regexr.com/58j0k
  const pathArray = Array.isArray(path) ? path : path.match(/([^[.\]])+/g);
  // Find value
  const result = pathArray?.reduce(
    // @ts-expect-error: No way to type this that I can think of...
    (prevObj, key) => prevObj?.[key],
    obj,
  );
  // If found value is undefined return default value; otherwise return the value
  return result ?? defValue;
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

  const parsed = MetadataFileSchema.parse(metadataRaw);

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
    navOrder: metadata.navOrder ?? null,
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
  const navOrder = matterResult.data?.navOrder as number | undefined;
  const sourceFile = join(file.path, file.name).replace(process.cwd(), '');

  return {
    type: 'page',
    sourceFile,
    label: title ?? file.name,
    navOrder: navOrder ?? null,
  };
};

/**
 * Given a list of files, sort them based on whether they are directories,
 * and by ascending depth.
 *
 * @param files {fs.Dirent[]}
 * @returns {fs.Dirent[]}
 */
export const sortDirectoryListing = (files: fs.Dirent[]) =>
  files.sort((a, b) => {
    const depthA = a.name.split('/').length; // Get depth of directory/file A
    const depthB = b.name.split('/').length; // Get depth of directory/file B

    return depthA - depthB; // Sort by ascending depth (shallowest to deepest)
  });
