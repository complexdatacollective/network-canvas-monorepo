---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A video on an interview screen now announces itself with the description the
researcher wrote for it, and falls back to the asset's file name only when
nobody has written one. An image has always read that description as its alt
text and an audio player as its own name; the video player was the one place
that ignored it, so a participant listening to the screen heard a filename
where every other medium said what the thing was.
