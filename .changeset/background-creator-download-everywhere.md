---
'@codaco/background-creator': patch
---

Downloading an SVG or exporting a script now saves the file in every desktop
browser.

In Safari on a Mac, "Download SVG" opened the share menu instead of saving
the file; it now downloads to your Downloads folder, as it does in Firefox. In
browsers that cannot show a Save dialog, such as the browser built into some
desktop apps, nothing happened at all; the file now downloads there too.
