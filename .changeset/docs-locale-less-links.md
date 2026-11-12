---
'@codaco/documentation': patch
---

A documentation link without a supported language now opens the page in the
reader's language instead of the Get Started page. The language is added in
front (`/design-protocols/x` opens `/en/design-protocols/x`) or, when only
that names a page, replaces the first part of the address (`/asd/design-protocols/x`
opens `/en/design-protocols/x`). An unknown address shows the "not found" page.
