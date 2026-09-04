---
'@codaco/fresco-ui': minor
---

Every piece of copy the components supply themselves — icon labels, dialog
buttons, empty states, validation messages, pagination and sort announcements
— now renders through `@codaco/app-i18n` instead of being hardcoded English.
That includes the copy with no visible home: the accessible names a control
falls back to when the caller supplies none (progress bars, panel handles,
number steppers, the Likert and analog scales), the drag-and-drop live-region
announcements, and the two messages a person only sees once something has
already failed — a submit handler that threw, and a validation rule that did.

The numbers inside that copy now go through the same formatter, so a filter
endpoint, a saved filter condition and the analog scale's value bubble carry
the reader's digits and grouping rather than the source language's.

Existing hosts need no change: a component used without a locale provider
renders exactly the English it rendered before, with one exception — those
numbers now take English grouping, so a range ending at 2000 reads `2,000`.

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
