---
'@codaco/app-i18n': minor
---

Changing an English sentence now invalidates its translations. Every locale
catalog carries a committed record of the English each of its entries was made
from, in a sibling `src/locales/<tag>.source.json`, and the catalog guards fail
when a recorded sentence no longer matches the current `en.json`.

Until now a reworded English string left every translation saying the old thing
with every check still green — the catalog was complete, the ICU arguments
matched, nothing was blank, and the wrong copy was on screen. The failure names
the message, the English it was translated from, the English it says now, and
the translation itself, because most English edits are editorial and need a
re-stamp rather than a retranslation, and only those three sentences together
tell you which case you are in. Each catalog-owning package gained an
`i18n:stamp` script that rewrites the records and prints every pair it accepted.

Breaking: `checkFullLocale` and `checkOverrideLocale` take the locale's
recorded sources as a required third argument. Read them with the new
`readTranslationSources(localesDir, locale)`, and generate them with
`stampTranslationSources`. The argument is required rather than optional
because provenance a caller can forget to pass is provenance that silently
stops being checked.
