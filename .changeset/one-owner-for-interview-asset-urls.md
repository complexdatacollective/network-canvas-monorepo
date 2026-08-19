---
'@codaco/interview': minor
'@codaco/interviewer': patch
'@codaco/architect': patch
---

Interview images, videos and rosters are handed out by one owner.

Every app that runs an interview has to turn a stored image, video, audio clip
or roster file into something the interview can display, and then take it back
again when it is finished with. Interviewer and Architect's protocol preview
had each written that bookkeeping separately, and each had got a different part
of it right. Interviewer knew how to hand back a file when a protocol was
deleted, and how to replace one when the same protocol was imported again with
updated files. The preview knew how to refuse a file that arrived after the
preview window had closed, and how to hand every file back on the way out.
Neither knew what the other knew, so a fix to one was a fix to one.

There is now a single owner in `@codaco/interview`, and both apps use it. It
keeps all of those protections together: one file per asset however many parts
of a screen ask for it at once, a replaced file handed back the moment its
replacement is ready, a whole protocol's files handed back when it is deleted,
and nothing produced at all for a read that finishes after the thing that asked
for it has gone. Interview data stays decrypted in memory for no longer than it
is on screen.

For anyone embedding the interview engine, `createAssetUrlOwner` is available
from `@codaco/interview/contract`.
