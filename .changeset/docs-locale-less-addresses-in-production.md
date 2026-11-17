---
'@codaco/documentation': patch
---

Documentation addresses without a language, such as
`documentation.networkcanvas.com/design-protocols/piped-text`, now open the page
in the reader's language on the live site instead of showing "not found", and
the site root sends readers to their language too. Previews already did this;
the production deploy had been leaving out the code that does it.
