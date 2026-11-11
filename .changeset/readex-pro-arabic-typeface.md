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
has installed. Text in other scripts is unchanged.

`@codaco/tailwind-config` adds `fonts/readex-pro.css` and names Readex Pro
after the Latin face in the heading and body stacks of every theme. A host
that imports `fonts/nunito.css` and `fonts/inclusive-sans.css` should import
the new file beside them; without it Arabic falls back to a system font as
before. Only the Arabic subset is declared (23 KB), and a browser fetches it
only for a page that shows Arabic. The site navigation bundle ships the file
in `dist/fonts/`.
