---
'@codaco/app-i18n': patch
---

Browser languages are now matched in the order the browser lists them. Before,
a later exact match could beat an earlier regional one: a browser set to
Mexican Spanish with English as a fallback (`es-MX, en`) got English even
though Spanish is available. `resolveAppLocale` now tries each preference on
its own and picks the first one that fits, so that browser gets Spanish.
