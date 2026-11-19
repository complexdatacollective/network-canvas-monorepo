import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

/**
 * Markdown read as the interview reads it: CommonMark with GitHub's
 * additions (strikethrough, tables, footnotes, task lists, bare web
 * addresses), which is what `RenderMarkdown` in `@codaco/fresco-ui` parses
 * with (`remark-gfm`, with the same defaults as here).
 *
 * Everything here that asks what a text is made of asks this parser, so that
 * what validation accepts and what a migration writes are judged as the
 * participant will see them. Plain CommonMark reads `~~![Map](asset:a1)~~`
 * as an image between tildes in a paragraph; the interview reads it as an
 * image struck through, and draws nothing for it.
 */
export const markdownTree = (markdown: string): Root =>
  fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
