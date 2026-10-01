---
'@codaco/app-i18n': patch
---

Upgrade the FormatJS toolchain to react-intl 12, `@formatjs/cli-lib` 10, `@formatjs/unplugin` 1.2.12 and `@formatjs/intl-localematcher` 0.9. `defineMessages` and `defineMessage` keep their untyped signatures — descriptors are readonly and accept any values at the type level — so code written against earlier versions continues to compile unchanged.
