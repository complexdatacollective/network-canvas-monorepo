# Home screen: Protocols / Data views

Date: 2026-05-20
Scope: `apps/interviewer-v7`

## Problem

The Home screen mixes a primary surface (the protocol deck) with two modal escape hatches (`ImportDialog`, `InterviewsDialog`) reached from `TopActionBar` buttons. The interview-data table — which is the most consequential reading surface in the app — lives in a dialog that overlays the deck, hiding the very protocols those interviews belong to. There is no persistent visual relationship between protocols and the interviews they generate.

## Goal

Promote the data table to a peer of the protocol deck. The Home route hosts two views — **Protocols** (default) and **Data** — swapped in/out with a `motion/react` transition. Navigation between views replaces the `Import` / `Data` buttons in the header. The data dialog disappears entirely; import is reached via the existing "Import" card in the deck.

## Routing

- `/` → Protocols view.
- `/data` → Data view.
- Both are served by a **single** `<Route>` in `App.tsx` so `HomeRoute` stays mounted across view switches. Two separate `<Route>` siblings would cause wouter's `<Switch>` to unmount `HomeRoute` on every change, which would kill the within-Home `AnimatePresence` cross-fade.
- Concretely: register `<Route path="/:view?">` (wouter `path-to-regexp` syntax — `view` is optional). Inside the route, treat `view === 'data'` as the Data view and anything else (undefined or unknown) as Protocols. The `:view?` is loose enough to also match e.g. `/foo`, so add an explicit guard: if `view !== undefined && view !== 'data'`, render `NotFoundRoute` instead of `HomeRoute`.
- The outer page-transition wrapper in `App.tsx` uses `key={location}`, which would treat `/` → `/data` as a full page change. To keep the inner cross-fade as the only animation, derive a route-group key:
  ```ts
  const pageKey = location === '/' || location === '/data' ? 'home' : location;
  ```
  and use `key={pageKey}` on the outer `motion.div`. The outer `AnimatePresence` then sees the same key across the view switch and does not run a page-level exit/enter.
- `Interview.tsx`'s `handleFinish` navigates to `/data` instead of `/sessions`.

## Component changes

### New: `src/components/ViewSwitcher.tsx`

Segmented glass pill with two segments (`Protocols`, `Data`).

- Reads current location, derives active view (`/data` → `'data'`, anything else → `'protocols'`).
- Renders two segments inside a single `GLASS_PILL`-styled container. Active segment is filled with `bg-sea-green text-primary-contrast`.
- The active-background shape is a separate `motion.span` with `layoutId="view-switcher-indicator"` so it slides between segments.
- Each segment is a `<Link>` from wouter (so middle-click / cmd-click behave correctly), styled as a button.
- Sized to match the existing `GLASS_PILL` height (matches BrandHeader's h-14).

### `src/components/TopActionBar.tsx`

- Remove the `Import` and `Data` buttons and their `onOpenImport` / `onOpenData` props.
- Insert `<ViewSwitcher />` in their place (same animation entrance treatment — staggered Y-fade matching the previous buttons).
- Keep the lock + settings icon buttons. Props become `{ onOpenSettings: () => void }` only.

### New: `src/components/DataView.tsx`

Extracts the body of `InterviewsDialog` into a standalone view.

Inputs (props):

- `sessions: StoredSession[]`
- `onReload: () => Promise<void>` (used after successful export to refresh `exportedAt`)

Owns its own state: `selected`, `filter`, `search`, `sortDescending`, `exporting`.

Layout:

- Top bar: filter pills (All / In progress / Complete) on the left, search + sort on the right.
- Export action: rendered inline at the top-right of the filter row when `selected.size > 0`, replacing the `action` slot the dialog provided.
- Below: the existing `Surface` + `<table>` with the seven columns.
- No `Heading` ("Interview data") — the view-switcher pill conveys context.

Selection clears when the view unmounts (i.e., when switching back to Protocols and forward again).

### `src/routes/Home.tsx`

- Reads location to derive `view: 'protocols' | 'data'`.
- Loads `protocols`, `sessions`, `settings` as today; passes the right slice to each view.
- Body region is wrapped in `<AnimatePresence mode="wait">`. The two children are:
  - `<ProtocolsView protocols sessions settings onStartInterview … />` — encapsulates the existing `ProtocolDeck` + the pending-protocol overlay + the bottom `StatusRow`.
  - `<DataView sessions onReload />`.
- Each view's root motion element keys on `'protocols'` / `'data'`, with `initial={{ opacity: 0, y: 12 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, y: -8 }}`, `transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}`.
- The `ImportDialog` stays mounted in `HomeRoute` (still triggered by the deck's import card).
- `InterviewsDialog` is removed.
- `SettingsDialog` stays.
- The `OpenDialog` type and `openDialog` state reduce to `'import' | 'settings' | null`.
- `pendingProtocolHash` overlay only renders on the Protocols view (it sits inside `ProtocolsView`).

### `src/components/StatusRow.tsx`

- Visible only on the Protocols view (`ProtocolsView` includes it; `DataView` does not).
- Replaces the current `onOpenData` callback with a `<Link href="/data">` (wouter) wrapping the count text, so the click navigates to `/data` instead of opening a dialog.
- Drop the `onOpenData` prop.

### `src/components/InterviewsDialog.tsx`

Deleted.

### `src/routes/Interview.tsx`

`handleFinish` navigates to `/data` instead of `/sessions`.

## Legacy route cleanup

`AppShell` and its three child routes are unreachable from the Home screen and exist only as the wouter fallback. Delete:

- `src/components/AppShell.tsx`
- `src/routes/Protocols.tsx`
- `src/routes/Sessions.tsx`
- `src/routes/Settings.tsx`

Update `src/App.tsx`:

- Remove imports of `AppShell`, `ProtocolsRoute`, `SessionsRoute`, `SettingsRoute`.
- Remove the nested `<Switch>` wrapped in `<AppShell>`.
- Routes become: `/welcome`, `/interview/:sessionId`, `/`, `/data`, then `<Route component={NotFoundRoute} />` as the catch-all.

The Lucide imports (`FolderOpen`, `Users`) used only by AppShell go away with it. `Settings` icon is still used by `TopActionBar`.

## State / data flow

`HomeRoute` continues to be the single owner of `protocols` / `sessions` / `settings`. Both `ProtocolsView` and `DataView` are dumb consumers — switching tabs does not re-fetch. After import or export, `HomeRoute`'s `reload()` runs as today and the new sessions/protocols flow into whichever view is mounted.

## Animation choice

Cross-fade with small Y motion. ~300ms. `[0.22, 1, 0.36, 1]` easing (matches the existing app-wide ease constant). `mode="wait"` so the outgoing view's exit completes before the incoming view animates in — prevents both layouts overlapping in the same vertical region during the transition.

The view-switcher's filled indicator slides between segments via shared `layoutId`, providing a continuity cue independent of the body cross-fade.

## What stays the same

- `TopActionBar`'s lock + settings buttons.
- `BrandHeader` + `ResumePill` placement.
- `ProtocolDeck` internals (deck card carousel, import card, keyboard handling).
- `ImportDialog` (still mounted in `HomeRoute`, still triggered by the deck card).
- `SettingsDialog` (still mounted in `HomeRoute`, still triggered by the settings icon).
- `NewSessionDialog` flow (the pending-protocol card-morph overlay).
- The `@codaco/fresco-ui` patterns and `GLASS_PILL` styling.

## Out of scope

- Restyling the data table itself.
- Adding new filters / columns to the data view.
- Replacing the `ImportDialog` with a non-dialog surface.
- Persistent sidebar navigation (the old `AppShell` pattern is dropped, not replaced — Home is the shell).
