import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

/**
 * Stored markdown as it is read everywhere: standard CommonMark, with none of
 * GitHub's additions (no strikethrough, tables, footnotes, task lists or
 * bare web addresses read as links) and no emoji shortcodes.
 *
 * A schema 9 text means what this parser says it means. Validation, the
 * migrations and Architect's editor all read text through it, so what is
 * checked, what is written and what the researcher edits cannot disagree.
 * Text from older protocols, which was read in other ways, is rewritten into
 * this form once, by the migration from schema 8 (see
 * `legacyMarkdownAsStandard`), and is never read the old way anywhere else.
 */
export const markdownTree = (markdown: string): Root => fromMarkdown(markdown);
