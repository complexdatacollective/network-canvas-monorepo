---
'@codaco/interview': minor
'@codaco/interviewer': patch
---

Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Waiting answers are now saved before the app locks, and the wait is capped at two seconds so a stalled save can never keep the app unlocked.

Hosts embedding the interview engine can take its autosave flush through the new optional `registerSyncFlush` prop. A host whose `onSync` depends on state that its own teardown destroys — an encrypted store clearing its key, say — can now write pending answers before destroying it, rather than after, which the Shell's teardown flush alone cannot do.

Flushing also now keeps writing while the session keeps changing under it, up to three passes. An answer given while a flush's own write was on the wire could not start a write of its own, so it was left for the trailing debounce — which a caller that is about to end the session never lets run. This affects the interview exit and finish paths as well as the lock.
