---
'@codaco/tailwind-config': patch
---

Two fixes for text in a right-to-left interface.

Code (`code`, `kbd`, `samp` and `pre`) is now always laid out left to right and
kept apart from the sentence around it. Before, a file extension inside an
Arabic sentence had its dot drawn on the wrong side: ".netcanvas" appeared as
"netcanvas.".

Text in a language written in the Arabic script is no longer slanted by the
browser when a style asks for italic. The script has no italic, and the faked
slant cut the top off the first letter of an italic placeholder in a text box.
A typeface that has a real italic, such as the Latin faces, still uses it.
