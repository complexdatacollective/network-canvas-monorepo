---
'@codaco/app-i18n': patch
---

Add a right-to-left development pseudo-locale, `ar-XB`
(`pseudoRtlAppLocale`), beside the accented `en-XA`. Under it the interface is
laid out right to left and each message's own text runs right to left, while
interpolated values keep their own direction. `pseudoAppLocales` lists both for
a development registry, and `isPseudoLocale` tests a tag for either.
