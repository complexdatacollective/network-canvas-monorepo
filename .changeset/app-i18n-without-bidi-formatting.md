---
'@codaco/app-i18n': minor
---

`withoutBidiFormatting` (from `@codaco/app-i18n/messages`) removes every bidi formatting character from a string: the Arabic letter mark, the left-to-right and right-to-left marks, embeddings, overrides and isolates. Use it to compare what two renders say when one carries the isolates a right-to-left message puts around its values.
