import dotenv from 'dotenv';
import fs from 'fs';
import matter from 'gray-matter';
import { join, relative, sep } from 'path';
import { env } from '../env.mjs';
import { algolia_client } from './algolia-client.mjs';
import { markdownToText } from './universal_helper_functions.mjs';

dotenv.config();

const isDirectory = (source) => fs.lstatSync(source).isDirectory();

// Given a path, return an array of all filenames in that directory and all subdirectories.
export const getAllFilePaths = function (
  dirPath = env.NEXT_PUBLIC_DOCS_PATH,
  arrayOfFiles = [],
) {
  const relativePath = join(process.cwd(), dirPath);
  const files = fs.readdirSync(relativePath);

  files.forEach(function (file) {
    if (isDirectory(dirPath + '/' + file)) {
      arrayOfFiles = getAllFilePaths(dirPath + '/' + file, arrayOfFiles);
    } else {
      // excluding metadata.json file
      if (file !== 'metadata.json') {
        arrayOfFiles.push({
          docPath: dirPath + '/' + file,
        });
      }
    }
  });

  return arrayOfFiles;
};

// Get all documents and parse the content as text
export async function getAllDocFiles() {
  const allFilePaths = getAllFilePaths();

  const articles = allFilePaths.map(async (file) => {
    const source = fs.readFileSync(file.docPath, 'utf-8');
    const { content, data } = matter(source);
    const plainText = await markdownToText(content);
    const fileRelativePath = relative(env.NEXT_PUBLIC_DOCS_PATH, file.docPath);

    const formattedFilePath = fileRelativePath
      .replace(/\.(md|mdx)$/, '')
      .replace(sep + 'index', '') // Remove folder page path
      .replace(/\\/g, '/');

    const fileLink = formattedFilePath.split('.')[0];
    const fileLanguage = formattedFilePath.split('.')[1];

    return {
      content: plainText,
      data,
      filePath: `/${fileLanguage}/${fileLink}`,
      lang: fileLanguage,
    };
  });

  return Promise.all(articles);
}

// Transform documents to search objects to save them in the index
function transformDocsToSearchObjects(articles) {
  const titleSet = new Set(); // Set to keep track of unique titles

  const transFormed = articles.map((article) => {
    const title = article.data.title;
    const source = article.filePath;

    // Check if title is already in the set
    if (titleSet.has(title)) {
      throw new Error(`Duplicate title found: ${title} in ${source}`);
    }

    // If not, add it to the set
    titleSet.add(title);

    return {
      objectID: title,
      title: title,
      filePath: article.filePath,
      content: article.content,
      data: article.data,
      lang: article.lang,
    };
  });

  return transFormed;
}

// Index the files after build
(async function indexAllFiles() {
  console.log('STARTED INDEXING');

  try {
    const articles = await getAllDocFiles();
    const transformed = transformDocsToSearchObjects(articles);

    const index = algolia_client.initIndex(env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME);

    const algoliaResponse = await index.saveObjects(transformed);

    console.log(
      `SUCCESSFULLY ADDED ${algoliaResponse.objectIDs.length} RECORDS TO Algolia SEARCH.`,
    );
  } catch (error) {
    console.error(error);
  }
})();
