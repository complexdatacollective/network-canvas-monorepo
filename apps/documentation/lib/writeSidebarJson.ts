import 'dotenv/config'; // This is essential here, because helper functions (below) use env variables, but they are not available in the Node.js environment without dotenv! This file is run directly in Node via tsc.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import matter from 'gray-matter';

import {
  locales,
  type SidebarLocaleDefinition,
  toLocale,
  type TSideBar,
} from '~/app/types';

import {
  createFolderEntry,
  createPageEntry,
  createSectionEntry,
  getMetaDataForDirectory,
  getNestedPath,
  relativePathToDocs,
  set,
  sortDirectoryListing,
} from './helper_functions';

// A locale starts with no sections; each is added as its directory is visited
// below, and the docs folder holds a directory for every section.
const emptyLocaleDefinition = (): SidebarLocaleDefinition =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- placeholder filled with every section by generateSidebarData before the file is written
  ({}) as SidebarLocaleDefinition;

/**
 * Generate sidebar data based on docs and locales.
 */
function generateSidebarData() {
  const files = readdirSync(relativePathToDocs, {
    withFileTypes: true, // returns fs.Dirent objects
    recursive: true, // recursively read all files in subdirectories
  }).filter(
    (file) =>
      file.isDirectory() ||
      file.name.endsWith('.mdx') ||
      file.name.endsWith('.md'),
  );

  // Set up initial structure for sidebar data.
  const sidebarData: TSideBar = { en: emptyLocaleDefinition() };

  const sortedFiles = sortDirectoryListing(files);

  for (const file of sortedFiles) {
    // Use parentPath (Node 20.1+) which is more reliable than path
    // In Node.js v24.11.1, the path property may be undefined when using recursive readdir,
    // but parentPath is correctly populated. Use fallback for safety.
    const parentPath = file.parentPath || relativePathToDocs;

    if (file.isDirectory()) {
      const metadata = getMetaDataForDirectory(join(parentPath, file.name));

      if (metadata.type === 'section') {
        for (const locale of locales) {
          sidebarData[locale] = {
            ...sidebarData[locale],
            [file.name]: createSectionEntry(file, locale, metadata, parentPath),
          };
        }

        continue;
      }

      // If this is a folder, create a folder entry
      if (metadata.type === 'folder') {
        const nestedPath = getNestedPath(parentPath);

        // Insert folder entry for each locale in the nested path
        for (const locale of locales) {
          set(
            sidebarData[locale],
            [...nestedPath, file.name],
            createFolderEntry(file, locale, metadata, parentPath),
          );
        }

        continue;
      }
    }

    // Only process files ending in .md or .mdx
    if (!(file.name.endsWith('.md') || file.name.endsWith('.mdx'))) {
      continue;
    }

    // Determine locale based on file name (format is `index.en.mdx` or `index.en.md`)
    const localeSegment = file.name.split('.')[1];
    const locale = toLocale(localeSegment);

    // If there's no locale, or the locale isn't included in the type, ignore it.
    if (!locale) {
      // oxlint-disable-next-line no-console -- Logging missing locale
      console.warn(
        `File ${file.name} is missing a locale or has a locale not defined in Locale. Locale is ${localeSegment}. Skipping.`,
      );
      continue;
    }

    // Create a key based on the filename without the locale or extension
    const key = file.name.split('.')[0]!;

    const nestedPath = getNestedPath(parentPath);

    const markdownFile = readFileSync(join(parentPath, file.name), 'utf-8');
    const matterResult = matter(markdownFile);

    set(
      sidebarData[locale],
      [...nestedPath, key],
      createPageEntry(file, matterResult, parentPath),
    );
  }

  return sidebarData;
}

const sidebarData = generateSidebarData();
writeFileSync(
  join(process.cwd(), 'public', 'sidebar.json'),
  JSON.stringify(sidebarData, null, '\t'),
  'utf-8',
);
