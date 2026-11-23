---
'@codaco/fresco-ui': minor
'@codaco/architect': minor
---

Rich text fields suggest emoji as you type. Typing a colon and the first two characters of an emoji's name (`:ro`) shows a short list beside the caret, each row showing the emoji and its `:shortcode:`. The keyboard stays in the text: what is typed next narrows the list, the arrow keys move through it, Enter or Tab inserts the highlighted emoji, and Escape closes the list and keeps what was typed. A colon in a sentence ("Note: …", "10:30") suggests nothing. A new toolbar button, Insert emoji, opens the same emoji as a menu to search.

An emoji is inserted as the character itself, so it is stored as the emoji and every interview shows it. The list contains the emoji named by GitHub's `:shortcodes:`, and it is loaded the first time it is asked for. Its names and tags are in English.

In Architect this reaches every field that contains text that a participant reads: prompts, form questions, option labels, node labels and the rest.

- `@codaco/fresco-ui`: `RichTextEditor` takes `emojiMenu` (on unless set to `false`). `gemoji` is now a direct dependency.
