---
'@codaco/interview': major
'@codaco/interviewer': patch
'fresco': patch
---

Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Answers now reach storage within a fraction of a second of being given rather than waiting out a shared timer, and anything still outstanding is written the moment the app is put into the background — before the device can suspend it.

**Breaking for hosts of `@codaco/interview`.** The engine no longer batches writes on the host's behalf, and no longer holds a change back while an earlier write is unresolved. `onSync` is called for every change as it happens, because only the host knows what one write costs. Hosts wrap their handler in the new `createDebouncedSyncHandler`, which rate-limits ordinary changes to one write per interval carrying the newest state, and never runs two writes at once. A host writing its own handler must not run its writes concurrently: a slow earlier write landing after a newer one would persist stale answers.

`SyncHandler` gains a third argument. `immediate` marks the writes that must not be deferred — the participant exiting or finishing — and a batching host must stop batching when it sees it. `unloading` additionally marks the ones the document may not survive: it is being hidden or unloaded and may never run script again, so the host should use a transport that outlives it and must not queue the write behind a request that will die with it. Handlers that ignore the argument keep type-checking, so hosts that write eagerly need no change.

The Shell also now flushes on `visibilitychange` and `pagehide`. A hidden document is not promised any more script, so anything still outstanding goes out while there is still a page to write from — which is what makes an installed PWA safe to put to sleep seconds after an answer.
