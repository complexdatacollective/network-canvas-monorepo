# Protocol views redesign — design spec

Applies the visual language and layout patterns of the new Home route to the protocol-editing routes in `apps/architect-vite`.

## Scope

Six routes in `apps/architect-vite`:

- `/protocol`
- `/protocol/stage/:stageId`
- `/protocol/assets`
- `/protocol/codebook`
- `/protocol/summary`
- `/protocol/experiments`

Out of scope:

- Other apps in the monorepo.
- A global retirement of `src/lib/legacy-ui/components/Button.tsx`. A new button is introduced for touched views; legacy usages elsewhere are left in place.
- Interviewer-side changes (deep-linking into a specific stage is a dependency; fallback behavior is specified).

## Architecture overview

All six routes share a new fixed `ProtocolHeader` and use one of two layouts:

- **Split-pane family** (`/protocol`, `/protocol/stage/:stageId`): 50/50 horizontal split. Left pane is a live `PreviewIframe` of the deployed Interviewer. Right pane is a scrollable editor column.
- **Single-pane family** (`/protocol/assets`, `/codebook`, `/summary`, `/experiments`): max-width content column (~max-w-5xl), no preview pane.

The bottom `ProtocolControlBar` is retired. Its actions move into the header or inline into form sections.

## Components to build

New components live in `apps/architect-vite/src/components/shared/`. No barrel files; each component is imported directly from its file.

1. **`ProtocolHeader`** — fixed top bar matching Home's header pattern: architect logo, version badge, breadcrumb (protocol name, then section/stage name where relevant), and a slot for contextual right-side actions.
2. **New `Button` variants** — sea-green pill CTA with 3D shadow (matches Home's primary CTA), white pill secondary, neutral tertiary. Implements Home's button patterns. Consumed only within the six touched routes.
3. **`Card`** — white surface, soft purple-tinted shadow (matches `0 4px 12px rgba(22,21,43,0.08)` from Home), rounded, consistent internal padding on the `md`/`lg` spacing scale.
4. **`SplitPane`** — 50/50 layout primitive with responsive collapse behavior (see Responsiveness).
5. **`PreviewIframe`** — embeds the Interviewer iframe, owns the debounced auto-upload behavior, reloads the iframe on successful upload, surfaces loading/error states inside the pane.
6. **`TimelineRail`** and **`TimelineStation`** — TransitMap-inspired visual primitives. Horizontal rail with colored segments, station circles (36px, stage-type icon white-filtered on a colored inner fill), rounded white pill labels alternating above/below the rail. Integrates with the existing `motion/react` Reorder logic.

## `/protocol` view

**Layout**: split-pane. Header shows `ProtocolName` in the breadcrumb; right-side action is a sea-green pill **Save** button. Dirty state shows as a small dot on the button; successful save shows a brief "Saved" state.

**Right pane, top to bottom:**

1. **Overview `Card`** — inline-editable protocol name (transparent input, Home typography) and description. Below, a row of secondary-pill action buttons for Codebook, Assets, Print, Export. The schema version pill moves into the header badge.
2. **Timeline** — reorderable stage list, restyled as `TimelineRail` + `TimelineStation`s. Each stage is a station; stages are connected by colored rail segments. Stage labels sit in rounded white pills below each station, alternating up/down to prevent label crowding. Insert-between affordances appear as small "+" circles on the rail on hover. Horizontal scroll when the station count overflows the pane width. Drag-to-reorder preserved.
3. **Sub-route nav strip** — compact row of text links to Assets / Codebook / Summary / Experiments, replacing whatever sidebar/dropdown pattern those routes use today.

**Header actions:**

- **Save** — sea-green pill CTA. Disabled when not dirty.
- Logo click navigates to Home.

## `/protocol/stage/:stageId` view

**Layout**: split-pane. Header shows `ProtocolName ▸ StageName` in the breadcrumb; right-side actions are **× Cancel** (neutral tertiary) and **✓ Done** (sea-green pill).

**Right pane, top to bottom:**

1. **Stage heading `Card`** — stage-type pill badge (colored by stage type), inline-editable stage name, small subtitle (stage type description).
2. **Form section `Card`s** — each section from the current `StageEditor` (Information, Prompts, name-generator specifics, sociogram specifics, etc.) is wrapped in its own `Card` with soft shadow, Home typography, and consistent internal spacing. Cards stack vertically. No accordion behavior in this pass — keeps the current always-open behavior to avoid rebuilding section state logic.
3. **No bottom control bar.**

**Header actions:**

- **× Cancel** — neutral tertiary. If the form is dirty, existing confirmation dialog fires; otherwise navigates back to `/protocol`.
- **✓ Done** — sea-green pill. Commits the form and returns to `/protocol`. Disabled on validation failure; shows a small count-of-errors indicator when disabled. Clicking while disabled scrolls to the first error.

**Stage navigation:** Breadcrumb link back to `/protocol` to switch stages. No in-page stage jumper.

## Single-pane routes

Shared layout: `ProtocolHeader` (breadcrumb shows "ProtocolName ▸ Assets" etc.; nav links to sibling sub-routes on the right), centered content column (max-w-5xl), generous vertical padding matching Home.

- **`/protocol/assets`** — `Card`-wrapped dashed-border upload zone (sea-green, matching Home's drop card), followed by a grid of asset `Card`s. Each: thumbnail/icon, name, type badge, size, delete action.
- **`/protocol/codebook`** — pill-style tab toggle for Nodes / Edges / Ego (matching Home's Recent/Templates tab). Each tab shows a column of entity `Card`s with their variable definitions inside.
- **`/protocol/summary`** — stacked summary `Card`s (protocol metadata, stage count, variable count, asset count, validation status). Read-only.
- **`/protocol/experiments`** — list of experiment toggles as `Card`s with switch controls.

No split pane on these routes — they are not primarily about previewing, and the content is better served by a wider single column. The preview is one click away on `/protocol`.

## Preview iframe behavior

`PreviewIframe` owns all preview logic, including the upload pipeline integration.

- **Upload engine**: reuses the existing protocol-upload flow that the current Preview button invokes. Serialization, upload, and signed-URL return are already implemented; `PreviewIframe` consumes them.
- **Debounce**: ~2s on Redux state changes relevant to the current route (protocol state on `/protocol`; form + protocol state on `/protocol/stage`). Rapid edits cancel in-flight uploads.
- **Iframe update**: on successful upload, the iframe's `src` is set to (or swapped for) the new signed URL.
- **Error state**: upload failures set a pane-local error with a manual "Retry" button. Editing continues unaffected.
- **Initial mount**: if no upload URL is cached for this protocol revision, show a skeleton in the pane while the first upload runs.
- **Stage deep-linking**: on `/protocol/stage/:stageId`, if the Interviewer supports a stage deep-link (e.g. `?stage=<id>`), the iframe URL uses it. If not, the preview loads from stage 1 and the user navigates within the preview. The implementation plan must verify the Interviewer URL contract before locking inline deep-linking.

## Responsiveness

Architect is desktop-primary. Small-screen support is "doesn't crash and degrades sensibly."

- **≥1280px (primary target)**: split-pane 50/50 as designed.
- **1024px–1279px**: preview pane shrinks to ~40%, editor column takes ~60%. Acknowledges that the editor needs more room than the preview.
- **<1024px**: split-pane collapses. Preview becomes a collapsible top panel, default closed, toggled from a "Show preview" button in the header. Editor column takes full width.
- **<768px**: a small banner suggests using a larger screen. Layout does not crash.
- Header stays fixed at all breakpoints. On <768px, the version badge and nav links collapse behind a menu button.

## Data & state

- Protocol reducer continues to own protocol state. Stage editor continues to use `redux-form`.
- A new `preview` slice holds `{ status, url, error, lastUploadedAt }` keyed by protocol hash or revision. Derived, not persisted.
- Save-button dirty state is derived from the existing protocol-dirty selector. No new state.
- Preview debounce and cancellation logic lives inside `PreviewIframe`; it subscribes to the relevant slice(s) via `useSelector`.

## Risks and mitigations

- **Upload pipeline latency**: if uploads take >3s, the 2s debounce still feels live; if >10s, preview is too laggy to feel useful. Measure during implementation; adjust debounce if needed. Surface an upload-in-progress state inside the pane so the user understands the delay.
- **Iframe cross-origin**: if Interviewer is served from a different origin, we cannot `postMessage` without cooperation. This only becomes a concern if we later want two-way communication (e.g. "jump to stage N in preview"). Out of scope here.
- **Stage-type form sections resist cardification**: a mechanical wrap in `Card` should cover most, but some stage types may have bespoke layouts that need per-type adjustment. The plan treats each stage type as a separate implementation step.
- **ControlBar retirement may miss hidden features**: autosave indicators, undo affordances, or multi-stage operations may still live there. The implementation plan must include a pre-check that inventories the current `ProtocolControlBar` usages and confirms nothing is dropped silently.
- **Interviewer stage deep-link contract**: must be verified before the stage preview assumes deep-linking works. Fallback behavior (load from stage 1) is specified.

## Testing

- **Unit tests** for new components in `src/components/shared/`:
  - `ProtocolHeader` — breadcrumb rendering, action-slot composition.
  - `PreviewIframe` — debounce timing, cancellation of superseded uploads, error/retry state.
  - `TimelineRail` / `TimelineStation` — reorder integration, keyboard a11y.
- **Integration tests** via the existing architect-vite test setup: `/protocol` renders with a loaded protocol; `/protocol/stage/:stageId` renders; navigation between them preserves state.
- **Visual verification**: run `pnpm --filter architect-vite dev`; walk through all six routes; verify split-pane layouts at 1440, 1280, 1024, 768 widths.
- **No e2e tests** for the preview-iframe upload flow in this pass (requires a test Interviewer URL; defer).

## Build order

Per the chosen component-first approach:

1. `ProtocolHeader`
2. New `Button` variants
3. `Card`
4. `SplitPane`
5. `PreviewIframe`
6. `TimelineRail` + `TimelineStation`
7. Refactor `/protocol` (composes 1–6)
8. Refactor `/protocol/stage/:stageId` (composes 1–5)
9. Refactor `/protocol/assets`
10. Refactor `/protocol/codebook`
11. Refactor `/protocol/summary`
12. Refactor `/protocol/experiments`
13. Retire `ProtocolControlBar` after verifying nothing still depends on it

Each refactor step is a separate implementation unit with its own tests and visual verification.
