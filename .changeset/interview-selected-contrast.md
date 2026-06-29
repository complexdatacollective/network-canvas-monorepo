---
'@codaco/tailwind-config': patch
---

Interview theme: define `--selected-contrast` (the foreground colour for the white `--selected` fill). Previously it inherited the default theme's value (`--accent-contrast`, white in the interview palette), so selected text/icons rendered white-on-white and were invisible.
