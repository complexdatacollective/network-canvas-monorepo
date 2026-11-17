import type { Element, Root } from 'hast';
import { headingRank } from 'hast-util-heading-rank';
import rehypeRaw from 'rehype-raw';
import slug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const EXPLICIT_ID = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

/**
 * Gives a heading the id written after it, as in
 * `## Generador de nombres {#name-generator}`, and removes the marker from its
 * text. Translated pages use it to keep the English page's heading ids, so
 * links into a page, and a reader switching language, land on the same
 * section. Run it before rehype-slug, which keeps an id that is already set.
 */
export function explicitHeadingIds() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (!headingRank(node)) return;
      const last = node.children.at(-1);
      if (last?.type !== 'text') return;
      const match = EXPLICIT_ID.exec(last.value);
      if (!match?.[1]) return;
      node.properties.id = match[1];
      last.value = last.value.slice(0, match.index);
    });
  };
}

const headingProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(explicitHeadingIds)
  .use(slug);

/** The id of every heading on a page, in order, as the site renders them. */
export function headingIds(markdown: string): string[] {
  const tree = headingProcessor.runSync(headingProcessor.parse(markdown));
  const ids: string[] = [];
  visit(tree, 'element', (node: Element) => {
    const id = node.properties.id;
    if (headingRank(node) && typeof id === 'string') ids.push(id);
  });
  return ids;
}
