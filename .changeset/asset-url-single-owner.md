---
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Images, videos and rosters no longer accumulate in memory while a protocol is previewed or interviewed.

Both apps hand each of a protocol's files to the interview as a temporary in-memory link, and the file stays loaded until that link is released. Four ways a file could end up held forever — or, in one case, released while still in use — have been fixed.

**A file shown in two places at once is now loaded once.** When a screen asked for the same image or roster from more than one component in the same moment — two panels drawing on one roster, an image reused across a screen — each request loaded its own copy and only the last was ever released. The earlier copies stayed for as long as the tab was open. Requests for the same file are now shared.

**Closing a preview releases everything it was loading.** In Architect, a file that finished loading after the preview had already closed was never released.

**Re-importing a protocol no longer breaks the file it just replaced.** In Interviewer, a file still loading when the protocol was re-imported could, on arrival, release the copy the new import had just published — leaving an image or roster that had displayed a moment earlier unable to load.

**Deleting a protocol now releases its files.** In Interviewer, everything loaded from a protocol stayed in memory until the tab was closed, even after the protocol and its interviews had been deleted. For a protocol whose files are encrypted at rest, that included their decrypted contents.
