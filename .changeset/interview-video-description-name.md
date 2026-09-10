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

A description a researcher left blank now counts as no description at all, for
pictures and audio as well as video. A protocol written by hand or brought in
from elsewhere can carry a description of nothing but spaces, and every medium
used to pass it straight through — so a participant using a screen reader was
told a run of whitespace instead of what the file was called.
