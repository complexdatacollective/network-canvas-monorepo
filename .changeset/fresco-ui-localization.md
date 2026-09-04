---
'@codaco/fresco-ui': minor
---

Every piece of copy the components supply themselves — icon labels, dialog
buttons, empty states, validation messages, pagination and sort announcements
— now renders through `@codaco/app-i18n` instead of being hardcoded English.

Nothing is required of a host application. A component used without a locale
provider renders exactly the English it rendered before, so existing hosts
need no change; a host that mounts `AppI18nProvider` gets the same components
in the reader's language, with the package's own translations merged in
automatically.

Also adds a `LocaleSelect` field for choosing a language, exports the
package's catalogs at `@codaco/fresco-ui/locales`, and converts the layout to
logical properties (`start`/`end` rather than `left`/`right`) so the
components lay out correctly in right-to-left languages.
