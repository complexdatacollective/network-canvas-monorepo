---
'@codaco/fresco-ui': major
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/background-creator': patch
---

Text that only a screen reader reads is now English in every language, and is marked `lang="en"` wherever that does not also mark translated text, so a screen reader reads it in an English voice. This covers drag-and-drop and list announcements, the names of icon-only buttons, sliders and toolbars, and visually hidden status text. Visible text, placeholders and tooltips stay translated.

`@codaco/fresco-ui` breaking changes: its 90 messages for screen-reader text are removed from its catalogs and written in the components as English. `getKeyboardDragAnnouncement`, `getDropTargetDescription` and `colorSequenceHueName` no longer take an `intl` argument.
