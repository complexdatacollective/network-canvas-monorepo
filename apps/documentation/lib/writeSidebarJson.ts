import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type fs from 'node:fs';
import dotenv from 'dotenv';
import matter from 'gray-matter';
import type { LocalesEnum, TSideBar } from '~/app/types';
import { locales } from '~/app/types';
import {
  createFolderEntry,
  createPageEntry,
  createProjectEntry,
  getMetaDataForDirectory,
  getNestedPath,
  relativePathToDocs,
  set,
  sortDirectoryListing,
} from './helper_functions';

dotenv.config();

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
  const sidebarData: TSideBar = locales.reduce((acc, locale) => {
    acc[locale] = {};
    return acc;
  }, {} as TSideBar);

  const sortedFiles = sortDirectoryListing(files);

  sortedFiles.forEach((file: fs.Dirent) => {
    if (file.isDirectory()) {
      const metadata = getMetaDataForDirectory(join(file.path, file.name));

      if (metadata.type === 'project') {
        Object.keys(sidebarData).forEach((l) => {
          const locale = l as LocalesEnum;

          sidebarData[locale] = {
            ...sidebarData[locale],
            [file.name]: createProjectEntry(file, locale, metadata),
          };
        });

        return;
      }

      // If this is a folder, create a folder entry
      if (metadata.type === 'folder') {
        const nestedPath = getNestedPath(file.path);

        // Insert folder entry for each locale in the nested path
        Object.keys(sidebarData).forEach((l) => {
          const locale = l as LocalesEnum;
          set(
            sidebarData[locale]!,
            [...nestedPath, file.name],
            createFolderEntry(file, locale, metadata),
          );
        });

        return;
      }
    }

    // Only process files ending in .md or .mdx
    if (!file.name.endsWith('.md') && !file.name.endsWith('.mdx')) return;

    // Determine locale based on file name (format is `index.en.mdx` or `index.en.md`)
    const locale = file.name.split('.')[1] as LocalesEnum | undefined;

    // If there's no locale, or the locale isn't included in the type, ignore it.
    if (!locale || !locales.includes(locale as LocalesEnum)) {
      // eslint-disable-next-line no-console
      console.warn(
        `File ${file.name} is missing a locale or has a locale not defined in LocalesEnum. Locale is ${locale}. Skipping.`,
      );
      return;
    }

    // create a key based on the filename without the locale or extension
    const key = file.name.split('.')[0];

    const nestedPath = getNestedPath(file.path);

    const markdownFile = readFileSync(join(file.path, file.name), 'utf-8');
    const matterResult = matter(markdownFile);

    // If file has "hidden: true" in frontmatter, skip it
    if (matterResult.data.hidden) return;

    set(
      sidebarData[locale]!,
      [...nestedPath, key!],
      createPageEntry(file, matterResult),
    );
  });

  return sidebarData;
}

try {
  const sidebarData = generateSidebarData();

  writeFileSync(
    join(process.cwd(), 'public', 'sidebar.json'),
    JSON.stringify(sidebarData, null, 2),
    'utf-8',
  );
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('Error writing sidebar data!', e);
}
