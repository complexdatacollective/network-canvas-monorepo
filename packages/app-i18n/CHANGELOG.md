# @codaco/app-i18n

## 0.3.0

### Minor Changes

- 08fd0f7: Brazilian Portuguese (Português (Brasil), `pt-BR`) is now available as an
  interface language in Architect, Interviewer and Fresco, alongside English,
  Spanish and Simplified Chinese. Choose it from the language setting, or let it
  be selected automatically when your browser prefers Portuguese. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- ee4ad52: Dutch (Nederlands, `nl`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Dutch, whether from the
  Netherlands or Belgium. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- 489bf51: Upgrade the FormatJS toolchain to react-intl 12, `@formatjs/cli-lib` 10, `@formatjs/unplugin` 1.2.12 and `@formatjs/intl-localematcher` 0.9. `defineMessages` and `defineMessage` keep their untyped signatures, so placeholder values are still accepted at the type level.

  Breaking: the descriptors they return are now `readonly`, following react-intl 12. Code that mutated a helper's result no longer compiles; build a new descriptor instead.

- bff61d5: French (Français, `fr`) is now available as an interface language in
  Architect, Interviewer and Fresco, alongside English, Spanish and Simplified
  Chinese. Choose it from the language setting, or let it be selected
  automatically when your browser prefers French — including Canadian, Belgian
  and Swiss French. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- 62617a9: German (Deutsch, `de`) is now available as an interface language in Architect,
  Interviewer and Fresco, alongside English, Spanish and Simplified Chinese.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers German, including the Austrian and Swiss variants. The
  built-in interview controls participants see are translated too; protocol
  content keeps the language it was written in.
- 5b12f3b: Italian (Italiano, `it`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Italian. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- f32135f: Simplified Chinese (简体中文, `zh-Hans`) is now available as an interface
  language in Architect, Interviewer and Fresco, alongside English and Spanish.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers Chinese. The built-in interview controls participants see
  are translated too; protocol content keeps the language it was written in.
- e5f6a9a: Traditional Chinese (繁體中文, `zh-Hant`) is now available as an interface
  language in Architect, Interviewer and Fresco, written in Taiwan-standard
  vocabulary. Choose it from the language setting, or let it be selected
  automatically: browsers set to Chinese for Taiwan, Hong Kong or Macau now get
  Traditional Chinese instead of Simplified Chinese, while other Chinese browser
  languages still get Simplified Chinese. The built-in interview controls
  participants see are translated too; protocol content keeps the language it
  was written in.

  Chinese browser languages are now matched by script rather than by region.
  `resolveAppLocale` in `@codaco/app-i18n` maps each Chinese tag to its script
  first, so Hong Kong (`zh-HK`) and Macau (`zh-MO`) resolve to Traditional
  Chinese even when the browser also sends a generic `zh`, which previously won
  Simplified Chinese. `@codaco/shared-consts` exports the rule as
  `toScriptMatchingTag`, which the website uses too. A registry that declares a
  regional Chinese tag such as `zh-TW` exactly still receives that tag.

### Patch Changes

- Updated dependencies ([08fd0f7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08fd0f7dc2c1a7b757b2caf64ae68aacaaf31572), [ee4ad52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ee4ad52b14e081d25f883d9d170454932749d5ab), [bff61d5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bff61d58f17fbb7b021e6591da9575ed4c12cc16), [62617a9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/62617a9c21d7e6e200adc162417090a522fac1e6), [5b12f3b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5b12f3b977d4244c398301541d978d825f53ea13), [f32135f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f32135fd036f07157198728377dfdbeb30dff747), [e5f6a9a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e5f6a9ac0760f4a67ba353996b43327a5d1b0855))
  - @codaco/shared-consts@6.2.0

## 0.2.0

### Minor Changes

- 9d9f310: Changing an English sentence now invalidates its translations. Every locale
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

### Patch Changes

- 026b518: A form error whose message includes a number, date or time, such as "Starting
  zoom must be between 0 and 22.", now shows as that sentence in production
  builds instead of an encoded error string.
