---
'@codaco/fresco-ui': minor
'@codaco/architect': minor
---

Rich text fields have an emoji menu. A new toolbar button, Insert emoji, opens a searchable list of emoji, grouped by category and searched by name and tag. Typing a colon and the first two letters of an emoji's name (`:ro`) opens the same list already searching for them, and choosing an emoji replaces what was typed; Escape keeps it as text. A colon in a sentence ("Note: …", "10:30") does not open it.

An emoji is inserted as the character itself, so stored text is unchanged and nothing new has to be read back. The list is the one GitHub's `:shortcodes:` name, which is also the one markdown text is already rendered with, and it is loaded the first time the menu is asked for. Its names and tags are in English.

In Architect this reaches every field that writes text a participant reads: prompts, form questions, option labels, node labels and the rest.

- `@codaco/fresco-ui`: `RichTextEditor` takes `emojiMenu` (on unless set to `false`). `gemoji` is now a direct dependency.
