# Network Canvas Background Creator — design specification

Issue: [#1026](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1026)
Depends on: [#1018](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1018) (responsive edge-to-edge canvas backgrounds — merged into this branch)

## 1. Purpose

A standalone mini app, `apps/background-creator` (`@codaco/background-creator`), for
researchers to author **responsive SVG canvas backgrounds** for the Narrative,
Network Composer, and Sociogram interfaces, following the rules established by
PR #1018 and its documentation article
(`apps/documentation/docs/design-protocols/key-concepts/responsive-svg-backgrounds.en.mdx`):

- Root `<svg>` has `width="100%" height="100%"` and **no `viewBox`** (no intrinsic
  aspect ratio; the SVG stretches edge-to-edge with the canvas).
- Geometry uses **percentage coordinates**.
- Labels are live `<text>` elements with `font-size: clamp(<min>px, <n>vmin, <max>px)`
  and system fonts — never outlined paths.
- Strokes use `vector-effect: non-scaling-stroke`.
- Transparent by default (no background rectangle) so the interface theme shows
  through; fills may use partial opacity.
- No external fonts, images, stylesheets, or scripts.

Beyond drawing, the app defines **zones** — invisible labelled regions stored as
metadata inside the SVG — and exports **Python or R scripts** that assign a
categorical variable to each node from its layout-variable position.

Two scenarios are first-class and ship as templates:

1. **Quadrants** — like the political-compass sample-protocol background added in
   #1018 (`packages/protocols/sample/assets/2946e670-….svg`): axis lines with
   arrowheads, filled quadrant rectangles, labels, one zone per quadrant.
2. **Concentric circles with layered zones** — nested rings where zone overlap is
   resolved by specificity (innermost/smallest wins).

## 2. Coordinate system — the load-bearing invariant

Everything is authored in **normalized document space**: `x, y ∈ [0, 1]`, origin
top-left, y increases downward. This is exactly:

- the layout-variable value space (`{ x, y }` written by the Sociogram — see
  `packages/interview/src/canvas/Canvas.tsx` drop handler), and
- the CSV export columns `<layoutVariable>_x` / `<layoutVariable>_y`
  (`packages/network-exporters/src/formatters/csv/processEntityVariables.ts`);
  GraphML uses `_X`/`_Y` (uppercase), same values.

The interview runtime renders the background via
`packages/interview/src/canvas/CanvasBackgroundImage.tsx` — an `<img>` with
`absolute inset-0 size-full object-contain`. A ratio-less SVG therefore fills the
canvas exactly, and normalized document space maps 1:1 onto the rendered
background at **every** aspect ratio. Zones defined in normalized space are
consistent with what the participant saw, no transformation needed anywhere.

Consequences:

- A warping ellipse is an ellipse in _normalized_ space — it stretches with the
  canvas exactly like percentage rects. Membership:
  `((x−cx)/rx)² + ((y−cy)/ry)² ≤ 1` in normalized space, aspect-independent.
- An ellipse with **`keepCircular`** renders as a true `<circle>` **centred at
  (0.5, 0.5)** with a `vmin`-based radius (`cx="50%" cy="50%"
style="r: <r×100>vmin"` — the same viewport-relative CSS mechanism the
  format already uses for text sizing), so it never warps. The centre lock is a
  deliberate simplifying constraint (enforced in the model and editor).
- **Locked-circle zone rule (aspect-free by design):** membership is the
  normalized disk `(x−0.5)² + (y−0.5)² ≤ r²`, computable from the exported
  `_x`/`_y` columns alone. This carries a one-sided guarantee: for any canvas
  `W×H`, the visual circle's normalized footprint is an ellipse with semi-axes
  `r·min(W,H)/W` and `r·min(W,H)/H`, both `≤ r`, so **every node dropped
  visually inside the circle is inside the zone** on every device. The only
  error is bounded over-inclusion (a band beside the circle on non-square
  screens also classifies inside; zero on square screens). Nested rings
  preserve their ordering, so ordinal ring assignment stays monotone. Scripts
  and docs state this plainly; no aspect-ratio input exists anywhere.
- "Most specific" zone = smallest area in normalized space (rect `w·h`,
  polygon shoelace, warping ellipse `π·rx·ry`, locked circle `πr²`). Ties
  break to the later element in document order; nested concentric zones
  resolve to the innermost ring.

## Revision 2 — zones are marked shapes (2026-07-17)

The original design carried zones as a parallel entity list. Revised: **any
rect, ellipse, or polygon element can be marked as a zone** via
`zoneLabel: string | null`. A zone is ordinary visible artwork (an invisible
zone is a fully transparent shape); lines and text cannot be zones. This
removes duplicate geometry (the compass fills _are_ its zones; the concentric
rings _are_ the rings' zones), and zone identification for external tooling is
"elements with a `zoneLabel`" in the embedded metadata JSON. The zone drawing
tools are removed; marking happens in Properties. Sections below are written
against this revision.

## 3. Document model (verbatim contract — `src/model/types.ts`)

All agents build against these types exactly. Colours are CSS colour strings
(hex). All coordinates/lengths are normalized fractions of the canvas
(`width`-relative for x-lengths, `height`-relative for y-lengths).

```ts
export type Vec = { x: number; y: number };

type BaseElement = { id: string };

// rect/ellipse/polygon can be marked as zones; the label becomes the exported
// variable value. null = not a zone.
export type RectElement = BaseElement & {
  kind: 'rect';
  x: number; y: number; width: number; height: number;
  fill: string; fillOpacity: number; // 0..1
  stroke: string | null; strokeWidth: number; // px, non-scaling
  zoneLabel: string | null;
};

export type EllipseElement = BaseElement & {
  kind: 'ellipse';
  cx: number; cy: number; rx: number; ry: number;
  fill: string; fillOpacity: number;
  stroke: string | null; strokeWidth: number;
  zoneLabel: string | null;
  // Render as a true vmin-radius circle centred at (0.5, 0.5) instead of
  // stretching. When true: cx = cy = 0.5 and rx = ry (enforced by schema
  // refinement; enabling it in the editor re-centres and sets r := rx).
  // See §2 for the aspect-free membership rule and its guarantee.
  keepCircular: boolean;
};

export type LineElement = BaseElement & {
  kind: 'line';
  x1: number; y1: number; x2: number; y2: number;
  stroke: string; strokeWidth: number;
  startArrow: boolean; endArrow: boolean;
};

export type PolygonElement = BaseElement & {
  kind: 'polygon';
  points: Vec[]; // ≥ 3
  fill: string; fillOpacity: number;
  stroke: string | null; strokeWidth: number;
  zoneLabel: string | null;
};

export type TextElement = BaseElement & {
  kind: 'text';
  x: number; y: number;
  lines: string[]; // ≥ 1, one <tspan> per line
  fill: string;
  fontMinPx: number; fontVmin: number; fontMaxPx: number; // clamp() parts
  fontWeight: 400 | 500 | 600 | 700;
  anchor: 'start' | 'middle' | 'end';
  opacity: number; // 0..1
};

export type SvgElement =
  | RectElement | EllipseElement | LineElement | PolygonElement | TextElement;

export type ZoneElement = RectElement | EllipseElement | PolygonElement;

export type BackgroundDocument = {
  version: 1;
  title: string;       // → <title>, a11y
  description: string; // → <desc>, a11y
  elements: SvgElement[]; // paint order = array order; zones = zoneLabel ≠ null
};
```

Zod schemas mirroring these types live in `src/model/schema.ts` and validate
documents parsed from opened files. IDs are `crypto.randomUUID()`.

## 4. SVG serialization (`src/svg/serialize.ts`)

`serializeDocument(doc: BackgroundDocument): string` produces a pretty-printed
standalone SVG:

- Root: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" role="img" aria-labelledby="title description">`
  with `<title id="title">` and `<desc id="description">`. **Never a `viewBox`.**
- Numbers → percentages with ≤ 2 decimal places, trailing zeros trimmed
  (`0.235` → `23.5%`).
- `rect` → `<rect x y width height>` in %, `fill`, `fill-opacity` (omit when 1),
  and when stroked `stroke`, `stroke-width`, `vector-effect="non-scaling-stroke"`.
- `ellipse` → `<ellipse cx cy rx ry>` in % (`rx` resolves against width, `ry`
  against height per SVG, matching normalized semantics), same paint attrs.
  With `keepCircular`: `<circle cx cy>` in % with `style="r: <rx×100>vmin"`
  (geometry-as-CSS; the radius tracks the smaller canvas dimension so the
  circle never warps — same viewport-relative mechanism as text sizing).
- `line` → `<line x1 y1 x2 y2>` in %, `stroke`, `stroke-width`,
  `vector-effect="non-scaling-stroke"`, plus `marker-start`/`marker-end`
  referencing a single shared `<marker id="arrow" markerUnits="userSpaceOnUse"
orient="auto-start-reverse">` def (emitted once, only when any line uses
  arrows), following the #1018 sample-protocol pattern. The marker path `fill`
  uses that line's stroke colour; when multiple arrow colours are in use emit one
  marker def per distinct colour (`arrow`, `arrow-2`, …).
- `polygon` → **nested-svg stretch pattern** (percentages are invalid inside
  `points`): `<svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100"
preserveAspectRatio="none"><polygon points="…" …/></svg>` where points are
  normalized × 100. The inner `viewBox` does not give the _root_ an intrinsic
  ratio, so the document remains edge-to-edge responsive; `vector-effect:
non-scaling-stroke` keeps polygon strokes uniform under the non-uniform scale.
- `text` → `<text x y fill text-anchor>` with
  `style="font-family: system-ui, sans-serif; font-size: clamp(<min>px, <vmin>vmin, <max>px); font-weight: <w>"`,
  `opacity` (omit when 1). Multi-line: one `<tspan x="<x%>" dy="…">` per line —
  first `dy` centres the block on `y` (`-((n−1)/2 − 0.35)em` ≈ the sample's
  `-0.2em` for two lines), subsequent `dy="1.2em"`.
- Zone-marked shapes render exactly like unmarked ones (a zone is ordinary
  artwork; invisibility is a styling choice). The full document is embedded as
  JSON in a metadata element after `<desc>`:

  ```xml
  <metadata id="nc-background-creator">
    <nc:document xmlns:nc="https://documentation.networkcanvas.com/xmlns/background-creator"
      >{…JSON…}</nc:document>
  </metadata>
  ```

  The JSON is the `BackgroundDocument` (XML-escaped as text content). This makes
  saved SVGs losslessly re-openable and lets other tooling identify zones.

`src/svg/parse.ts` — `parseDocument(svgText: string): BackgroundDocument`:
DOMParser → locate `metadata#nc-background-creator` → first child element's
`textContent` → `JSON.parse` → zod-validate → return. Throws a typed
`DocumentParseError` with a human-readable reason (not an SVG from this tool /
corrupt metadata / unsupported version) surfaced via dialog.

## 5. Zone assignment + script export

### Geometry (`src/geometry/zones.ts`, pure TS, unit-tested)

Zones are the document's elements with `zoneLabel ≠ null` (`ZoneElement`). All
tests are pure functions of normalized coordinates — aspect-free:

- `pointInZone(p: Vec, zone: ZoneElement): boolean` — rect: inclusive bounds;
  warping ellipse: normalized-ellipse test (`rx`/`ry`); `keepCircular`
  ellipse: the §2 disk rule `(x−0.5)² + (y−0.5)² ≤ r²` (`r <= 0` contains
  nothing); polygon: ray casting (the `ComposerCanvas.tsx` algorithm),
  boundary treated as inside-ish (ray-cast parity; no epsilon games).
- `zoneArea(zone: ZoneElement): number` — normalized area: rect `w·h`,
  warping ellipse `π·rx·ry`, locked circle `πr²`, polygon shoelace.
- `assignZone(p: Vec, zones: ZoneElement[]): string | null` — filter
  containing zones, return label of smallest area; tie → later in document
  order; none → `null`.

The generated Python/R implement **identical** semantics; TS unit tests and the
generated-script tests share fixture points/expectations so drift is caught.

### Script generation (`src/scripts/python.ts`, `src/scripts/r.ts`)

`generatePythonScript(doc, opts)` / `generateRScript(doc, opts)` where
`opts = { layoutVariable: string; outputVariable: string }` (collected at
export time via a form dialog; defaults `location` / `zone`). When the
document contains locked-circle zones, the script header states the one-sided
guarantee from §2 in plain language.

Both scripts:

- are standalone, dependency-free (Python 3 stdlib `csv`/`argparse`; base R),
- embed the zone list as literal data with a generated-by header comment,
- expose `assign_zone(x, y)` implementing §2 semantics (smallest-area wins,
  later-zone tie-break, `None`/`NA` when no zone contains the point or
  coordinates are missing/non-numeric),
- run as a CLI: `python assign_zones.py input.csv output.csv` /
  `Rscript assign_zones.R input.csv output.csv`, reading the Network Canvas CSV
  node (attribute-list) export, taking `--layout-variable` / `--output-variable`
  overrides, reading `<layoutVariable>_x` / `<layoutVariable>_y` columns
  (case-sensitive; the header comment explains the GraphML `_X`/`_Y` difference),
  appending the output column, and writing the result,
- fail with a clear message listing available columns when the expected columns
  are absent.

Export is blocked (with an explanatory dialog) while any zone label is empty or
duplicated — labels are the variable's values and must be unique (issue
requirement).

Vitest coverage: golden-file snapshot of each generated script + a
`describe.skipIf(no python3)` test that executes the generated Python against a
fixture CSV and asserts assignments (kept CI-safe; run locally during
verification). R semantics are covered by the shared TS fixture expectations.

## 6. App architecture

```
apps/background-creator/
  index.html            # boot shell, links src/styles/tailwind.css
  vite.config.ts        # react() + tailwindcss(), port 5185, vitest jsdom config
  tsconfig.json / tsconfig.app.json / tsconfig.node.json  # architect pattern
  .oxlintrc.json        # extends root + react.json, tailwind entryPoint
  package.json          # private, catalog:/workspace:* deps
  src/
    main.tsx            # fonts, DialogProvider + PortalContainerProvider, mount
    App.tsx             # full-screen layout: EditorCanvas + Toolbar + aria-live
    styles/tailwind.css # fresco.css + fresco-ui styles.css + app theme vars
    model/types.ts      # §3 verbatim
    model/schema.ts     # zod mirrors
    model/templates.ts  # blank | quadrants | concentric-circles documents
    svg/serialize.ts, svg/parse.ts, svg/__tests__/
    geometry/zones.ts, geometry/__tests__/
    scripts/python.ts, scripts/r.ts, scripts/__tests__/
    state/editorStore.ts     # zustand store (single-instance app ⇒ create())
    state/__tests__/
    canvas/EditorCanvas.tsx  # <img> preview + interactive overlay
    canvas/overlay/*         # selection handles, draft shapes, zone chrome
    toolbar/Toolbar.tsx      # SegmentedToolbar composition
    toolbar/*                # properties popover, export/open menu items
    files/save.ts, files/open.ts  # saveBlob ladder (from interviewer) + picker
```

### State (`state/editorStore.ts`)

Zustand `create()` (module singleton — this is a single-editor app, unlike the
per-stage factory stores in `packages/interview`; note the deviation and why in
a comment). Slices:

- `doc: BackgroundDocument`
- `selection: { id: string } | null` (elements only — zones are elements)
- `activeTool: 'select' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'text'`
- `draft` — in-progress drawing state (drag rect/ellipse/line; polygon vertex list)
- `zonesVisible: boolean` (default true), `previewAspect: 'fill' | '16:9' | '9:16' | '4:3' | '3:4' | '1:1'`,
  `previewSurface: 'interview' | 'light' | 'checker'` (default `interview`)
- history: snapshot-based `past`/`future` of `doc` (cap 100). Mutations go
  through `commit(mutator, { coalesceKey? })`; drags commit once on pointer-up.
- `announce(message: string)` — routes to the app-level `aria-live` region.

### Canvas (`canvas/EditorCanvas.tsx`)

- The preview region letterboxes to `previewAspect` inside the window (CSS
  `aspect-ratio`; `fill` = whole viewport). Surface behind the SVG per
  `previewSurface` (interview-dark uses the interview theme background colour;
  checker is a CSS gradient checkerboard).
- Bottom layer: `<img alt="" src={blobUrl}>` of `serializeDocument(doc)` —
  byte-faithful to what Interviewer renders (same `<img>` hosting, so `vmin`
  text sizing behaves identically). Regenerate on doc change; revoke stale URLs.
- Top layer: absolutely-positioned SVG overlay (percentage-positioned) carrying
  selection outlines, resize/vertex handles, draft shapes, and zone chrome —
  dashed outline + label pill on every `zoneLabel`-marked element, editor-only,
  hidden when `zonesVisible` off (pills for locked circles sit at the top inner
  edge so nested rings don't stack their pills).
- Pointer interactions (pointer capture, 5px drag threshold, `touchAction:
'none'` — the `useCanvasDrag` idiom): draw by drag (rect/ellipse/line),
  polygon by click-to-add-vertex + double-click/Enter to close, Escape cancels,
  text tool click places then opens the inline text editor. Select tool: click
  selects topmost hit, drag moves, handles resize (rect/ellipse corners; line
  endpoints; polygon vertices). Shift-drag constrains lines to 45° increments.
- Hover inspection: with zones visible, a small readout chip shows
  `assignZone(cursor, zones)` — live proof of the zone semantics. Zone chrome
  for a locked circle draws the _zone's_ normalized disk (dashed) distinctly
  from the visual circle, making the §2 over-inclusion band visible in the
  editor at non-square aspects.
- **Keyboard**: canvas is focusable; Tab cycles selectable items (roving
  selection), arrows nudge ±0.01 (Shift ±0.05), Delete removes, Escape
  deselects/cancels draft, Enter on a zone opens its label editor. Every state
  change announces via `aria-live` (throttled during drags — announce on
  completion, not per-move).

### Toolbar (`toolbar/Toolbar.tsx`)

One floating draggable `SegmentedToolbar` (`@codaco/fresco-ui/SegmentedToolbar`)
— the only chrome besides the canvas:

- Group (single-select): Select, Rect, Ellipse, Line, Polygon, Text.
- Toggle: show/hide zones. Popover: preview options (aspect preset ×
  surface).
- Popover: **Properties** (auto-opens on pointer click-selection; the trigger
  is disabled with nothing selected and the panel closes when selection
  clears): always-visible action row (item name, z-order backward/forward,
  delete), then contextual fields — colour (swatch grid from the app palette +
  native `<input type="color">` + "none" for stroke), fill opacity, stroke
  width (InputField stepper), line arrow toggles, text lines/anchor/weight/font
  clamp; for rect/ellipse/polygon a **Use as zone** toggle + label field
  (live-validated for empty/duplicate labels); for ellipses a **Keep circular**
  toggle (enabling re-centres to (0.5, 0.5) and sets `r := rx`; while enabled,
  position editing is locked and only the radius is adjustable).
- Undo / Redo buttons (⌘Z / ⇧⌘Z shortcuts too).
- Menu: **File** (action menu) — New (Blank / Quadrants / Concentric circles /
  Political compass), Open SVG…, Download SVG, Export Python script…, Export R
  script…, Document details… (title, description). Destructive replacement
  (New/Open over unsaved work) confirms via `useDialog().confirm`.

Files: save via the interviewer `saveBlob` capability ladder generalized for
MIME/extension (`image/svg+xml` / `.svg`, `text/x-python` / `.py`,
`text/plain` / `.R`); open via a hidden file input accepting `.svg`
(drag-and-drop onto the canvas also accepted, via `react-dropzone`).

### Visual style

Researcher-facing app chrome (not participant-facing): fresco tokens only
(`bg-*`, `text-*`, `elevation-*`, spring presets, `focusable` rings). The app
supplies a minimal theme CSS layering the shared fresco theme (architect
pattern) — dark-leaning chrome so the default interview-dark preview surface
reads naturally. Drawing palette presets favour colours legible on the
interview canvas (white/neutrals + a small hue ramp) while allowing any custom
colour. Motion: spring presets, `useReducedMotion` respected (toolbar
drag/popovers are Base-UI/fresco built-ins already compliant).

## 7. Templates (`model/templates.ts`)

- **Blank** — empty document.
- **Quadrants** — horizontal + vertical axis lines (arrowheads both ends), four
  soft-fill rects **marked as the zones** (`top-left` … `bottom-right`), four
  two-line quadrant labels + four axis labels (placeholder wording:
  "High/Low X", "High/Low Y").
- **Concentric circles** — three stroked `keepCircular` ellipses
  (`r ≈ 0.15/0.30/0.45`, non-scaling stroke, no fill) **marked as the zones**
  `inner` / `middle` / `outer`, centre labels — demonstrating smallest-wins
  layering, round-locked rendering, and aspect-aware assignment.
- **Political compass** — the startup document: a faithful model of the sample
  protocol's responsive compass asset (unsure band, four solid quadrant fills,
  arrowed axes, quadrant labels), the five fills marked as zones (`unsure`,
  `authoritarian-left/right`, `libertarian-left/right`).

## 8. Documentation updates (`apps/documentation`)

On top of #1018's article:

- `responsive-svg-backgrounds.en.mdx` — lead with the Background Creator as the
  recommended authoring path (what it does: draw primitives, live responsive
  preview, zones, SVG download, Python/R zone-assignment export); keep the
  format explanation and the Illustrator/Inkscape workflows as the manual
  alternative; keep accessibility guidance. Where the tool needs a link, use an
  HTML comment placeholder (`<!-- TODO: Background Creator URL once deployed -->`)
  rather than inventing a URL. An MDX-style `{/* */}` comment is not an option:
  the documentation pipeline renders `.mdx` as CommonMark plus raw HTML (no
  MDX/JSX compiler), so `{/* */}` renders as visible literal text while an
  HTML comment is dropped correctly.
- `data-export.en.mdx` — short note under layout-variable export: zone
  assignment scripts from the Background Creator consume the `_x`/`_y` columns.

## 9. Repo integration

- `pnpm-workspace.yaml`: auto-discovered (`apps/*`) — no change.
- `knip.json`: add `apps/background-creator` workspace entry
  (`entry: ["index.html!"]`, `vite: true`, `project: ["src/**/*.{ts,tsx}"]`,
  `paths: { "~/*": ["./src/*"] }`).
- `.changeset/config.json` `ignore`: add `@codaco/background-creator` (private,
  never released — matches the classic apps' hygiene pattern).
- `.claude/launch.json`: add `background-creator` on **port 5185** (5173, 5180,
  5189, 5199, 3000, 6006/6009 are taken).
- `turbo.json`: no changes (generic `dev`/`build`/`typecheck`/`test` apply).
- No PWA, no Netlify, no Chromatic, no e2e suite (unit tests only), no release
  lane. A Documentation changeset covers the docs edits.
- Dependencies: `catalog:` — react, react-dom, zustand, zod, lucide-react,
  react-dropzone, motion, @base-ui/react (only if directly imported);
  `workspace:*` — @codaco/fresco-ui, @codaco/tailwind-config, @codaco/tsconfig.
  Dev: vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, typescript,
  vitest, jsdom, oxfmt, @types/react, @types/react-dom (all catalog).

## 10. Implementation plan

Executed by orchestrated subagents; the orchestrator reviews each phase's diff
before unblocking the next.

- **A — Scaffold** (general): app workspace per §6/§9 including
  `src/model/types.ts` verbatim from §3, empty App shell that boots, knip /
  changeset-ignore / launch.json / oxlint wiring. Gate: dev server renders,
  scoped typecheck+lint pass.
- **B1 — Model & SVG** (complex): `model/schema.ts`, `model/templates.ts`,
  `svg/serialize.ts`, `svg/parse.ts` + tests (round-trip, percentage
  formatting, marker/nested-svg emission, metadata escaping, template
  validity against both mandatory scenarios).
- **B2 — Geometry & scripts** (complex, parallel with B1): `geometry/zones.ts`,
  `scripts/python.ts`, `scripts/r.ts` + tests (shared fixture table, golden
  scripts, skip-if-absent python3 execution test).
- **B3 — Docs** (general, parallel): §8 documentation updates + Documentation
  changeset.
- **C — Editor core** (complex, after B1): `state/editorStore.ts`,
  `canvas/EditorCanvas.tsx` + overlay: rendering, selection, drawing, moving,
  resizing, keyboard, announcements, zone chrome, hover assignment readout.
- **D — Toolbar & files** (general, after C + B2): `toolbar/*`, `files/*`,
  dialogs, export/open flows, App composition polish.
- **E — Integration verification**: quality gates + full browser drive (§11).
- **F — Adversarial review**: independent reviewers (responsive-SVG fidelity;
  zone/script semantics incl. executing generated scripts; a11y/keyboard; repo
  conventions) followed by fixes and re-verification.

## 11. Quality gates

`pnpm --filter @codaco/background-creator typecheck | test`, root `pnpm lint:fix`
(scoped), `pnpm knip`, `pnpm check:changesets`; browser verification of: draw
each primitive, both templates, aspect-preset stretching (text undistorted,
strokes constant, geometry stretching), zone hover assignment, SVG download +
re-open round-trip, generated Python executed against a fixture CSV, generated
SVG rendered in an `<img>` at multiple aspect ratios, keyboard-only operation
pass, axe/aria sanity via accessibility snapshot.
