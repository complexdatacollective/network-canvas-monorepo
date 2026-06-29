<!-- Research artifact generated 2026-06-27 via multi-agent workflow (9 researchers + 3 adversarial critics). No code changes. -->

## Resolved decisions (2026-06-27, from user)

- **Q1 — Read-only scope: ENTIRELY read-only.** No Narrative gesture may persist. The existing
  `handleNodeDragEnd` write-through (pointer `useCanvasDrag.ts:109–110` **and** keyboard `:173–174`,
  unconditional `updateNode`) is treated as a **bug to fix as part of this work** — not preserved. Drag/keyboard
  should at most pin/release nodes ephemerally in the sim (`fx/fy`); nothing writes `layoutVariable`.
- **Q7 — Shared (multi-group) nodes: HONEST placement.** Shared nodes settle between their hulls (overlap region);
  do **not** bias toward the larger group or cap displacement. Accept hull overlap where membership truly overlaps.
- **Defaults adopted (recommended in §11):** Q2 out-of-codebook values get cohesion (mirror hulls); Q3 cohesion-only
  (no real-edge `forceLink`); Q5 key on `currentPreset.groupVariable`; Q6 run-once-and-freeze per preset visit.
  Q4 strength stays an empirical tuning task during implementation.

# Narrative group-aware layout — research & recommendation

> Scope: the **modern** interview runtime, `@codaco/interview`, at `packages/interview/src/interfaces/Narrative/`. (`apps/interviewer` is the separate legacy app and is out of scope.)
> Status: research + implementation-ready design. No code written. Every high-severity adversarial finding is resolved or surfaced as a blocking open question below.

---

## 1. Problem & current behaviour

The Narrative interface today renders a **static** node layout and runs **no force simulation**:

- `Narrative.tsx:243` renders `<Canvas … simulation={null} />`. There is no simulation object at all — nodes never move on their own.
- Node positions are read directly from each node's authored `layoutVariable` attribute: `Narrative.tsx:174–176` calls `store.getState().syncFromNodes(nodesWithLayout, layoutVariable)` whenever nodes or the layout variable change.
- Only nodes that actually have the `layoutVariable` attribute set are included (`nodesWithLayout`, `Narrative.tsx:155–161`), and that same array feeds both `<Canvas>` and `<ConvexHullLayer>` (`Narrative.tsx:216`).
- Group membership for the convex hulls is driven by `currentPreset.groupVariable`, a **categorical** variable. `ConvexHullLayer.groupNodesByVariable` normalizes each node's value with `Array.isArray(raw) ? raw : [raw]` and filters to `string | number`, so a node whose categorical value is an **array** belongs to **multiple** groups and is drawn inside **multiple** hulls.
- `ConvexHullLayer` reads positions from the zustand canvas store inside a `requestAnimationFrame` loop and redraws hulls with `concaveman`, so it automatically reflects any position change the store receives — no coupling to how positions get there.

Consequence: because the layout is purely the authored positions, same-group nodes are not pulled together. Hulls overlap and read messily whenever the authored layout doesn't already cluster by group. The goal is to nudge same-group nodes together so hulls are cleaner — **without persisting** any of those adjusted positions.

The canvas store (`useCanvasStore.ts`) holds `positions: Map<nodeId, {x,y}>` in **normalized 0–1** coordinates, clamped to canvas bounds. Its relevant actions: `setBatchPositions` (in-memory, used by sim ticks), `syncFromNodes` (load from attributes), and `syncToRedux` (`useCanvasStore.ts:164–177`) which dispatches `updateNode` per node — **this is the persistence path that must never run for the group layout.**

---

## 2. Recommended approach

**Add an ephemeral, read-only force simulation to the Narrative interface driven by a custom d3-force "group-cohesion" force that pulls each node toward the live centroid(s) of the group(s) it belongs to. Do NOT use invisible edges.**

Rationale: the force runs in a Web Worker, seeds from the authored `layoutVariable` positions, and writes **only** to the in-memory store via `setBatchPositions` — never to node attributes — so adjusted positions are ephemeral and recomputed every visit. A custom centroid force is strictly better than the user's invisible-edge hypothesis on the two axes that matter here: (a) it natively handles a node belonging to **multiple groups** (categorical arrays) by summing a partial pull toward each group's centroid, and (b) its strength is an explicit constant rather than d3's degree-dependent `forceLink` default — at lower complexity and with **zero** fake objects that could leak into the position map, the hull layer, or any persistence path. It requires no schema change, no migration, and no architect-web work; it engages automatically whenever a preset has `groupVariable` set — the same condition that already gates `ConvexHullLayer`.

---

## 3. Why not the alternatives

| Approach                                                                        | Why rejected                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invisible clique edges** (`forceLink`, all-pairs within a group)              | **O(k²)** links per group of size _k_; and a multi-group node's degree inflates, so `forceLink`'s default `strength = 1/min(deg)` **silently weakens every one of its links**, distorting both groups. You'd have to override `strength()` anyway, at which point you've taken on the link bookkeeping for nothing.   |
| **Star edges to one real group member (hub)**                                   | The hub is ambiguous and order-dependent for a node that is a hub of group A but a leaf of group B; over-weights the chosen center and yields lopsided hulls.                                                                                                                                                         |
| **Star edges to a virtual centroid node**                                       | Viable but introduces **fake nodes** that must be filtered out of _every_ path: the sim node list, `setBatchPositions`, the store's position map, hull grouping, and any persistence. One missed filter corrupts a hull or attempts to persist a non-node. This leak surface is exactly what the custom force avoids. |
| **Pure `forceX`/`forceY` toward a centroid**                                    | `forceX`/`forceY` **cache their target accessor at `initialize()`** and cannot track a centroid that moves every tick. Only a custom `force(alpha)` that recomputes centroids each tick can express group cohesion.                                                                                                   |
| **Off-the-shelf clustering forces** (`d3-force-cluster`, `d3-force-clustering`) | Both assume **one** `clusterId` per node; they cannot express a node in multiple groups. Our categorical-array case needs multi-membership, which the ~40-line custom force handles directly.                                                                                                                         |

---

## 4. How it satisfies READ-ONLY

There are exactly **four** attribute-write call sites reachable from Narrative/Canvas. The automatic group layout touches **none** of them. The table is exhaustive — note that critique review surfaced two write sites the original draft folded into one ("drag"); both are listed.

| #   | Write path                                                                  | Location                                             | How the group layout avoids it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `store.syncToRedux()` → `dispatch(updateNode)` per node                     | `useCanvasStore.ts:164–177`                          | **Never called by the new hook.** This is the sole store-level attribute writer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | Worker `'end'` → hook `'end'` handler → `syncToRedux()`                     | `useForceSimulation.ts:139` (Sociogram only)         | We **fork** the hook (§6), and the fork's `'end'` branch calls **only** `setBatchPositions`. The fork does not receive `dispatch` / `currentStep` at all, so the `syncToRedux` call is **not even constructible**. Fork-not-reuse is deliberate: a `persist:false` flag on the shared hook could be flipped by a future edit; a fork has no flag to flip. **Must-fix incorporated:** the worker emits `'end'` on `'stop'` too (`forceSimulation.worker.ts:156`), so the fork must drop persistence from the `'end'` branch **unconditionally — for all `'end'` sources, not just natural convergence.** |
| 3   | Pointer drag release → `onDragEnd` → `handleNodeDragEnd` → `updateNode`     | `useCanvasDrag.ts:109–110` → `Narrative.tsx:179–192` | Pre-existing, **user-initiated**. **Verified correction to the draft:** `handleNodeDragEnd` dispatches `updateNode` **unconditionally** — it is _not_ gated by `allowRepositioning` in Narrative; that prop only gates whether the gesture is allowed upstream in `Canvas`. See Q1 — this must be resolved before coding because §6 wires the sim against this same gesture.                                                                                                                                                                                                                            |
| 4   | **Keyboard arrow-nudge** → `onDragEnd` → `handleNodeDragEnd` → `updateNode` | `useCanvasDrag.ts:173–174` → `Narrative.tsx:179–192` | **Same persistence path as #3, separate call site** (verified). The draft missed this. Every `ArrowUp/Down/Left/Right` press calls `simulation?.moveNode` **and** `onDragEnd?.(nodeId, newPos)` → persists a single position. Once §6 wires `simulation={moveNode,releaseNode}`, a keyboard nudge would pin one node into the ephemeral sim **and** immediately persist it, while the sim re-settles every other node ephemerally — a half-persisted/half-ephemeral layout. **Blocking; folded into Q1.**                                                                                               |

**The only output of the automatic group layout is `store.getState().setBatchPositions(entries)`** — an in-memory mutation of the normalized-0-1 positions map, clamped to bounds (`useCanvasStore.ts:77–85`). Because the custom centroid force creates **no `SimNode` or link objects**, no fake node can ever reach `setBatchPositions` or `updateNode`. Positions are re-derived each visit from `syncFromNodes` and never persist.

**Enforcement:**

- A unit test mounts the forked hook against a mocked store and asserts `syncToRedux` is never called and `dispatch` receives no `updateNode` action across a **full** lifecycle that explicitly includes a `tick → stop → 'end'` cycle (not only natural run-to-end).
- A grep-able invariant comment in the fork: `// READ-ONLY: never call syncToRedux — see design §4`.

---

## 5. Multi-group (categorical array) handling

This is load-bearing; the critiques flagged several precise requirements, all incorporated.

- **Membership derivation (single source of truth).** `groupKeys(node) = (Array.isArray(raw) ? raw : [raw]).filter(v => typeof v === 'string' || typeof v === 'number')` where `raw = node.attributes[groupVariable]`. This must be **identical** to `ConvexHullLayer.groupNodesByVariable`. **Must-fix:** extract this normalization into one shared helper used by _both_ the force and the hull layer, so they cannot drift on the `null` / boolean / `[]` edge cases (all → zero groups, ungrouped, untouched). The force derives membership **only** from attribute values, **never** from `categoricalOptions` / the codebook (mirroring `groupNodesByVariable`, which itself ignores `categoricalOptions` for membership — that's a color-only concern in `buildColorIndexResolver`). Out-of-codebook values therefore form real groups and feel real cohesion, matching the hulls.

- **Membership index.** Build `Map<groupKey, SimNode[]>` from flattened `(node, key)` pairs at `force.initialize(nodes)`, reading `groupKeys` **off each `SimNode` object** (attached in the `initialize` message), never by external array index. This survives the worker's `nodeId`-keyed `update_node` rebuild (which does `{...node, ...patched}`, preserving the `groupKeys` property) and re-initialization when `simulation.nodes()` is reset.

- **Singleton drop is PER-GROUP-BUCKET, not per-node** (must-fix). A `groupKey` bucket with `< 2` members is removed from the map. A node that is a singleton in group B but a member of 5-node group A **still feels A**. Do not skip the node itself.

- **Combination policy: SUM of partial pulls, each scaled by `1/groupCount`.** A node in `{A,B}` gets `(strength·alpha)/2` toward `centroid_A` and the same toward `centroid_B`, settling at the barycenter of its groups (the A∩B overlap region, where a shared node should render). The `1/groupCount` divisor prevents multi-group nodes from being yanked harder than single-group nodes. **Do not** average centroids into one moving target and snap per tick — that creates limit cycles that smear hulls.

- **Shared-node centroid contamination (must-fix).** A shared node contributes to _and_ is pulled toward every centroid it belongs to, so it biases both centroids toward itself, weakening the cohesion that should pull each group's **own** members together. Mitigation: when applying a node's pull toward a group, compute that group's centroid **excluding the node's own position** (centroid over `members(group) \ {node}`). This removes the self-reinforcing coupling at negligible cost. A unit test must assert that the **non-shared** members of two far-apart groups bridged by one shared node still converge — not merely that the shared node lands between them (the draft's test only checked the latter).

---

## 6. Concrete integration plan

**Worker vs main-thread:** keep the simulation in a Web Worker (matching Sociogram), with **one exception** for Chromatic determinism — see §8, where a main-thread synchronous-settle path is required because a Web Worker cannot be driven to convergence synchronously across the `postMessage` boundary.

### New files

1. **`Narrative/forceGroupCohesion.ts`** — custom force factory. `force.initialize(nodes)` builds `Map<groupKey, SimNode[]>` once (per-bucket singleton drop), reading `node.groupKeys`. `force(alpha)` does: pass 1 — accumulate per-group centroids from current `x/y`; pass 2 — for each node, for each of its groups, `node.vx += (centroidX_excludingSelf − node.x) · strength · alpha / groupCount` (and `vy`). Exposes `.strength()`, `.average(true)` (the `1/groupCount` divisor), `.distanceMin()`.
2. **`Narrative/narrativeLayout.worker.ts`** — fork of `forceSimulation.worker.ts`. Registers `forceGroupCohesion` as force `'group'`; **removes `forceLink`** by default (Q3); accepts `groupKeys` per `SimNode` in `initialize`. **Critical control-flow change (must-fix):** the existing worker ignores the seed alpha — `initialize` ends with `simulation.alpha(0).stop()` (`forceSimulation.worker.ts:129`) and the only run trigger, `'start'`, hardcodes `simulation.alpha(1).restart()` (`:163`). A naive fork would run a **full relayout** and jolt the user off the authored layout. The fork must add a gentle-start path (a `'start'` variant carrying an alpha, or set `simulation.alpha(0.4)` before `restart()`) and must **not** auto-start at `alpha(1)`. `'tick'` and `'end'` only `postMessage` positions — the worker never persists (it never did; persistence lived in the hook).
3. **`Narrative/narrativeLayout.worker.mock.ts`** — fork of the deterministic mock worker; ignores `groupKeys`, emits the grid + immediate `'end'`. Swapped in under `isE2E` (Playwright only — see §8).
4. **`Narrative/useNarrativeLayout.ts`** — fork of `useForceSimulation.ts` **minus all persistence**: no `dispatch`, no `currentStep`, no `syncToRedux`. Reuses `SIM_RANGE = 250`, `toSimCoords`/`toNormalized` **unchanged** (do not re-derive). Seeds `simNodes` from `store.getState().positions` (authored layout), with the existing `{x:0.5,y:0.5}` fallback for any node lacking a seed; attaches `groupKeys` per node. Re-seeds + restarts on `nodeIdsKey` / `layoutVariable` / `groupVariable` / preset change (mirroring `useForceSimulation.ts:77–84,172`).

### Modified files

5. **`Narrative.tsx`**
   - Call `useNarrativeLayout({ enabled: !!currentPreset?.groupVariable, nodes: nodesWithLayout, store, groupVariable: currentPreset?.groupVariable })`.
   - **Grouping source:** pass `currentPreset.groupVariable` directly — **not** the display-toggled `convexHullVariable` (which is `''` when hulls are hidden, `Narrative.tsx:146–148`). See Q5: this means cohesion can move the layout while hulls are hidden. Document the **invariant** that the force keys on `groupVariable` (stable) and the hull layer on `convexHullVariable` (display-gated); they intentionally diverge when `showConvexHulls` is false, so a later refactor must not "unify" them onto `convexHullVariable` and silently disable cohesion.
   - **Drag wiring depends on Q1.** If Q1 resolves "read-only including drags," pass `onNodeDragEnd={undefined}` (or remove `handleNodeDragEnd`) so **no Narrative gesture** writes attributes, and wire `simulation={moveNode, releaseNode}` for ephemeral pin/release only. If Q1 resolves "keep user drag persistence," keep `handleNodeDragEnd` but accept that both pointer (`useCanvasDrag.ts:109–110`) and keyboard (`:173–174`) nudges persist `layoutVariable` while the sim re-settles other nodes — and document that interaction.

### Reused unchanged

- **`ConvexHullLayer.tsx`** — no change. Its rAF `updateHulls` loop already reads `store.positions` each frame, so hulls follow `setBatchPositions` automatically.
- **`EdgeLayer.tsx`** — no change. The cohesion force produces no link objects, so nothing can leak into the visible edge array.
- `groupNodesByVariable`'s normalization — reused via the **shared helper** of §5, not duplicated.

---

## 7. Force configuration (relative to Sociogram)

Sociogram baseline (`forceSimulation.worker.ts:14–21`): `charge −150`, `linkDistance 60`, `center 0.05`, `collideRadius 30`, `alphaDecay 1 − 0.001^(1/300)` (~300 ticks), `velocityDecay 0.1`. Narrative is gentler and seeded — **refine, don't relayout**:

| Param                   | Sociogram                           | Narrative                                                                                  | Why                                                                                        |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Seed**                | from store, random fallback         | from store `positions` (authored `layoutVariable`) via `toSimCoords`; `{0.5,0.5}` fallback | Deterministic, near-identity start                                                         |
| **Group cohesion**      | —                                   | new `forceGroupCohesion`, **strength ≈ 0.1** (range 0.05–0.12)                             | The only intended attractor; gentle                                                        |
| **charge**              | −150                                | **−20 to −30**                                                                             | Enough intra-group spread to read as an area, not a knot                                   |
| **collideRadius**       | 30                                  | **30**, `iterations(2)`                                                                    | Primary anti-collapse force                                                                |
| **center** (`forceX/Y`) | 0.05                                | **0** (removed)                                                                            | Center pull would drag the whole composition inward                                        |
| **forceLink**           | real edges, dist 60                 | **removed** (Q3)                                                                           | No real-edge force unless edges are displayed                                              |
| **start alpha**         | `alpha(1)` (hardcoded in `'start'`) | **`alpha(0.4)`** via the new gentle-start path                                             | Gentle perturbation, not full relayout — **requires the control-flow change in §6/file 2** |
| **alphaMin**            | 0.001                               | **0.1**                                                                                    | Short run (~40–80 ticks)                                                                   |
| **velocityDecay**       | 0.1                                 | **0.3**                                                                                    | Less overshoot, faster settle                                                              |
| **Stop**                | runs/persists on `'end'`            | **run-to-`'end'`, then freeze**; `setBatchPositions` only; restart only on input change    | Zero steady-state CPU; stable image                                                        |

**Hard requirement, not a tuning constant:** low-alpha refinement must be enforced in the fork (gentle start, `alpha ≤ 0.4`, short schedule, seed strictly from store). Add a test asserting each node's post-settle displacement from its authored seed is bounded (`< X` normalized units), so a future regression that reintroduces a full relayout is caught.

---

## 8. Determinism, tests, and the drag interaction

### Determinism — Chromatic is the load-bearing risk (verified, partly unsolved by anything existing)

- **The `isE2E` mock-worker swap engages only under Playwright, NOT Storybook/Chromatic.** Verified: `StoryInterviewShell` passes `flags={{ isDevelopment: true }}` with **no `isE2E`**, so the 14 Narrative stories + capture story run the **real** d3-force worker under Chromatic.
- **`isChromatic()` in `.storybook/preview.tsx` is used only to disable animations** (`preview.tsx:86–91`), never to drive a worker to convergence. So there is **no existing precedent** for a synchronous-settle path in this package.
- **A Web Worker cannot be settled synchronously** before paint — `postMessage` is async. The draft's "run to alphaMin synchronously and emit one frame" is impossible across the worker boundary. **Resolution (pick one, explicitly):**
  - **(a) Recommended:** under `isChromatic()` / `navigator.webdriver`, run the d3-force loop **on the main thread** (no worker) to a converged layout synchronously, emit one `setBatchPositions`, then freeze. This is the only way to get a deterministic pre-paint image.
  - **(b)** Gate the Chromatic snapshot on an async convergence signal (a `play()`/loader that awaits `data-simulation-running === 'false'`), the same way an e2e fixture would. Do **not** rely on `CaptureParameters.delay` alone — racy if not converged.
- **Before building, confirm how the existing `AutomaticLayout` / `AutomaticLayoutLarge` Sociogram stories avoid Chromatic flake** (they have no `play()`, no chromatic delay, no `disableSnapshot`). Adopt the _same proven mechanism_ the repo already relies on rather than inventing a new one — if those stories are silently flaky or snapshot-disabled at the project level, that's the answer to mirror.
- **Settle signal:** mirror Sociogram's `data-simulation-running` attribute on the Narrative root + `data-testid` so capture/e2e can wait for convergence. `NarrativeFixture` is an empty placeholder today; expose the attribute now (silos has no Narrative stage, so nothing breaks).

### Unit tests (`--project units`, jsdom)

1. **No persistence** — mocked store; assert `syncToRedux` never called and `dispatch` never receives `updateNode`, across a `tick → stop → 'end'` cycle (covers the stop-emitted `'end'`).
2. **Same-group convergence** — two groups seeded far apart; intra-group mean pairwise distance + per-group centroid spread shrink vs baseline.
3. **Multi-group node sits between** — `['A','B']` settles bounded between `centroid_A` and `centroid_B`.
4. **Non-shared members still converge** with one shared node bridging two far-apart groups (the centroid-contamination guard from §5).
5. **Determinism** — same seed + input ⇒ identical output **across two runs in the same process** (do not claim cross-machine FP identity; assert same-engine equality only).
6. **Clamping** — all outputs within 0–1, including a node whose `layoutVariable` is truthy-but-malformed (seeded to `{0.5,0.5}`, must not crash).
7. **Singleton / empty / boolean** — per-bucket singleton drop; `[]`/`null`/boolean → ungrouped, untouched; a node that is a singleton in B but member of A still feels A.
8. **`groupKeys` survive a drag** — drag a multi-group node, release, assert cohesion still groups correctly (the property survived the worker's `update_node` object rebuild).

### Rendered-layout assertion (storybook/chromium project, CI-only)

A Narrative story `play()` modeled on Sociogram's `DiamondNodes`: `waitFor` rAF-populated hulls, read node-button centers, assert same-group nodes are spatially closer than cross-group nodes (or hull-overlap area shrinks vs a no-cohesion baseline). Defer to CI per project memory — the chromium project flakes locally.

### Drag × `allowRepositioning` interaction (verified)

- With the sim wired, `useCanvasDrag` sets `fx/fy` via `simulation.moveNode` on drag (`:85`) and clears them via `releaseNode` on release (`:109`) — ephemeral pin/unpin.
- **Correction to the draft:** `handleNodeDragEnd` is **not** gated by `allowRepositioning`; it dispatches `updateNode` on **every** drag-end and **every** arrow-nudge. So "drag persistence is pre-existing and out of scope" is **too glib** once this feature wires the sim against the same gestures. This is the substance of Q1 and must be resolved first.

---

## 9. Configurability decision

**Zero-config.** Run the ephemeral cohesion layout automatically whenever a preset has `groupVariable` set — the same condition already gating `ConvexHullLayer`.

- **No new persisted data exists.** Group membership is fully specified by the existing `presets[].groupVariable`; adjusted positions are explicitly ephemeral. Nothing new is written to the protocol file, so nothing new belongs in the schema.
- **The "hand-authored → schema + migration" rule does not apply** — that rule governs new _persisted/validated_ data. This reads only existing data and persists nothing.
- **Adding any config key is expensive and disproportionate.** Every Narrative schema object is `z.strictObject`, so any new key (`behaviours.groupAttraction`, `presets[].groupLayoutStrength`) is a breaking change needing a v8→v9 migration module, migration tests, corpus revalidation, **plus** architect-web editor work (`PresetFields.tsx` field + toggle-reset + normalize + selector plumbing) — an ecosystem-wide cost for a cosmetic nudge.
- **Precedent:** Narrative already hardcodes hull/edge defaults, stroke/opacity, and sim force constants without protocol config. Cohesion tuning lives as hardcoded constants, like `charge = −150`.
- **Promotion path:** if researchers later need per-preset control, _that_ is the trigger to take on schema + migration + editor cost for an opt-in strength — presented as a single future deliverable if and when motivated, not a pre-planned phase.

---

## 10. Edge cases & risks (must-fixes folded in)

**Handled edge cases:**

- Singleton **bucket** → dropped at `initialize` (per-bucket, not per-node); no self-pull, no divide-by-zero.
- One giant group → centroid ≈ global mean; over-collapse countered by `forceCollide(30)` + mild charge + modest strength.
- Node without `layoutVariable` → already excluded from `nodesWithLayout`; never in store or sim.
- Node with no/empty/boolean group value → ungrouped; base forces only; matches hull exclusion.
- Node whose `layoutVariable` is truthy-but-not-`{x,y}` → passes the `nodesWithLayout` truthiness filter but is dropped by `syncFromNodes`; the hook's `{0.5,0.5}` seed fallback applies. Test #6 covers it.
- `groupKeys` survive the worker's `nodeId`-keyed `update_node` rebuild because the spread preserves the property; re-`initialize` runs when `simulation.nodes()` is reset. Test #8 covers it.

**Risks:**

- **Read-only violation via drag/keyboard write-through** (high) — pointer (`:109–110`) and keyboard (`:173–174`) both persist via `handleNodeDragEnd`. **Resolve Q1 before coding.**
- **Full-relayout jolt** (high) — the worker's hardcoded `alpha(1)` start defeats "stays recognizable." Fixed only by the §6 gentle-start control-flow change, not a constant.
- **Chromatic flake** (high) — no existing synchronous-settle precedent; the worker can't settle synchronously. Resolve via main-thread settle under `isChromatic` (8a) or async convergence gate (8b); confirm the Sociogram automatic stories' current mechanism first.
- **Shared-node centroid contamination** (medium) — mitigated by excluding self from the pulled-toward centroid; covered by test #4.
- **Tug-of-war collapse** (medium) — too-high strength + shared nodes can drag distinct centroids together, _increasing_ overlap. Mitigate with `1/groupCount` scaling, `strength ≤ 0.12`, and leaning on collide/charge. Note the **direct tension**: honest multi-membership placement (shared node between hulls) and maximally-clean hulls are partly opposed — this is a product call (Q-overlap), not just tuning.
- **Global drift** (medium) — many same-direction nudges can translate the whole composition. Mitigate with an optional post-settle re-center (translate so overall centroid matches pre-sim) or an anchor node; the store clamp prevents off-canvas regardless.
- **CPU during settle** (medium) — a live worker sim + the hull rAF loop + the edge rAF loop run concurrently during the settle window and on every re-seed (preset switch / node change). Narrative pays none of this today. Keep the window short (low-alpha schedule), stop the sim on `'end'`, and ensure preset switching tears down/re-seeds cleanly rather than stacking workers.

---

## 11. Open questions for the user (resolve before implementation)

1. **(Blocking) Drag & keyboard persistence.** Wiring the ephemeral sim makes **both** pointer drag (`useCanvasDrag.ts:109–110`) **and** keyboard arrow-nudge (`:173–174`) fire `handleNodeDragEnd` → `updateNode` (`Narrative.tsx:179–192`, which is **not** gated by `allowRepositioning`). Decide: is Narrative read-only **including** user gestures? If yes, pass `onNodeDragEnd={undefined}` so no gesture writes attributes. If user-initiated saves should survive, keep it and accept the mixed ephemeral/persisted interaction. This cannot be deferred — the feature's own drag-wiring forces the question.
2. **(Recommended: yes)** Should out-of-codebook categorical values get the same cohesion as codebook options? The force mirrors the hulls (value-keyed, codebook-independent). Confirm researchers don't want codebook-only.
3. **(Recommended: cohesion-only)** When `edges.display` is set, should real-edge `forceLink` run alongside cohesion (they may fight) or cohesion-only? Default cohesion-only; revisit if edge-aware layout is wanted.
4. **Strength / anchor tuning** — how far may the authored layout move? Needs empirical tuning on a real multi-membership interview network; tied to the clean-hulls-vs-honest-placement tension in Q-overlap below.
5. **(Recommended: `groupVariable`)** Confirm cohesion keys on `currentPreset.groupVariable` (stable) rather than the display-gated `convexHullVariable`. This means **cohesion still moves the layout while hulls are toggled off, with no visual cue.** Accept that, or gate cohesion on the same condition as the hull so what's drawn always matches what's pulled.
6. **Lifecycle** — run-once-and-freeze per preset visit (recommended) vs continuous re-runs. Confirm one-shot is acceptable given the preset switcher and the existing `isFrozen` drawing concept.
7. **(Q-overlap)** Clean hulls vs honest multi-membership: a shared node placed truthfully between hulls _enlarges_ their overlap, opposing the "less overlap" goal. Confirm the preferred trade-off (honest placement, or bias shared nodes toward their larger group / cap their displacement).

---

**Verified against code this pass:** `Narrative.tsx` (`simulation={null}` L243, `syncFromNodes` L174–176, `handleNodeDragEnd` **ungated** L179–192, `convexHullVariable` display-gating L146–148, `nodesWithLayout` L155–161); `forceSimulation.worker.ts` (`DEFAULT_OPTIONS` L14–21, `initialize`→`alpha(0).stop()` L129, `'start'`→`alpha(1).restart()` L163, `'stop'`→`postMessage('end')` L156, `update_node` rebuild L210–218); `useCanvasDrag.ts` (pointer `onDragEnd` L109–110, keyboard `onDragEnd` L173–174, `moveNode` L85); `.storybook/preview.tsx` (`isChromatic` disables animations only, L86–91). Key files: `/Users/jmh629/Projects/network-canvas/.claude/worktrees/flamboyant-curie-d57d83/packages/interview/src/interfaces/Narrative/Narrative.tsx`, `…/Narrative/ConvexHullLayer.tsx`, `…/canvas/useCanvasStore.ts`, `…/canvas/useCanvasDrag.ts`, `…/Sociogram/forceSimulation.worker.ts`, `…/Sociogram/useForceSimulation.ts`, `…/.storybook/preview.tsx`, `…/.storybook/StoryInterviewShell.tsx`.
