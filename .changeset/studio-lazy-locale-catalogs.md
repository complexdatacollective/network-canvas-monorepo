---
'@codaco/studio-web': patch
---

Studio's client no longer carries the shared packages' translations for
languages it does not offer. Their catalogs now load on demand, so only British
English is ever fetched, and only when it is the language in use.
