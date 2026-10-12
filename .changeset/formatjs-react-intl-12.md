---
'@codaco/app-i18n': minor
---

Upgrade the FormatJS toolchain to react-intl 12, `@formatjs/cli-lib` 10, `@formatjs/unplugin` 1.2.12 and `@formatjs/intl-localematcher` 0.9. `defineMessages` and `defineMessage` keep their untyped signatures, so placeholder values are still accepted at the type level.

Breaking: the descriptors they return are now `readonly`, following react-intl 12. Code that mutated a helper's result no longer compiles; build a new descriptor instead.
