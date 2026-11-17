---
'@codaco/fresco-ui': minor
'@codaco/architect': minor
---

Rich text fields suggest emoji as you type. Typing a colon and the first two characters of an emoji's name (`:ro`) shows a short list beside the caret, each row the emoji and its `:shortcode:`. The keyboard stays in the text: what is typed next narrows the list, the arrow keys move through it, Enter or Tab inserts the one highlighted, and Escape puts the list away and keeps what was typed. A colon in a sentence ("Note: …", "10:30") suggests nothing. A new toolbar button, Insert emoji, opens the same emoji as a menu to search.

An emoji is inserted as the character itself, so stored text is unchanged and nothing new has to be read back. The list is the one GitHub's `:shortcodes:` name, which is also the one markdown text is already rendered with, and it is loaded the first time it is asked for. Its names and tags are in English.

In Architect this reaches every field that writes text a participant reads: prompts, form questions, option labels, node labels and the rest.

- `@codaco/fresco-ui`: `RichTextEditor` takes `emojiMenu` (on unless set to `false`). `gemoji` is now a direct dependency.
