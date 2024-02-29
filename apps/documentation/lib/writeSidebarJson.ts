import fs from 'node:fs';
import { basename, join, relative } from 'node:path';
import dotenv from 'dotenv';
import matter from 'gray-matter';

import {
  locales,
  LocalesEnum,
  MetadataFile,
  SidebarFolder,
  SidebarLocaleDefinition,
  SidebarPage,
  SidebarProject,
  TSideBar,
} from '~/app/types';
import { env } from '../env.mjs';
import { isFolderPageAvailableForLocale } from './universal_helper_functions.mjs';

const getNestedPath = (path: string) => {
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
const set = (
  obj: Record<string | number, unknown>,
  pathArray: (string | number)[],
  value: unknown,
): void => {
  pathArray.reduce((acc, key, i) => {
    if (acc[key] === undefined) {
      acc[key] = {};
    }
    if (i === pathArray.length - 1) {
      acc[key] = value;
    }
    return acc[key];
  }, obj);
};

dotenv.config();

const getMetaDataForDirectory = (directoryPath: string) => {
  const metadataPath = join(directoryPath, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`No metadata.json found at ${directoryPath}`);
  }

  const metadataString = fs.readFileSync(metadataPath, 'utf-8');
  const metadataRaw = JSON.parse(metadataString) as unknown;

  const parsed = MetadataFile.parse(metadataRaw);

  return parsed;
};

const createProjectEntry = (
  file: fs.Dirent,
  locale: LocalesEnum,
  metadata: MetadataFile,
): SidebarProject => {
  const localeIndexFile = metadata.localeIndexFiles?.[locale];
  const sourceFile = localeIndexFile
    ? join(file.path, localeIndexFile).replace(process.cwd(), '')
    : undefined;

  return {
    type: 'project',
    sourceFile,
    label: metadata.localeLabels?.[locale] ?? file.name,
    children: {},
  };
};

const createFolderEntry = (
  file: fs.Dirent,
  locale: LocalesEnum,
  metadata: MetadataFile,
): SidebarFolder => {
  const localeIndexFile = metadata.localeIndexFiles?.[locale];
  const sourceFile = localeIndexFile
    ? join(file.path, localeIndexFile).replace(process.cwd(), '')
    : undefined;

  return {
    type: 'folder',
    expanded: metadata.isExpanded ?? false,
    sourceFile,
    label: metadata.localeLabels?.[locale] ?? file.name,
    children: {},
  };
};

const createPageEntry = (
  file: fs.Dirent,
  matterResult: matter.GrayMatterFile<string>,
): SidebarPage => {
  return {
    type: 'page',
    sourceFile: join(file.path, file.name).replace(process.cwd(), ''),
    label: matterResult.data.title,
  };
};

// get the nav_order from frontmatter or default to Infinity
const getOrder = (file: fs.Dirent): number => {
  if (!file.isDirectory()) {
    const path = join(file.path, file.name);
    const markdownFile = fs.readFileSync(path, 'utf-8');
    const { data } = matter(markdownFile);
    return (data.nav_order as number) ?? Infinity;
  }
  return Infinity;
};

// Sort files so that directories come first, then sort by nav_order or file name
const sortDirectoryListing = (files: fs.Dirent[]) =>
  files.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;

    // compare based on nav_order or file name if nav_order is not present
    const orderA = getOrder(a);
    const orderB = getOrder(b);

    return orderA - orderB || a.name.localeCompare(b.name);
  });

const relativePathToDocs = join(process.cwd(), env.NEXT_PUBLIC_DOCS_PATH);

// Get file-system data to generate dynamic navigation menus
function generateSidebarData() {
  const files = fs.readdirSync(relativePathToDocs, {
    withFileTypes: true, // returns fs.Dirent objects
    recursive: true, // recursively read all files in subdirectories
  });

  // Create an object with a key for each locale that has a value of an empty object
  const sidebarData: TSideBar = locales.reduce((acc, locale) => {
    acc[locale] = {};
    return acc;
  }, {} as TSideBar);

  // sort directory listing so that folders come first
  const sortedFiles = sortDirectoryListing(files);

  sortedFiles.forEach((file) => {
    if (file.isDirectory()) {
      // For every directory, we look for a metadata.json to tell us what kind
      // of entity it is, and how to generate it.
      const metadata = getMetaDataForDirectory(join(file.path, file.name));

      // If this is a project, create a project entry
      if (metadata.type === 'project') {
        // Insert a project entry for each locale
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
            sidebarData[locale],
            [...nestedPath, file.name],
            createFolderEntry(file, locale, metadata),
          );
        });

        return;
      }
    }

    // Insert pages
    // Only process files ending in .md or .mdx
    if (!file.name.endsWith('.md') && !file.name.endsWith('.mdx')) return;

    // Determine locale based on file name (format is `index.en.mdx` or `index.en.md`)
    const locale = file.name.split('.')[1];

    // create a key based on the filename without the locale or extension
    const key = file.name.split('.')[0];

    const nestedPath = getNestedPath(file.path);

    const markdownFile = fs.readFileSync(join(file.path, file.name), 'utf-8');
    const matterResult = matter(markdownFile);

    // If file has "hidden: true" in frontmatter, skip it
    if (matterResult.data.hidden) return;

    // Insert page entry for each locale in the nested path
    set(
      sidebarData[locale],
      [...nestedPath, key],
      createPageEntry(file, matterResult),
    );
  });

  // console.log(JSON.stringify(sidebarData, null, 2));
  return sidebarData;
}

try {
  const sidebarData = generateSidebarData();

  fs.writeFileSync(
    './public/sidebar.json',
    JSON.stringify(sidebarData, null, 2),
    'utf-8',
  );
} catch (e) {
  console.log('Error writing sidebar data!', e);
}
