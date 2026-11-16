---
'@codaco/app-i18n': patch
---

Browser languages are now matched with the ICU defaults of CLDR best fit
(`@formatjs/intl-localematcher` 0.10). Before, a later exact match could beat
an earlier regional one: a browser set to Mexican Spanish with English as a
fallback (`es-MX, en`) got English even though Spanish is available. Now each
later preference counts for only slightly less than the one before, so that
browser gets Spanish, while a browser set to Afrikaans and English
(`af, en`) gets English rather than Dutch.
