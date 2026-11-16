---
'@codaco/app-i18n': minor
'@codaco/architect': patch
---

Architect's screen-reader-only text is now English in every language, and is marked `lang="en"` wherever that does not also mark translated text, so a screen reader reads it in an English voice. This covers the names of icon-only buttons, drag and resize handles, lists, toolbars and regions, visually hidden status text, and announcements such as undo, redo and stage moves. Visible text, placeholders and tooltips stay translated.

`@codaco/app-i18n` adds `checkScreenReaderText` to its catalog guards. It reports an accessible name, description or value text that is given a translated message.
