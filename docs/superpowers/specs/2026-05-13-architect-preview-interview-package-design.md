# Architect preview: replace remote Fresco with direct `@codaco/interview` use

**Date:** 2026-05-13
**Status:** Design
**Owner:** architect-vite
**Affects:** `architect-vite`

## 1. Problem

Architect's "Preview" button currently uploads the in-progress protocol and its asset blobs to a remote Fresco instance and opens the returned URL in a new tab. The implementation lives in `apps/architect-vite/src/utils/preview/uploadPreview.ts` and depends on two environment variables (`VITE_FRESCO_PREVIEW_URL`, `VITE_FRESCO_PREVIEW_API_TOKEN`).

Three problems with this:

- **Slow.** Every preview re-uploads every asset over the network — image, video, audio. On larger protocols this is the dominant cost, well into the tens of seconds.
- **External dependency.** Preview requires a reachable Fresco preview service. Offline previewing is impossible. CI and local dev need credentials.
- **Duplicated rendering pipeline.** Fresco renders the same `@codaco/interview` Shell that architect could mount directly. The remote round-trip exists only because architect has no in-app interview runtime — that is no longer true now that `@codaco/interview` is a workspace package.

## 2. Goals

- Replace the remote Fresco preview path entirely with in-browser rendering of `<Shell>` from `@codaco/interview`.
- Open the preview in a new browser tab so the designer can keep the editor open alongside.
- Resolve protocol assets directly from architect's existing IndexedDB (`assetDb`) — no network upload.
- Make the initial network optionally seeded with synthetic data (default on), via an app-level persisted preference.
- Preserve the `protocol_previewed` PostHog event already captured today.
- Delete the remote Fresco preview code and related environment variables.

## 3. Non-goals

- Sharing preview URLs with collaborators. Today's Fresco preview produces a shareable URL; this design produces an ephemeral, in-tab preview only. Sharing would require persistence we are not adding.
- A general-purpose architect → interview-package adapter for other consumers. The conversion helper and host live in architect-vite and are not exported.
- Replacing the editor's own Redux store with the interview Shell's store; they coexist by virtue of the preview running on a different route in a different tab.
- Backwards compatibility with the remote preview flow. The remote path is removed; there is no env-var fallback.

## 4. Architecture

```
┌────────────── EDITOR TAB (architect-vite) ──────────────┐
│                                                         │
│  StageEditor.tsx                                        │
│     │  user clicks "Preview"                            │
│     ▼                                                   │
│  launchPreview(protocol, startStage, useSynthetic)      │
│     │                                                   │
│     │ 1. validate protocol (existing validateProtocol)  │
│     │ 2. window.open("/preview", "_blank")              │
│     │ 3. add postMessage listener for "preview:ready"   │
│     │ 4. on "ready" → postMessage payload to source     │
│     │                                                   │
└─────┼───────────────────────────────────────────────────┘
      │                          ▲
      │  window.open             │ postMessage (same-origin)
      ▼                          │
┌─────┴── PREVIEW TAB (architect-vite, /preview route) ───┐
│                                                         │
│  PreviewHost                                            │
│     │ 1. on mount, post {type:"preview:ready"}          │
│     │       to window.opener                            │
│     │ 2. listen for {type:"preview:payload"}            │
│     │ 3. convert CurrentProtocol → ProtocolPayload      │
│     │ 4. if useSynthetic: generateNetwork(...)          │
│     │    else: createInitialNetwork()                   │
│     │ 5. build SessionPayload with startStage           │
│     │ 6. mount <Shell …/>                               │
│                                                         │
│  onRequestAsset(assetId)                                │
│     → read blob from existing assetDb (Dexie)           │
│     → URL.createObjectURL(blob), memoize per assetId    │
│     → revoke URLs on unmount                            │
│                                                         │
│  onSync, onFinish: no-ops (preview is ephemeral)        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Two principles drive the shape:

1. **The preview tab is the same architect-vite app at a different route.** Same origin, same Vite bundle, same Dexie database, same Redux Provider. `<PreviewHost>` mounts inside the existing `<Provider>` but `<Shell>` brings its own internal Redux store, so the architect store is dormant in the preview tab.
2. **The editor tab never persists the preview payload.** No IndexedDB scratch space, no localStorage. The protocol lives in the editor's memory, is shipped over postMessage once, and dies when either tab closes.

## 5. Components and file changes

### 5.1 New files

| Path                                                                         | Purpose                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/architect-vite/src/components/PreviewHost/PreviewHost.tsx`             | The `/preview` route. Performs the ready handshake, builds the payload, mounts `<Shell>`. Renders an "ended" fallback when the handshake fails or the tab is reloaded.                                                                   |
| `apps/architect-vite/src/components/PreviewHost/launchPreview.ts`            | Called from `StageEditor`. Opens the new tab and serves the payload over postMessage. Async function `launchPreview(protocol, startStage)` that resolves once the payload is delivered and rejects on popup-blocked / handshake timeout. |
| `apps/architect-vite/src/components/PreviewHost/currentProtocolToPayload.ts` | Pure helper: `CurrentProtocol` → `ProtocolPayload`. Generates a per-preview UUID for `id`, computes `hash` via `hashProtocol`, sets `importedAt` to now, transforms `assetManifest` into `ResolvedAsset[]`.                              |
| `apps/architect-vite/src/components/PreviewHost/useAssetResolver.ts`         | Hook that owns the `assetId → objectURL` cache, returns a stable `onRequestAsset` callback, revokes URLs on unmount.                                                                                                                     |
| `apps/architect-vite/src/components/PreviewHost/messages.ts`                 | Discriminated union of postMessage types and a small `isPreviewMessage(event)` type guard. Single source of truth for the wire format between editor and preview tab.                                                                    |
| `apps/architect-vite/src/components/PreviewHost/__tests__/`                  | Unit tests for converter, resolver, handshake logic, and the reload fallback.                                                                                                                                                            |

### 5.2 Modified files

| Path                                                             | Change                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/architect-vite/src/components/StageEditor/StageEditor.tsx` | Replace `uploadProtocolForPreview` call with `launchPreview`. Drop `UploadProgress` state and `getProgressText` — no upload phase remains. Add the preview-options popover (see §8).                                                                                                   |
| `apps/architect-vite/src/components/Routes.tsx`                  | Add `<Route path="/preview" component={PreviewHost} />`.                                                                                                                                                                                                                               |
| `apps/architect-vite/src/ducks/modules/app.ts`                   | Export `setProperty` and selector helpers (currently private). Add typed action `setPreviewUseSyntheticData(boolean)` and typed selector `getPreviewUseSyntheticData(state)` that defaults to `true` when unset. The slice is already in `rememberedKeys` so persistence is automatic. |
| `apps/architect-vite/package.json`                               | Add `@codaco/interview: workspace:*` and `@codaco/fresco-ui: workspace:*` (Shell's peer dep used for ThemedRegion/styles). Import `@codaco/interview/styles.css` from `main.tsx`.                                                                                                      |
| `apps/architect-vite/.env`, `.env.example`, `README.md`          | Remove `VITE_FRESCO_PREVIEW_URL` and `VITE_FRESCO_PREVIEW_API_TOKEN` entries.                                                                                                                                                                                                          |

### 5.3 Files deleted

| Path                                                       | Reason                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/architect-vite/src/utils/preview/uploadPreview.ts`   | Remote upload flow.                                                                 |
| `apps/architect-vite/src/utils/preview/types.ts`           | Wire types for the removed remote endpoint.                                         |
| `apps/architect-vite/src/utils/preview/`                   | Directory empty after removals — delete it.                                         |
| `apps/architect-vite/src/utils/__mocks__/previewDriver.ts` | Mock for the removed upload driver. Remove only after its call sites are rewritten. |

## 6. Handoff protocol

### 6.1 Wire format

A single discriminated union in `messages.ts`:

```ts
type PreviewReady = { type: 'preview:ready' };

type PreviewPayload = {
  type: 'preview:payload';
  protocol: CurrentProtocol;
  startStage: number;
  useSyntheticData: boolean;
};
```

No version field. Both tabs load the same Vite bundle in the same browser session — any change to the wire format lands in both ends in the same commit, so versioning has no scenario to protect against.

### 6.2 Sequence

```
EDITOR                                       PREVIEW TAB
──────                                       ───────────
launchPreview(protocol, startStage):
  popup = window.open("/preview", "_blank")
  if !popup → reject (popup blocked)
  add window.addEventListener("message", h)
                                             onMount:
                                               if !window.opener:
                                                 render "preview ended"
                                                 return
                                               window.opener.postMessage(
                                                 { type:"preview:ready" },
                                                 window.location.origin
                                               )
  receive "preview:ready":
    verify event.source === popup
    verify event.origin === location.origin
    popup.postMessage(
      { type:"preview:payload", … },
      location.origin
    )
    remove listener
    resolve()
                                             receive "preview:payload":
                                               verify event.source === window.opener
                                               verify event.origin === location.origin
                                               build ProtocolPayload + Session
                                               mount <Shell …/>
```

### 6.3 Hard rules

1. **Origin and source are both verified on every received message.** The editor only responds to messages from the popup it opened (`event.source === popup`) and only with the architect origin (`event.origin === location.origin`). The preview tab applies the symmetric check against `window.opener`. The origin check alone is insufficient: a same-origin iframe on a different page could otherwise forge messages.
2. **No `noopener` on `window.open`.** Required for the handshake. Mitigated by the source/origin checks; both tabs are our own code on the same origin.
3. **The editor holds the payload in a closure, not a global.** `launchPreview` captures `protocol`/`startStage` in its message handler, removes the listener after delivery, and resolves. Each Preview click is an independent closure.
4. **Editor-side timeout: 10 seconds.** If `preview:ready` doesn't arrive, `launchPreview` rejects with a "Preview tab didn't load" error and the Preview button re-enables. The popup is left alone — the user may have been backgrounded or have an extension blocking something.
5. **Preview-side reload fallback.** If `PreviewHost` mounts with no `window.opener`, it renders a static "This preview has ended. Return to architect to start a new one." view with a Close-tab button. No second handshake is attempted.
6. **Popup blocked.** `window.open` returns `null`; `launchPreview` rejects with a clear error; `StageEditor` surfaces it via the existing dialog system.

## 7. Asset resolution

`@codaco/interview` resolves assets lazily via `onRequestAsset(assetId): Promise<string>`. In remote Fresco the URL is an UploadThing CDN URL. In our local case the blob already lives in `assetDb` (Dexie), so the host produces object URLs on demand.

`useAssetResolver`:

```ts
function useAssetResolver(): AssetRequestHandler {
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(
    () => () => {
      for (const url of cache.current.values()) {
        URL.revokeObjectURL(url);
      }
      cache.current.clear();
    },
    [],
  );

  return useCallback(async (assetId: string) => {
    const cached = cache.current.get(assetId);
    if (cached) return cached;

    const entry = await assetDb.assets.get({ id: assetId });
    if (!entry || typeof entry.data === 'string') {
      throw new Error(`Asset ${assetId} not found in local store`);
    }

    const blob =
      entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
    const url = URL.createObjectURL(blob);
    cache.current.set(assetId, url);
    return url;
  }, []);
}
```

Behavior:

- First request reads from Dexie, creates an object URL, caches it.
- Subsequent requests return the cached URL.
- Unmount revokes every URL the resolver issued. Browsers also revoke when the document is destroyed; explicit revocation keeps HMR clean in dev.
- `apikey` assets are not resolved here — their `value` is embedded directly on the `ResolvedAsset` by `currentProtocolToPayload`.
- String-encoded `data` entries in Dexie are treated as missing, matching today's behavior in `uploadPreview.ts`.
- Missing-asset errors propagate to the calling stage. Each `@codaco/interview` stage owns its own asset-error handling; the host does not catch globally.

## 8. Synthetic data and the preference

### 8.1 Preference storage

Re-use the existing `app` slice in `ducks/modules/app.ts`. It is already a generic key-value store, already listed in `rememberedKeys`, already persisted to `localStorage` via `redux-remember`.

Two changes:

1. Make `setProperty` / `getProperty` (and corresponding selector) public exports — currently they are prefixed with `_` and unused.
2. Add a typed wrapper: a named selector `getPreviewUseSyntheticData(state)` that defaults to `true` when unset, and a named action `setPreviewUseSyntheticData(boolean)`. Callers depend on the typed wrapper, not the raw key.

No migration needed — first read returns `undefined`, the selector falls back to `true`.

### 8.2 UI surface

A small gear/options button sits immediately to the left of the Preview button in `StageEditor`'s `<ControlBar>`. Clicking it opens a popover with a single checkbox row: "Start preview with example data".

```
[ Cancel ]                                 [⚙] [ Preview ]
                                            ▲
                                            └ popover:
                                              ☑ Start preview with example data
```

No new screen, no new route, no new dialog.

### 8.3 Synthetic generation in `PreviewHost`

```ts
const { network } = useSyntheticData
  ? generateNetwork(protocol.codebook, protocol.stages)
  : { network: createInitialNetwork() };

const session: SessionPayload = {
  id: uuid(),
  startTime: new Date().toISOString(),
  finishTime: null,
  exportTime: null,
  lastUpdated: new Date().toISOString(),
  network,
  currentStep: startStage,
};
```

Decisions baked into this:

1. **`startStage` always wins over `generateNetwork`'s `currentStep`.** The user's explicit click overrides the synthetic generator's drop-out logic. `simulateDropOut` is left off.
2. **`respectSkipLogicAndFiltering` is off.** Matches the "preview a stage with data" intent better than the alternative.
3. **No seed.** Each Preview click reseeds. Reproducible previews are YAGNI today.
4. **Stage metadata from `generateNetwork` is discarded.** The user is starting at `startStage`; metadata is for earlier stages they're skipping past. If a stage that produces metadata (e.g. DyadCensus) is the one being previewed, the user wants to walk through it themselves.

## 9. Removal of legacy code

In a single change (no env-var fallback, no runtime toggle):

- Delete `apps/architect-vite/src/utils/preview/uploadPreview.ts`.
- Delete `apps/architect-vite/src/utils/preview/types.ts`.
- Delete `apps/architect-vite/src/utils/preview/` once empty.
- Delete `apps/architect-vite/src/utils/__mocks__/previewDriver.ts` after rewriting its call sites.
- Remove `VITE_FRESCO_PREVIEW_URL` and `VITE_FRESCO_PREVIEW_API_TOKEN` from `.env`, `.env.example`, and `README.md`.
- Drop the `protocol_previewed` event capture from the deleted file; re-emit it from `launchPreview` (see §10).

## 10. Analytics

Keep the existing `protocol_previewed` PostHog event. Move the capture call into `launchPreview` (editor side) so it fires the moment the user clicks Preview, with the same properties, plus one addition:

```ts
posthog.capture('protocol_previewed', {
  stage_count: protocol.stages?.length ?? 0,
  start_stage_index: stageIndex,
  asset_count: Object.keys(protocol.assetManifest ?? {}).length,
  use_synthetic_data: preferenceValue,
});
```

The interview package emits its own internal stage-navigation events through its analytics handler. We pass `disableAnalytics: true` and a stub `installationId` to `<Shell>` so preview activity does not pollute real interview analytics — matching the pattern used by the package's e2e host.

## 11. Testing

Four units, four test suites:

| Unit                                      | Test type                                                                          | What it verifies                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentProtocolToPayload`                | Vitest, pure-function unit tests                                                   | hash stability, asset-manifest → assets[] for each asset type (image/video/audio/network/geojson/apikey), id/importedAt are present, original protocol is not mutated |
| `useAssetResolver`                        | Vitest with `@testing-library/react` + Dexie test instance                         | cache hit returns same URL, cache miss reads Dexie, unmount revokes all issued URLs, missing asset rejects, string-data entries reject                                |
| `launchPreview` + `PreviewHost` handshake | Vitest with `jsdom` and a mocked `window.open` returning a stub with `postMessage` | ready → payload happy path, 10s timeout when no ready arrives, popup blocked rejects, messages from wrong origin/source ignored                                       |
| `<PreviewHost>` reload fallback           | Component test                                                                     | rendering with `window.opener === null` shows the "preview ended" view, no handshake attempted                                                                        |

No end-to-end test mounts `<Shell>` from architect. The interview package owns Shell's e2e coverage. Architect's tests stop at the boundary where a valid `InterviewPayload` and a working `onRequestAsset` are handed over.

## 12. Edge cases

| Case                                                                                     | Handling                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validation fails before preview                                                          | Existing dialog from `StageEditor.handlePreview` still fires; `launchPreview` is never called. No change.                                                                                                                                        |
| Popup blocked                                                                            | `launchPreview` rejects; `StageEditor` shows an Error dialog matching today's "Your browser blocked the preview popup…" but without a fallback link (there is no URL — it is a same-app route).                                                  |
| Editor tab navigated/closed before handshake completes                                   | The preview tab's `preview:ready` message hits nothing. After 10s of no reply, the preview tab renders the same "preview ended" view as the reload case.                                                                                         |
| Preview tab closed before handshake completes                                            | Editor's `launchPreview` listener stays registered until the 10s timeout, then rejects silently — the Preview button re-enables. Acceptable; no user-visible error needed when the user themselves closed the tab.                               |
| User clicks Preview twice in rapid succession                                            | Each click creates an independent closure with an independent listener. The button briefly disables during the "opening" phase to discourage this; if it slips through, two tabs open with two independent handshakes — not a correctness issue. |
| Asset blob deleted from Dexie between editor-side validation and preview-side resolution | Asset-not-found rejection bubbles into the relevant stage. The interview package handles missing-asset display already.                                                                                                                          |
| Stale `protocol` reaching the preview tab                                                | Cannot happen — `protocol` is captured in the editor's closure at click time and validated before `window.open`. The class of bug is structurally impossible.                                                                                    |

## 13. Known follow-ups (not in this design)

- Validation memoization. `validateProtocol` re-runs on every Preview click; on big protocols this is the dominant cost now that upload is gone. Not in scope here, but the user-perceived "time to preview" lower bound now lives in validation, so this is the lever for further speed wins.
- Promoting `currentProtocolToPayload` to `@codaco/interview` when a second consumer appears. Today architect is the only consumer; YAGNI keeps it local.
