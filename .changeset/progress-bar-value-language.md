---
'@codaco/fresco-ui': patch
---

The progress bar now reads its value out ("50%") in the language of the
interface. It used the language of the browser instead, and on a page rendered
by a server the two could differ, which React reported as a mismatch between
the server's page and the browser's.
