# Architect-web multi-tab isolation — design

**Date:** 2026-07-04
**App:** `@codaco/architect-web`
**Status:** approved (autonomous agent task)

## Problem

A researcher can open two browser tabs of Architect and edit two protocols at
once, but today the two tabs clobber each other. The active-protocol session
state — _which_ protocol is open plus its undo timeline — is persisted with
`redux-remember` into `window.localStorage` under `@@remember-app` and
`@@remember-activeProtocol`. `localStorage` is shared across every tab of the
origin, so the last tab to write wins: tab B's edits, active-protocol id, and
undo history overwrite tab A's, and vice versa on the next keystroke.

The durable data layer (Dexie/IndexedDB `protocolLibrary` + `assetDB`) is keyed
per `protocolId`, so two _different_ protocols in two tabs don't collide there —
the collision is purely in the shared `localStorage` session state. The one
remaining durable-layer hazard is the _same_ protocol open in two tabs, where
both tabs debounce-autosave into the same library row (last-writer-wins).

## Goal

Each tab edits its own protocol independently: active protocol, edits, undo/redo
and autosave stay isolated; a reload keeps that tab's protocol; a brand-new tab
starts at the start screen; opening the same protocol twice is handled without
silent data corruption.

## Approach chosen

**Two independent mechanisms, each solving one half of the problem:**

### 1. Per-tab session state via a `sessionStorage` redux-remember driver

`sessionStorage` is per-tab by design: each tab (top-level browsing context) has
its own `sessionStorage`, it survives reload, and it is **not** shared across
tabs. A duplicated tab (Ctrl-drag / "Duplicate tab") copies it once at creation
but the two then diverge — which is exactly the semantics we want (the copy keeps
editing its own inherited protocol, further edits don't cross-wire).

`redux-remember@6`'s `rememberEnhancer(driver, keys, options)` takes any
`Driver` (`{ getItem, setItem }`). A small `createSessionStorageDriver()` wraps
`window.sessionStorage` in that shape (degrading to a per-instance in-memory map
if writes throw, e.g. Safari private browsing), replacing the origin-wide
`window.localStorage` driver for the two remembered keys (`app`,
`activeProtocol`).

**Only the timeline `present` is persisted, not the whole undo history.** The
live `activeProtocol` slice is a full timeline whose past/future can hold up to
1000 protocol clones (`timeline` middleware `limit: 1000`); persisting that into
sessionStorage would reintroduce exactly the storage bloat the pre-release audit
removed for localStorage. So the remembered `activeProtocol` value is serialised
to `{ present }` and rehydrated (via `unserialize`) into a fresh, empty-history
timeline. Consequently a **reload keeps the protocol you were editing but not its
undo history** — matching the behaviour the audit already shipped for
localStorage, now on a per-tab backing store.

**Trade-off (crash / browser-restart recovery):** `sessionStorage` is cleared
when the tab is closed or the browser fully quits. So after a full browser
close+reopen, a tab no longer auto-reopens the protocol it had open. This is an
acceptable and standard trade-off:

- The **protocol content itself is never lost** — it lives in the durable
  IndexedDB library row (written on open and by debounced autosave). After a
  restart the researcher re-opens it from the Home library in one click; they
  land at the protocol's last autosaved state.
- What is sacrificed is a convenience: "which protocol was open" is not restored
  on a full browser restart. The undo timeline is in-session only either way (it
  is never durable — not part of the library row), and is not restored across a
  reload, matching every other editor's expectation of undo history.
- A plain **reload** keeps the open protocol (that's what `sessionStorage`
  surviving reload buys us).

This trade-off is strictly better than the status quo, which "recovers" the last
tab's protocol on restart but at the cost of cross-tab corruption during normal
use. Correctness of concurrent editing outranks convenience recovery of _which_
protocol was open, especially when the content is safe either way.

**Why not the alternatives:**

- _tab-id-namespaced localStorage + BroadcastChannel/storage-event GC_: gives
  the same per-tab isolation but adds a whole lifecycle to get right — minting a
  tab id, namespacing every key, and garbage-collecting orphaned namespaces when
  a tab closes without a `beforeunload` (crash, mobile task-kill), or they leak
  forever and localStorage fills. `sessionStorage` gets the browser to do all of
  that for free and correctly. The only thing localStorage-namespacing would buy
  is restart recovery of the undo timeline — not worth the GC complexity and leak
  risk for a research tool, and the content is safe regardless.
- _per-tab async driver over IndexedDB keyed by tab id_: same GC problem, plus
  async rehydrate races with first render. No benefit here.

### 2. Same-protocol-in-two-tabs: a `BroadcastChannel` single-editor lock

`sessionStorage` isolation stops session state cross-wiring but does **not** stop
two tabs that happen to open the _same_ library protocol from both autosaving
into the one row (last-writer-wins → silent clobber of durable data). We detect
and prevent that with a lightweight coordination channel.

- A leaf module `protocolTabLock.ts` owns a single `BroadcastChannel`
  (`architect-protocol-lock`) and the tab's own random `tabId`.
- Whenever a tab makes a protocol active (`setActiveProtocolId(id)` with a
  non-null id), it **claims** that id: it broadcasts a `claim`, and any other tab
  currently holding the same id replies `held`. If a `held` reply arrives, the
  claiming tab knows the protocol is already open elsewhere.
- The **second** tab to open a given protocol is put into a **read-only "open
  elsewhere" state** (`app.protocolOpenElsewhere = true`): autosave is disabled
  for it and a non-blocking banner tells the researcher the protocol is already
  open in another tab and offers to close the duplicate view (return to Home).
  This guarantees only one editor writes the row — no corruption — while still
  letting them look at it.
- On `claim`, an already-holding tab also (best-effort) `postMessage`s a `focus`
  request is **not** attempted — cross-tab focus stealing is unreliable and
  browser-blocked; we surface the state in-tab instead, which is honest and
  keyboard-accessible.
- Releasing: when a tab clears its active protocol (returns Home, deletes it, or
  unloads via `pagehide`), it broadcasts `release`, so a waiting duplicate tab
  can be told the coast is clear and re-enable editing.
- Re-claiming after bfcache: `pagehide` also fires when a mobile tab is frozen
  into the back/forward cache, and a bfcache restore brings the page back
  _without_ remounting React (so the hook never re-runs). The lock remembers the
  protocol it intends to hold (`desiredId`, kept across `pagehide`) and re-claims
  it on `pageshow` when `event.persisted`. If a peer took over meanwhile, the
  re-claim earns a `held` reply and this tab is correctly demoted to read-only
  (autosave disabled); otherwise it regains exclusivity. Without this a restored
  tab would keep autosave on while no longer answering `held`, letting two tabs
  autosave one protocol.

Autosave already reads `getStorageUnavailable` to skip writes; we add a parallel
`getProtocolOpenElsewhere` guard in the same predicate, reusing the existing
disable path rather than inventing a new one.

**Data-safety guarantee:** at most one tab per `protocolId` ever has autosave
enabled, so the last-writer-wins hazard on the shared library row is eliminated
by construction, not merely narrowed.

## Components changed

| Unit                                               | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Depends on                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `ducks/store.ts`                                   | Swap the remember driver to a per-tab `sessionStorage` driver (with in-memory fallback); leave the scope subscription intact.                                                                                                                                                                                                                                                                                                                                                                                        | `sessionStorageDriver`           |
| `utils/sessionStorageDriver.ts` (new)              | A `redux-remember` `Driver` backed by `window.sessionStorage`, degrading to an in-memory `Map` when sessionStorage is unavailable (Safari private mode / disabled). Leaf module.                                                                                                                                                                                                                                                                                                                                     | none                             |
| `utils/protocolTabLock.ts` (new)                   | Owns the `BroadcastChannel` + this tab's id; `claimProtocol(id)`, `releaseProtocol()`, `subscribe(onLostExclusivity/onRegained)`. Leaf module, guarded for environments without `BroadcastChannel`.                                                                                                                                                                                                                                                                                                                  | none                             |
| `ducks/modules/app.ts`                             | Add `protocolOpenElsewhere` flag + `setProtocolOpenElsewhere` / `getProtocolOpenElsewhere`, mirroring the existing `storageUnavailable` pattern.                                                                                                                                                                                                                                                                                                                                                                     | —                                |
| `hooks/useProtocolTabLock.ts` (new)                | Bridges the non-redux lock to redux from the always-mounted app shell (`AppContents`). Holds the lock **iff `isProtocolPath(location) && activeProtocolId != null`** — so it claims on the `/protocol` editor route and releases on the start screen — and flips `protocolOpenElsewhere` on the lock's exclusivity callback. Route-coupled (not merely id-coupled) so a tab idle on Home doesn't hold the lock; reactive to `activeProtocolId` so a reload directly onto `/protocol` re-claims once rehydrate lands. | `protocolTabLock`, `app`, wouter |
| `ducks/middleware/protocolLibraryListener.ts`      | Add `getProtocolOpenElsewhere` to the autosave skip predicate.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `app`                            |
| `components/ProtocolOpenElsewhereBanner.tsx` (new) | Non-blocking `role="status"` banner mirroring `StorageUnavailableBanner`; offers "Return to start screen". Mounted next to it in `ProjectLayout`.                                                                                                                                                                                                                                                                                                                                                                    | `app`, fresco/legacy `Button`    |
| `components/ProjectNav/ProjectLayout.tsx`          | Mount the new banner beside `StorageUnavailableBanner`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                |

No change is needed to `fileLaunchQueue`/`main.tsx`: an OS `.netcanvas` launch
dispatches `openLocalNetcanvas` in the tab that received the launch event, which
mints a **new** library id (`instantiateProtocol` → `crypto.randomUUID()`) and
sets it active in _that_ tab's sessionStorage — so it opens into the launching
tab and can't be "already open elsewhere" (new id). Requirement 6 holds for free.

## Data flow

1. **Open (any path)** → navigates onto a `/protocol` route with
   `setActiveProtocolId(id)` (persisted to this tab's `sessionStorage`); the
   `useProtocolTabLock` hook claims `id` on the channel while on the editor
   route. If held elsewhere → `protocolOpenElsewhere = true` (autosave off,
   banner shown). Else this tab is the sole editor.
2. **Edit** → timeline `present` changes → autosave predicate fires only if the
   tab is the editor (not `storageUnavailable`, not `protocolOpenElsewhere`) →
   debounced write to the library row.
3. **Reload** → `sessionStorage` still holds `app` + the `activeProtocol`
   `present` → the tab rehydrates the same protocol into a fresh empty-history
   timeline (undo history is not restored — see "Approach chosen"). If the reload
   lands on a `/protocol` route, the hook re-claims once the id rehydrates (and
   optimistically clears any stale `protocolOpenElsewhere` before a `held` reply
   can re-set it); a reload landing on Home does not claim.
4. **New tab** → empty `sessionStorage` → `activeProtocol` is `null`,
   `activeProtocolId` is `null` → start screen (requirement 3).
5. **Return Home / close / delete** → the hook releases the claim when the route
   leaves `/protocol` (and the lock also releases on `pagehide` for tab close);
   the `release` on the channel lets a duplicate tab regain exclusivity (banner
   clears, autosave re-enabled). Note the active protocol id itself persists for
   reload-restore — it is the _route_, not the id, that gates the lock.

## Requirements coverage

1. Two different protocols, two tabs, independent — **sessionStorage isolation**.
2. Reload keeps the tab's protocol (not undo history) — **sessionStorage
   survives reload**; only `present` is persisted.
3. New tab → start screen — **empty sessionStorage**.
4. Same protocol in two tabs — **BroadcastChannel lock**: second tab is read-only
   ("open elsewhere"), autosave disabled → no row corruption.
5. Storage-unavailable fallback still per-tab — **in-memory Map is per JS
   context (per tab)**; the existing IndexedDB in-memory protocol path is
   unaffected.
6. OS file-handler launch opens in the launching tab — **new id, that tab's
   sessionStorage**; unchanged.

## Testing

- **Unit (`sessionStorageDriver`)**: round-trips through `sessionStorage`; falls
  back to the in-memory map when `sessionStorage.setItem` throws; two driver
  instances with independent maps don't share state (models two tabs).
- **Unit (`app` slice)**: `protocolOpenElsewhere` set/get default false / true.
- **Unit (`protocolTabLock`)**: with a mocked `BroadcastChannel`, a second
  `claimProtocol(sameId)` receives a `held` reply → reports not-exclusive; a
  `releaseProtocol` broadcasts `release`; absent `BroadcastChannel` it degrades
  to always-exclusive (no throw).
- **Unit (autosave predicate)**: with `protocolOpenElsewhere = true`, an edit
  does not schedule a write; with it false it does.
- **Unit (`activeProtocolPersistence`)**: `serializeActiveProtocol` persists only
  `present` (drops past/future); `deserializeActiveProtocol` rebuilds it into an
  empty-history timeline.
- **Live multi-tab** (browser tools): open protocol A in tab 1 and B in tab 2,
  edit both, confirm each shows/edits its own and neither clobbers the other;
  reload tab 1 → still A; open a fresh tab → start screen; open A
  again in a third tab → "open elsewhere" banner, autosave suppressed.

## Residual limitations

- **Full browser restart** does not auto-reopen the last active protocol
  (content is safe in the library; re-open in one click). Undo history is
  in-session only and is not restored across reload or restart. Documented
  trade-off, strictly better than today.
- The tab lock is **advisory and best-effort**: `BroadcastChannel` is same-origin
  and reliable in all target browsers. A frozen (bfcache) tab is handled — it
  releases on `pagehide` and re-claims on `pageshow` (see §2 Re-claiming) — but a
  tab killed without firing `pagehide` (hard crash) leaves a stale claim until
  that dead tab's channel is gone; worst case a duplicate stays read-only until
  reloaded. It never corrupts data. There is also a sub-round-trip optimistic
  window on every claim (this tab assumes exclusivity until a `held` reply lands)
  during which two tabs could both autosave — inherent to any async coordination
  and the same window the normal claim path already has.
- If `BroadcastChannel` is entirely unavailable (very old engines), we degrade to
  today's behaviour for the same-protocol case (both editable) but the
  sessionStorage isolation still prevents session cross-wiring. No regression.
- The read-only "open elsewhere" banner renders only inside `ProjectLayout`,
  which wraps `/protocol`, `/protocol/assets`, `/protocol/codebook` and
  `/protocol/summary` but **not** the stage editor (`/protocol/stage/:stageId`)
  or `/protocol/experiments`. On those two routes a duplicate tab still has
  autosave disabled (data stays safe) but shows no banner explaining why. Minor
  UX gap; mounting the banner in a shared editor shell would close it.
