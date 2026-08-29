---
'@codaco/interview': major
'@codaco/interviewer': patch
'fresco': patch
---

Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Answers are now written as they are given rather than held back, and whatever is still outstanding is written the moment the app is put into the background — before the device can suspend it.

**Breaking for hosts of `@codaco/interview`.** The engine no longer batches writes on the host's behalf. `onSync` is now called for every change as it happens, because only the host knows what one write costs: a local database write can take them all, while a network request usually should not. Hosts that need batching wrap their handler in the new `createDebouncedSyncHandler`, which rate-limits ordinary changes to one write per interval carrying the newest state.

`SyncHandler` gains a third argument, `{ immediate }`. It marks the writes that must not be deferred — the participant exiting or finishing, and the document being hidden. A batching host must stop batching when it sees it. Handlers that ignore the argument keep type-checking, so hosts that write eagerly need no change.

The Shell also now flushes on `visibilitychange` and `pagehide`. A hidden document is not promised any more script, so anything still outstanding goes out while there is still a page to write from — which is what makes an installed PWA safe to put to sleep seconds after an answer.
