---
'@codaco/interviewer': patch
'@codaco/fresco-ui': minor
---

Interviewer's first-run setup asks for the app language once, on the welcome screen, before you select "Get started". The setup steps no longer repeat the language picker, which you can still find in Settings. The picker's automatic option now names the language it uses, for example "Automatic (English)", instead of "Automatic (browser)", which was confusing for an installed app.

`LocaleSelect` accepts an `automaticLocale` prop: the locale the automatic entry resolves to. The entry then reads "Automatic (Français)", in the same words as `LocaleSwitcher`.
