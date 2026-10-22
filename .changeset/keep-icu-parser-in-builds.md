---
'@codaco/app-i18n': minor
---

`appI18n()` no longer removes the ICU parser from production builds. Protocol strings are ICU messages that `@codaco/protocol-validation` and the interview runtime parse while the app runs, so a bundle without the parser could not validate or render a protocol. The plugin still compiles `defineMessages` defaults and imported locale catalogs to AST at build time.

Breaking: `appI18n` takes no options, and the `build: 'library'` option and the `AppI18nBuildKind` and `AppI18nOptions` types are gone, because there is no longer an application-only alias for a library build to opt out of. Call `appI18n()` in application and library builds alike. Next.js hosts should also delete the `@formatjs/icu-messageformat-parser` `resolveAlias` entry the README used to recommend.
