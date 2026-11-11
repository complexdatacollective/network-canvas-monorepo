---
'@codaco/tailwind-config': minor
'@codaco/site-navigation-element': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'@codaco/background-creator': patch
'fresco': patch
---

Arabic text is now set in Readex Pro, a typeface that ships with the apps, so
it looks the same on every device instead of depending on the fonts each one
has installed. This applies to text marked as Arabic: an interface or
interview shown in Arabic, and Arabic wording inside another language where
the app knows its language. Text in every other language is unchanged,
including languages such as Persian and Urdu that share the script.

`@codaco/tailwind-config` adds `fonts/readex-pro.css`, and its themes add
Readex Pro to the heading and body stacks for `lang="ar"` only. A host that
imports `fonts/nunito.css` and `fonts/inclusive-sans.css` should import the
new file beside them; without it Arabic falls back to a system font as
before. Only the Arabic subset is declared (23 KB), and a browser fetches it
only for a page that shows Arabic. Each theme now names the Latin face of its
stacks as `--heading-face` and `--body-face`; a theme of your own that sets
`--heading-font` or `--body-font` should set those too. The site navigation
bundle ships the file in `dist/fonts/`.
