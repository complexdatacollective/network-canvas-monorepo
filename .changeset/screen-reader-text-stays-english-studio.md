---
'@codaco/studio-web': patch
'@codaco/studio-api': patch
---

Text that only a screen reader reads, such as the language menu's name and the names of icon-only buttons, is now English in every language, and is marked `lang="en"` where that does not also mark translated text, so a screen reader reads it in an English voice. Visible text, placeholders and tooltips stay translated.
