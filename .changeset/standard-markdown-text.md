---
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': major
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/development-protocol': patch
---

Text in a schema 9 protocol is now read as standard Markdown everywhere. The
interview, Architect's editor and protocol validation all read it the same
way, so opening a text in Architect and saving it no longer changes what
participants see.

When you upgrade a schema 8 protocol, its text is rewritten so that
participants see what they saw before:

- A `<` or `>` you typed stays a character.
- `<br>` becomes a line break. In text of one line, such as a prompt, it
  becomes a space.
- A web address typed into longer text, such as an Information page, stays a
  link. A web address in text of one line is no longer a link.
- An emoji written as a code, such as `:smile:`, becomes the emoji itself.
  Emoji you added with the editor are already stored as emoji and do not
  change.

Two kinds of formatting are no longer drawn. Formatting that only GitHub's
version of Markdown offered (strikethrough, task lists, tables and footnotes)
is shown as typed. HTML tags are also shown as typed.

Text of one line, such as a prompt, a question or an option label, shows only
bold and italics, which are what the editor offers there. A link or a list in
such text is shown as its words.

A link is shown as a link only when its address is a whole web address
(starting `https://` or `http://`), an email address (`mailto:`) or a
telephone number (`tel:`). Any other link, such as one to a page address with
no `https://`, is shown as its words, in the interview and in the editor
alike, and the editor's link box asks you to correct any other address.
Telephone links are now kept when you save, and saving a text without a change
no longer changes where any of its links lead.

For developers:

- `@codaco/fresco-ui`: `RenderMarkdown` reads standard CommonMark only. It no
  longer draws GitHub's additions, emoji codes or HTML; HTML is shown as the
  characters typed. A caller can still pass `remark-gfm` in `remarkPlugins`.
  `RenderMarkdown`'s defaults are for protocol text.
  `ALLOWED_MARKDOWN_LABEL_TAGS`, its default, is now only `em` and `strong`,
  so `FieldLabel`, `OptionLabel` and `Hint` draw links and lists as their
  words; pass `ALLOWED_MARKDOWN_SECTION_TAGS` for text of several lines, or
  use `markdownElementsFor`, which gives either. A caller drawing text the
  application wrote itself states its elements and passes
  `applicationTextUrlTransform` as `urlTransform`, which keeps relative links.
  `getMarkdownAttributeValues` now returns every address, whether or not it
  would be drawn as a link. The new `@codaco/fresco-ui/linkAddress` subpath
  exports `linkAddress`, the rule for which addresses are links, which
  `RenderMarkdown`, `RichTextRenderer` and Architect's editor share, and
  `LINK_ADDRESS_PATTERN`, the same rule for an input's `pattern`;
  `RichTextRenderer` no longer links relative addresses. The new
  `@codaco/fresco-ui/markdownTypedHtml` subpath exports `showHtmlAsTyped`,
  which the renderer and Architect's editor both use.
- `@codaco/protocol-validation` exports `markdownTree`, the one parser for
  stored text; `linkDestinationMarkdown` and `linkTitleMarkdown`, which write
  a link's address and title so that they read back unchanged; and
  `CHARACTER_REFERENCE` and `ASCII_PUNCTUATION`. The
  `./testing/information-pages` subpath exports `schema8MarkdownAsStandard`,
  which rewrites a schema 8 text as the migration does.
