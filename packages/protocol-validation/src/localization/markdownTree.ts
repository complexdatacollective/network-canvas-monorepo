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

/**
 * The legacy editor stored what was typed as it was typed: a line opening
 * with `>` was a comparison ("> 5 years"), and `<...>` a placeholder ("<IRB
 * OR ETHICS BOARD HERE>"), never a quotation or HTML. Architect's editor
 * still reads them as those characters, so saving writes them escaped and
 * the participant is shown them as they were written.
 *
 * That is done by the parser, with the constructs that would read them
 * otherwise switched off, rather than by rewriting the text before it is
 * read: the parser alone knows where a `>` or `<` is markdown's own syntax
 * (an autolink, a bracketed address, a code span), and those are left to it.
 */
const TYPED_CHARACTERS = {
  disable: { null: ['blockQuote', 'htmlFlow', 'htmlText'] },
};

/**
 * Stored markdown as Architect's rich text editor reads it: CommonMark, with
 * `>` and `<` read as typed characters (see `TYPED_CHARACTERS`). The editor
 * reads every text through this, and the validator reads formatted text
 * through it as well as as written (see `dynamicValueMessages`), so the two
 * cannot disagree about where a link is.
 */
export const markdownAsEdited = (markdown: string): Root =>
  fromMarkdown(markdown, { extensions: [TYPED_CHARACTERS] });
