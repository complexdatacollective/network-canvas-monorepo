---
'@codaco/tailwind-config': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'@codaco/background-creator': patch
'fresco': patch
---

Text in Arabic, Persian, Urdu and other languages written in the Arabic script
no longer has its letters pulled apart in Safari. Small labels and buttons use
a little extra space between letters, and Safari put that space inside words,
where the letters of this script must join. It showed wherever a protocol's
text or the interface was in one of those languages, on an iPad in particular.
Text in these languages now takes no letter-spacing.

Arabic set in the monospace style, such as Interviewer's status line, is now
drawn in Readex Pro like the rest of the page, in place of a wider system
font.

`@codaco/tailwind-config`: `--font-monospace` now reads `--monospace-font`,
which the theme sets for `lang="ar"`; a theme of your own may set it too.
