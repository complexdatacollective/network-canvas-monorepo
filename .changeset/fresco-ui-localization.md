---
'@codaco/fresco-ui': minor
---

Every piece of copy the components supply themselves — icon labels, dialog
buttons, empty states, validation messages, pagination and sort announcements
— now renders through `@codaco/app-i18n` instead of being hardcoded English.

Existing hosts need no change: a component used without a locale provider
renders exactly the English it rendered before.

A host that wants the components in the reader's language mounts
`AppI18nProvider` and merges this package's catalogs into the messages it
passes it — `mergeCatalogs(commonCatalogs[locale], frescoUiCatalogs[locale],
appCatalog)`, taking `frescoUiCatalogs` from `@codaco/fresco-ui/locales`. The
provider formats only the `messages` it is handed, so mounting it without that
merge leaves every `frescoUi.*` id on its English default — including the
en-GB overrides, where the trash-bin icon stays a "Trash bin" rather than a
"Rubbish bin".

Also adds a `LocaleSelect` field for choosing a language, exports the
package's catalogs at `@codaco/fresco-ui/locales`, and converts the layout to
logical properties (`start`/`end` rather than `left`/`right`) so the
components lay out correctly in right-to-left languages.
