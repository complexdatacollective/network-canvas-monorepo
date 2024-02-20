import fs from 'fs';
import { join } from 'path';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { env } from '../env.mjs';

const relativePathToDocs = join(process.cwd(), env.NEXT_PUBLIC_DOCS_PATH);

export function isFolderPageAvailableForLocale(path, locale) {
  if (!path) return false;
  const pathToFolderPage = join(relativePathToDocs, path, `index.${locale}`);

  let result =
    fs.existsSync(pathToFolderPage + '.md') ||
    fs.existsSync(pathToFolderPage + '.mdx');

  return result;
}

export async function markdownToText(markdown) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  const html = String(result);
  const text = html.replace(/<[^>]*>/g, ''); // remove HTML tags

  return text;
}
