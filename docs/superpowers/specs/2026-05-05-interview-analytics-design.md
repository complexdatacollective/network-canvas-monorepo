# Interview package: built-in analytics & user-centric tracing

**Date:** 2026-05-05
**Status:** Design
**Owner:** Interview package
**Affects:** `@codaco/interview`, `@codaco/protocol-validation`, `fresco-next` (consumer)

## 1. Problem

Today the `@codaco/interview` package exposes an optional `onError` prop so a host can route internal errors into its own telemetry. No host currently supplies it; the prop defaults to no-op and errors are silently swallowed (the package's `StageErrorBoundary` shows a fallback UI but the host has no signal).

This is too thin a contract for the questions we now want to answer:

- _Where do participants get stuck?_ (per-interface time, per-sub-task friction)
- _What proportion of interviews abandon at each stage?_
- _Are bottlenecks structural to the protocol, or specific to the participant's host environment / device?_
- _Are errors happening that nobody is seeing?_

The interview package should own its own analytics — instrumented from the inside, with stable event names, PII-safe property shapes, and host-supplied environment metadata threaded through every event.

## 2. Goals

- Replace the unused `onError` prop with built-in PostHog-based analytics.
- Instrument **all 17 interfaces** with a small, opinionated event vocabulary in this single change (not a framework with empty per-interface follow-ups).
- Capture **stage-level user-centric tracing**: time on each interface, navigation direction, validation friction.
- Capture **per-interface sub-tasks** that surface the bottlenecks unique to each interaction style.
- Strict PII guarantee: no interview-network data, no protocol-author-authored content, ever.
- Work in three host scenarios: (a) Fresco-next provides its own PostHog client, (b) embedded in arbitrary web pages where the host has no PostHog, (c) wrapped by native apps in a webview.
- Coexist gracefully with multiple `posthog-js` instances on the same page.

## 3. Non-goals

- Identification of participants. The package never calls `identify()` and uses the interview id as `distinct_id` per-event.
- Server-side analytics from the interview package. Sync errors and finish-flow telemetry stay browser-side; server-side hosts handle their own.
- Replacing host-level analytics. Hosts may run their own PostHog instance for their own events; the package coexists.
- A general-purpose analytics primitive for non-interview code. The exported `useTrack` hook is package-internal.

## 4. Architecture

```
                  ┌─────────────────────────────────────────────┐
                  │                  Shell                      │
                  │                                             │
  Host props ──→  │  analytics: InterviewAnalyticsMetadata      │
                  │  posthogClient?: PostHog                    │
                  │  disableAnalytics?: boolean   (default false)│
                  └────────────┬────────────────────────────────┘
                               │
                               ▼
                ┌─────────────────────────────────────┐
                │     AnalyticsProvider               │
                │  ───────────────────────────────────│
                │  resolveClient():                   │
                │    if disableAnalytics → null       │
                │    else if posthogClient → use it   │
                │      (no init/register/identify)    │
                │    else → dynamic import('posthog-  │
                │      js') and init named instance   │
                │      '@codaco/interview' against    │
                │      ph-relay.networkcanvas.com     │
                │                                     │
                │  super properties (own instance):   │
                │    app, installation_id,            │
                │    host_version?, package_version,  │
                │    protocol_hash, stage_type,       │
                │    stage_index, prompt_index        │
                │  (host instance: merged per-event)  │
                │                                     │
                │  track(name, props):                │
                │    client?.capture(name, {          │
                │      ...props,                      │
                │      distinct_id: payload.session.id│
                │    })                               │
                └────────────┬────────────────────────┘
                             │
        ┌────────────────────┴───────────────────────┐
        ▼                                            ▼
┌───────────────────────┐            ┌──────────────────────────┐
│ Redux listener        │            │ useTrack(name, props)    │
│ middleware            │            │ hook                     │
│ ─────────────────────│            │ ─────────────────────────│
│ store/middleware/     │            │ Components emit UI-only  │
│ analyticsListener.ts  │            │ sub-task events directly │
│                       │            │ (selection, drag-end,    │
│ Subscribes to actions │            │ form open/close, etc.)   │
│ → translates to       │            │                          │
│ analytics events for  │            │                          │
│ state-driven flows.   │            │                          │
└───────────────────────┘            └──────────────────────────┘
```

### 4.1 Client-resolution decision table

| `disableAnalytics` | `posthogClient` | Behaviour                                                                                                                                                                                               |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true`             | (any)           | Listener middleware **not added** to store. `useTrack` returns no-op. `posthog-js` not imported.                                                                                                        |
| `false`            | provided        | Use the host client. **Never** call `init`, `register`, `identify`, or `opt_out_capturing` on it. Each `capture()` includes `distinct_id` override and merges super-props as event-props.               |
| `false`            | absent          | Lazy-import `posthog-js`, call `posthog.init(KEY, opts, '@codaco/interview')` to create a named instance. `register()` super-props once. Subsequent `capture()` calls per-event-override `distinct_id`. |

Resolution runs once per `Shell` mount and the result is cached for the lifetime of the mount.

### 4.2 Why per-event `distinct_id` override

Fresco-next today calls `posthog.identify(installationId)` on its own instance. If the package shared that instance and called `capture()` without an override, every interview event would be associated with the _installation_ PostHog person, lumping all interviews on the install together.

By passing `distinct_id: payload.session.id` per-event, every interview becomes its own PostHog "person." Funnel analysis per interview works naturally; the host's installation-keyed events remain unaffected.

This applies equally to the package's own named instance (we never call `identify()` there either — distinct_id is set per-event).

## 5. Public API

### 5.1 `Shell` props

```ts
type ShellProps = {
  // ...existing props (payload, onSync, onFinish, onRequestAsset, currentStep, onStepChange, flags)

  /**
   * Host-supplied analytics metadata. Required fields are sent on every event.
   * Strict typed schema — no extension bucket.
   */
  analytics: InterviewAnalyticsMetadata;

  /**
   * Optional pre-initialised PostHog client. When provided, the package emits
   * events through it without modifying its config. When absent, the package
   * lazy-initialises its own named instance against ph-relay.
   */
  posthogClient?: PostHog; // imported as `import type { PostHog } from 'posthog-js'`

  /**
   * When true, suppresses all event emission. The package never imports
   * posthog-js and the listener middleware is not added to the store.
   * Defaults to false.
   */
  disableAnalytics?: boolean;
};
```

### 5.2 Removed from `Shell`

```ts
- onError?: ErrorHandler;          // gone — replaced by internal captureException
```

### 5.3 New types exported from `@codaco/interview`

```ts
export type InterviewAnalyticsMetadata = {
  installationId: string; // → super prop "installation_id"
  hostApp: string; // → super prop "app"
  hostVersion?: string; // → super prop "host_version"
};
```

### 5.4 Removed types

```ts
- export type ErrorHandler = ...;
```

### 5.5 New exported hook

```ts
// Returns a track function that no-ops when disableAnalytics is true.
export function useTrack(): (
  eventName: string,
  props?: Record<string, JSONValue>,
) => void;
```

### 5.6 `ProtocolPayload` shape change

```ts
export type ProtocolPayload = Omit<CurrentProtocol, 'assetManifest'> & {
  id: string;
  hash: string; // ← NEW. Required. Computed by host using `hashProtocol`
  //   from @codaco/protocol-validation at protocol-import time.
  importedAt: string;
  assets: ResolvedAsset[];
};
```

### 5.7 `@codaco/protocol-validation` addition

```ts
/**
 * Computes the dedup hash for a protocol from its structural definition only
 * (codebook + stages). Metadata fields — name, description, lastModified,
 * assetManifest, experiments — are excluded so two protocols with the same
 * interview structure produce the same hash regardless of cosmetic differences.
 *
 * Single source of truth for protocol hashing across:
 *   - Fresco-next protocol import (duplicate detection)
 *   - Fresco-next v7→v8 migration script
 *   - Interview package analytics (forwarded as protocol_hash super property)
 *   - Network-exporters (already reads protocol.hash from caller)
 */
export function hashProtocol(protocol: {
  codebook: unknown;
  stages: unknown;
}): string;
```

Implementation moves from `~/Projects/fresco-next/lib/protocol/hashProtocol.ts` (deleted) to `packages/protocol-validation/src/hashProtocol.ts`. All callers import from `@codaco/protocol-validation`.

### 5.8 Dependency shape

`packages/interview/package.json`:

```jsonc
{
  "dependencies": {
    "posthog-js": "catalog:",
    // ...existing
  },
}
```

`posthog-js` is a regular dependency, not a peer. The package's default mode requires it; making it a peer would force every host to install it for the package's default behaviour to work.

The `posthogClient?: PostHog` prop type uses `import type { PostHog } from 'posthog-js'`, which is fine because the type lives in the dependency. Hosts that supply their own client declare their own `posthog-js` dep at the host level; bundlers dedupe via the catalog version.

## 6. Configuration constants

Embedded in the package, not host-supplied:

```ts
const POSTHOG_API_KEY = 'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c'; // public, shared with architect/docs
const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com'; // codaco proxy worker
const INSTANCE_NAME = '@codaco/interview'; // for posthog.init named instance
```

The API key is public PostHog project-key data; it is not a secret. The host is the codaco-managed posthog-proxy worker.

## 7. Super properties

Set on the package's named instance via `register()` once after init. When using a host-supplied client, these are **merged into every `capture()` call as event properties** instead of registered (we never mutate the host's instance).

| Property          | Source                                    | Required | Notes                                                            |
| ----------------- | ----------------------------------------- | -------- | ---------------------------------------------------------------- |
| `app`             | `analytics.hostApp`                       | yes      | e.g. `"Fresco"`, `"researcher-desktop"`                          |
| `installation_id` | `analytics.installationId`                | yes      | Anonymous host installation UUID                                 |
| `host_version`    | `analytics.hostVersion`                   | optional | Host app version                                                 |
| `package_version` | build-time injected `__PACKAGE_VERSION__` | yes      | Interview package version, from `package.json` via Vite `define` |
| `protocol_hash`   | `payload.protocol.hash`                   | yes      | Forwarded from host; never recomputed inside the package         |
| `stage_type`      | navigation state                          | yes      | Updated on stage transition                                      |
| `stage_index`     | navigation state                          | yes      | Updated on stage transition                                      |
| `prompt_index`    | navigation state                          | yes      | Updated on prompt transition                                     |
| `distinct_id`     | `payload.session.id`                      | yes      | **Per-event override**, not a super property                     |

Note: `is_e2e` and `is_synthetic` are **not** super properties. Hosts pass `disableAnalytics={true}` for E2E and synthetic runs.

## 8. PII contract

The package guarantees, by construction, that the following **never** appear in event names or property values:

- Anything from `state.session.network` (nodes, edges, ego, attributes, layouts, coordinates).
- Protocol-author-defined strings: stage labels, prompt text, codebook variable names, codebook variable labels, codebook category labels, asset names, protocol name, protocol description.
- Any value from a participant's input: form field values, free-text, alter labels, search queries, filter text, passphrases.

What **is** allowed:

- **Structural identifiers**: `stage_type` (interface kind), `stage_index`, `prompt_index`, `node_id`, `edge_id` (random UUIDs generated at creation time, no derivation from participant input).
- **Codebook _internal_ ids**: `node_type`, `edge_type`, `relation_type` — these are stable codes (`person`, `friend`, `parent`), not author-facing labels. Protocol-author-authored _labels_ and _colours_ never flow.
- **Counts and durations**: `node_count`, `edge_count`, `field_count`, `duration_ms`, `total_slides`.
- **Discriminators**: `form_kind`, `selection_kind`, `direction`, `census_kind`, `add_path`, etc. — these are package-defined constants.
- **Validation kinds and structural rule params**: `kind: 'minLength'`, `config: { minLength: 5 }` — never the rendered error message (which could include protocol-author content) and never variable-name-bearing rule params (`differentFrom: 'name'`).

### 8.1 PII guard test

`analytics/__tests__/pii-guard.test.ts` walks a synthetic protocol containing recognisable sentinel strings (`"CODEBOOK_LABEL_TRIGGER"`, etc.) through both the listener middleware and `useTrack` emitters, asserting that no emitted property value contains any of those sentinels. This catches accidental leaks introduced during refactors.

## 9. Event taxonomy

Events fall into three tiers: **stage-level chassis** (apply to every interface), **global entity events** (fire from generic Redux actions regardless of which stage dispatched them), and **per-interface events**.

Property `node_id`/`edge_id` (and `node_a_id`/`node_b_id` for paired events) appear on every entity-scoped event, by general rule, to allow per-entity behavioural reconstruction.

### 9.1 Stage-level events

| Event                     | Source                           | Extra props                                                                                            |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `interview_started`       | middleware (Shell mount)         | —                                                                                                      |
| `stage_entered`           | middleware (currentStep change)  | `stage_type`, `stage_index`, `prompt_index`, `direction: 'forward' \| 'back' \| 'jumped' \| 'initial'` |
| `stage_exited`            | middleware                       | `stage_type`, `stage_index`, `duration_ms`, `prompt_count`, `exit_direction`                           |
| `stage_validation_failed` | hook (Navigation `beforeNext`)   | `stage_type`, `stage_index`, `validation_kind`                                                         |
| `interview_finished`      | middleware (`onFinish` resolves) | `total_duration_ms`, `stage_count`                                                                     |

### 9.2 Global entity events

Fire from Redux middleware on the underlying actions, regardless of which stage dispatched them. `stage_type` super-prop discriminates which interface triggered the event in PostHog queries.

| Event                      | Source                                        | Extra props            |
| -------------------------- | --------------------------------------------- | ---------------------- |
| `node_added`               | middleware (`addNode` fulfilled)              | `node_id`, `node_type` |
| `node_removed`             | middleware (`deleteNode`)                     | `node_id`, `node_type` |
| `node_added_to_prompt`     | middleware (`addNodeToPrompt` fulfilled)      | `node_id`, `node_type` |
| `node_removed_from_prompt` | middleware (`removeNodeFromPrompt` fulfilled) | `node_id`, `node_type` |
| `edge_created`             | middleware (`addEdge` fulfilled)              | `edge_id`, `edge_type` |
| `edge_removed`             | middleware (`deleteEdge`)                     | `edge_id`, `edge_type` |

### 9.3 Per-interface events

#### Form family (AlterForm, AlterEdgeForm, EgoForm, SlidesForm)

| Event                         | Source                                                           | Extra props                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `form_opened`                 | hook                                                             | `form_kind: 'alter' \| 'alter_edge' \| 'ego' \| 'slides'`, `field_details: string[]` (component names in order, duplicates preserved), `entity_id?` (node_id when alter, edge_id when alter_edge, omitted for ego/slides) |
| `form_submitted`              | middleware (`updateEgo` / `updateNode` / `updateEdge` fulfilled) | `form_kind`, `entity_id?`                                                                                                                                                                                                 |
| `form_dismissed_without_save` | hook                                                             | `form_kind`, `entity_id?`                                                                                                                                                                                                 |
| `form_validation_failed`      | hook                                                             | `form_kind`, `entity_id?`, `field_errors: Array<{ field_index: number; component: string; kind: string; config?: Record<string, number \| boolean> }>`                                                                    |
| `slides_form_slide_advanced`  | hook (SlidesForm only)                                           | `slide_index`, `total_slides`                                                                                                                                                                                             |

`field_errors[].config` carries only numeric/boolean rule params; entries that reference codebook variable names (`differentFrom: 'name'`, etc.) are filtered out before emission.

#### NameGenerator

| Event                              | Source | Extra props                                                      |
| ---------------------------------- | ------ | ---------------------------------------------------------------- |
| `node_form_opened`                 | hook   | `node_id?` (omitted when the form is for a not-yet-created node) |
| `node_form_dismissed_without_save` | hook   | `node_id?`                                                       |

(`node_added` and `node_added_to_prompt` fire from the global tier on each NameGenerator add, joinable by `node_id`.)

#### NameGeneratorRoster

| Event                   | Source                                  | Extra props           |
| ----------------------- | --------------------------------------- | --------------------- |
| `roster_loaded`         | hook (after `useExternalData` resolves) | `entry_count`         |
| `roster_filter_changed` | hook (debounced ~500ms)                 | `has_filter: boolean` |

(`node_added_to_prompt` / `node_removed_from_prompt` cover the add/remove half from the global tier. No filter text ever sent.)

#### Sociogram

| Event                     | Source                                        | Extra props                               |
| ------------------------- | --------------------------------------------- | ----------------------------------------- |
| `node_initial_positioned` | hook (drag-end, manual layout only)           | `node_id`                                 |
| `node_repositioned`       | hook (debounced drag-end, manual layout only) | `node_id`                                 |
| `node_selected`           | hook (attribute-selection mode only)          | `node_id`                                 |
| `node_deselected`         | hook (attribute-selection mode only)          | `node_id`                                 |
| `simulation_started`      | hook (force-sim begin)                        | `node_count`, `edge_count`                |
| `simulation_finished`     | hook (sim convergence)                        | `duration_ms`, `node_count`, `edge_count` |

`node_initial_positioned` and `node_repositioned` are suppressed entirely when automatic layout is enabled. Component-side state distinguishes "first placement" from "subsequent moves" — a node with no recorded position fires `node_initial_positioned` on first drag-end, `node_repositioned` thereafter.

#### Comparison family (DyadCensus, TieStrengthCensus, OneToManyDyadCensus)

| Event        | Source                                                         | Extra props              |
| ------------ | -------------------------------------------------------------- | ------------------------ |
| `pair_shown` | hook (DyadCensus, TieStrengthCensus — on each new pair render) | `node_a_id`, `node_b_id` |
| `focal_node` | hook (OneToManyDyadCensus — on each new focal node)            | `node_id`                |

(`edge_created` / `edge_removed` from the global tier carry the answers.)

#### CategoricalBin & OrdinalBin

| Event           | Source                                           | Extra props                                              |
| --------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `node_binned`   | hook (first time the node lands in any bin/rank) | `node_id`, `node_type`, `bin_index`                      |
| `node_rebinned` | hook (moved between bins)                        | `node_id`, `node_type`, `from_bin_index`, `to_bin_index` |
| `bin_expanded`  | hook (CategoricalBin only)                       | `bin_index`                                              |
| `bin_collapsed` | hook (CategoricalBin only)                       | `bin_index`                                              |

`bin_index` is numeric; bin labels never sent. There is no `node_unbinned` (the UI does not support full unbinning).

#### Narrative

| Event                      | Source                           | Extra props                                                      |
| -------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `narrative_preset_changed` | hook (PresetSwitcher)            | `preset_index`, `direction: 'forward' \| 'back' \| 'jumped'`     |
| `narrative_preset_updated` | hook                             | `preset_index`, `changed: 'group' \| 'edge_type' \| 'highlight'` |
| `annotation_drawn`         | hook (stroke completion)         | —                                                                |
| `annotations_reset`        | hook (DrawingControls `onReset`) | —                                                                |

`preset_index` is numeric. `changed` carries the _kind_ of property change, never the codebook variable id.

#### FamilyPedigree

| Event                       | Source                                                             | Extra props                      |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| `pedigree_relative_added`   | hook (manual additions only — wizard-triggered additions excluded) | `node_id`, `relation_type`       |
| `pedigree_relative_removed` | hook                                                               | `node_id`, `relation_type`       |
| `pedigree_wizard_shown`     | hook (wizard action-button click)                                  | —                                |
| `pedigree_wizard_complete`  | hook (wizard completion)                                           | `nodes_created`, `edges_created` |
| `pedigree_wizard_abandoned` | hook (wizard dismissed without completion)                         | —                                |

Wizard suppression scope is **only** the interface-specific `pedigree_relative_added` event. Global `node_added` / `edge_created` events still fire (one per entity) as the wizard creates them.

#### Anonymisation

| Event                          | Source                              | Extra props |
| ------------------------------ | ----------------------------------- | ----------- |
| `passphrase_set`               | middleware (`setPassphrase`)        | —           |
| `passphrase_validation_failed` | middleware (`setPassphraseInvalid`) | —           |

Absolutely no values: not the passphrase, not its length, not a hash of it, not a hint, not the validation kind.

#### Geospatial

| Event                          | Source                           | Extra props                                    |
| ------------------------------ | -------------------------------- | ---------------------------------------------- |
| `geospatial_location_selected` | hook (Mapbox selection callback) | `node_id`, `selection_kind: 'search' \| 'pin'` |
| `geospatial_search_performed`  | hook (debounced ~500ms)          | `node_id`                                      |

No coordinates, no place names, no search query text.

#### Information

No interface-specific events. Stage-level `stage_entered` → `stage_exited` durations are sufficient.

**Wiring task**: `Information.tsx`'s `VideoPlayer` `onError` handler (line 79) is wired to `posthog.captureException(error, { feature: 'information-media' })` for parity with `useExternalData`'s asset-fetch error path.

### 9.4 Naming conventions

- Event names: `snake_case`, lowercase, no app/package prefix (super property `app` already disambiguates).
- Property keys: `snake_case`.
- Boolean flags prefixed with `is_` / `has_` / `should_`.
- Counts use `_count` suffix (`stage_count`, `node_count`).
- Durations use `_ms` suffix (`duration_ms`, `total_duration_ms`).

## 10. Error reporting

`onError` is fully removed. Errors fire `posthog.captureException` from inside the package, with the same `distinct_id: payload.session.id` override applied:

| Site                                      | Replacement                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StageErrorBoundary.componentDidCatch`    | `captureException(error, { component_stack, stage_type, stage_index })`. UI fallback unchanged.                                                      |
| `useExternalData` catch block             | `captureException(error, { feature: 'external-data' })`. No `dataSource` value (would expose protocol asset id). Component-level error UI unchanged. |
| `Information.tsx` `VideoPlayer` `onError` | `captureException(error, { feature: 'information-media' })`. UI fallback unchanged.                                                                  |

Error events are not subject to PII filtering of error messages — exception strings are typically engine-generated and considered acceptable for debugging. If we later identify a leak vector (e.g. validation error messages embedded in thrown errors that include codebook content), we sanitise at that emit site.

## 11. Code organisation

### 11.1 New files in `packages/interview/src/`

```
analytics/
  AnalyticsProvider.tsx     // resolves client, registers super props, exposes track()
  resolveClient.ts          // dynamic-import + named-instance init OR pass-through
  useTrack.ts               // hook for component-side emission
  superProperties.ts        // computes super-props from metadata + payload
  errorReporter.ts          // wraps captureException with distinct_id override
  PROPERTY_KEYS.ts          // single source of truth for super-prop / event-prop key names
  __tests__/
    resolveClient.test.ts
    superProperties.test.ts
    pii-guard.test.ts

store/middleware/
  analyticsListener.ts      // Redux listener middleware
  __tests__/
    analyticsListener.test.ts
```

### 11.2 Modified files in `packages/interview/`

```
src/Shell.tsx                              // accept analytics, posthogClient, disableAnalytics; remove onError
src/contract/types.ts                      // add hash to ProtocolPayload, remove ErrorHandler
src/contract/context.tsx                   // remove onError from ContractHandlers
src/components/StageErrorBoundary.tsx      // captureException instead of onError
src/hooks/useExternalData.tsx              // captureException instead of onError
src/interfaces/Information/Information.tsx // wire VideoPlayer onError to captureException
src/interfaces/**                          // emit per-interface events via useTrack hook
src/store/store.ts                         // factory accepts analytics emit fn; conditionally adds listener
package.json                               // add posthog-js dependency
vite.config.ts                             // define __PACKAGE_VERSION__ from package.json
README.md                                  // remove onError row; add analytics, posthogClient, disableAnalytics rows
                                           // add Analytics section (PII contract, taxonomy summary, metadata schema)
```

### 11.3 Modified files outside `packages/interview/`

```
packages/protocol-validation/src/hashProtocol.ts       // NEW: ported from fresco-next, exported
~/Projects/fresco-next/lib/protocol/hashProtocol.ts    // DELETE
~/Projects/fresco-next/hooks/useProtocolImport.tsx     // import hashProtocol from @codaco/protocol-validation
~/Projects/fresco-next/scripts/migrate-protocols-to-v8.ts // same
~/Projects/fresco-next/app/(interview)/interview/[interviewId]/InterviewClient.tsx    // pass new Shell props
~/Projects/fresco-next/app/(interview)/interview/[interviewId]/mapInterviewPayload.ts // populate payload.protocol.hash
~/Projects/fresco-next/app/(interview)/preview/[protocolId]/interview/page.tsx        // same
```

### 11.4 Build-time `package_version` injection

`vite.config.ts`:

```ts
import pkg from './package.json';

export default defineConfig({
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  // ...
});
```

Code references `__PACKAGE_VERSION__` directly (declared as a global in the package's ambient typings). No runtime `import.meta` lookup or fs read.

## 12. Testing strategy

### 12.1 Unit tests (Vitest)

| File                                                   | Asserts                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics/__tests__/resolveClient.test.ts`            | All four resolution paths: disabled, host-supplied, own-init, error during dynamic import.                                                               |
| `analytics/__tests__/superProperties.test.ts`          | Given metadata + payload, exact super-prop object shape.                                                                                                 |
| `store/middleware/__tests__/analyticsListener.test.ts` | For each Redux action that triggers an event, dispatching it produces exactly the documented `(eventName, propsObject)`. One assertion per global event. |
| `analytics/__tests__/pii-guard.test.ts`                | Walks a synthetic protocol with sentinel strings through emitters, asserts no sentinel appears in any emitted property value.                            |

### 12.2 Integration tests (Vitest + RTL)

`Shell.test.tsx` covers three permutations:

1. `disableAnalytics={true}` → no `posthog-js` import attempted, no events emitted.
2. `posthogClient` provided → events go to provided client. `capture()` called with `distinct_id: payload.session.id` override. No `init`/`register`/`identify` called on the supplied client.
3. Neither → own-instance path runs `posthog.init(KEY, opts, '@codaco/interview')`, registers super-props once, fires events through the named instance.

### 12.3 Storybook

Each new event-emitting code path gains a story that triggers the event under controlled conditions, with a `disableAnalytics` story arg toggling emission for visual debugging.

### 12.4 E2E

Existing Playwright runs continue with `disableAnalytics={true}` (passed via test fixture). No analytics traffic from E2E. Plumbing one prop is the only fixture change.

## 13. Migration & rollout

### 13.1 Order of merges

1. **`@codaco/protocol-validation`**: add `hashProtocol` export. Backward-compatible — additive.
2. **`@codaco/interview`**: implement everything in this spec. Breaking: `onError` removed, `analytics` prop required, `ProtocolPayload.hash` required.
3. **`fresco-next`**: in one PR — (a) delete `lib/protocol/hashProtocol.ts`, swap imports to `@codaco/protocol-validation`; (b) populate `payload.protocol.hash` in `mapInterviewPayload.ts`; (c) supply `analytics` metadata at `Shell` mount; (d) supply or omit `posthogClient`; (e) wire `disableAnalytics` from app settings.
4. **Migration script** (`scripts/migrate-protocols-to-v8.ts`): swap import to `@codaco/protocol-validation`. Run only after step 1 ships.

### 13.2 Versioning

- `@codaco/interview`: minor bump (currently `1.0.0-alpha.0` so still pre-1.0). CHANGELOG entry documents: removed `onError`, added required `analytics` and `payload.protocol.hash`, added `posthogClient` and `disableAnalytics` props.
- `@codaco/protocol-validation`: minor bump. Additive `hashProtocol` export.

### 13.3 Documentation

- `packages/interview/README.md` — Shell-props table updated; new "Analytics" section explaining the PII contract, event-taxonomy summary, and metadata schema.
- Top-level `CLAUDE.md` reference to non-existent `@codaco/analytics` package removed (separate cleanup).

## 14. Open questions / future work

The following are deliberately out of scope for this spec:

- **Funnel-builder helpers**: a way for analysts to define common funnels in code (e.g., `interview_started → first_node_added → interview_finished`). Punted to PostHog dashboard configuration.
- **Server-side analytics**: errors during server-side `onSync` or `onFinish` route through host-side logging today. Server-side telemetry is the host's concern, not the package's.
- **Adaptive sampling**: every event fires today. If volume becomes a problem (likely from `node_repositioned` or comparison answers), evaluate sampling at the listener level. Not needed at launch.
- **Per-host PostHog projects**: hosts share the codaco PostHog project. If a host wants a separate project (e.g., for a sensitive deployment), the `posthogClient` prop already supports it; no package change needed.
- **`extra` metadata bucket**: current schema is strict typed. If we discover a host needs a field we haven't anticipated, a minor package release adds the typed field.
