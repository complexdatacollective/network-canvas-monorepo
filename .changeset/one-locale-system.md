---
'@codaco/shared-consts': minor
'@codaco/app-i18n': minor
'@codaco/protocol-validation': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Every app, website and interview now chooses its language the same way, from
one module in `@codaco/shared-consts`.

- `negotiateLocale(requested, available, fallback?)` is the one negotiation:
  CLDR best fit with ICU's defaults, with no rules of our own.
  `parseAcceptLanguage`, `canonicalizeLocaleTag` and
  `normalizeLocalePreferences` move here too.
- `resolveLocale({ chosen, requested, available, fallback })` puts the
  language a person chose first, then the best fit for their requested
  languages, then the fallback. Its `source` is `'chosen'`, `'negotiated'` or
  `'default'`.
- A choice is kept per scope and never read by another: a choice in an app's
  language switcher is not a choice for an interview, and a Language Chooser
  stage's choice belongs to that interview alone.
  `webStorageLocalePreference` keeps a choice in `localStorage` or
  `sessionStorage`; `readLocalePreferenceCookie` and
  `serializeLocalePreferenceCookies` keep one in a cookie, optionally shared
  by every site of a domain. `siteLocalePreferenceCookie` is the one choice
  every Network Canvas website shares.
- `resolveAppLocale` reports a kept choice as `source: 'chosen'` (was
  `'stored'`).
- `resolveProtocolLocale(chosen, requested, localization)` chooses an
  interview's language. A stated language the protocol does not offer now
  gives way to the browser's languages rather than the protocol's default.
