---
'@codaco/fresco-ui': patch
'@codaco/tailwind-config': patch
'@codaco/interviewer': patch
---

A progress bar with no known amount of progress is now drawn. It showed only
its empty track, with nothing moving on it: in Interviewer, while a protocol
is being imported, while an export is being prepared, and while the app is
being downloaded for offline use. The moving segment starts from the edge the
bar fills from, which is the right in a right-to-left language and the top of
a vertical bar. With reduced motion the bar is drawn still and faded.
