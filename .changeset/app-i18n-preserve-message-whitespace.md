---
'@codaco/app-i18n': patch
---

Message extraction and the build transforms (`appI18n()` for Vite and the Next loader) now keep a message's whitespace as written, so a markdown message's blank lines still separate its paragraphs in a production build. The `formatjs/no-multiple-whitespaces` lint rule still keeps stray spacing out of every other message.
