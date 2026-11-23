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

For developers:

- `@codaco/fresco-ui`: `RenderMarkdown` reads standard CommonMark only. It no
  longer draws GitHub's additions, emoji codes or HTML; HTML is shown as the
  characters typed. A caller can still pass `remark-gfm` in `remarkPlugins`.
  `FieldLabel` draws its label with `RenderMarkdown`. The new
  `@codaco/fresco-ui/markdownTypedHtml` subpath exports `showHtmlAsTyped`,
  which the renderer and Architect's editor both use.
- `@codaco/protocol-validation` exports `markdownTree`, the one parser for
  stored text, and the `./testing/information-pages` subpath adds
  `schema8MarkdownAsStandard`, which rewrites a schema 8 text as the
  migration does.
