# Dynamic rosters — endpoint-resolved network assets

**Date:** 2026-08-25
**Status:** Design — awaiting review
**Packages / Apps:** `@codaco/protocol-validation`, `@codaco/interview`, `@codaco/shared-consts`, Architect, Interviewer, Fresco, Documentation

Precursor to the Studio longitudinal work: instead of bundling a roster file at
authoring time, a researcher configures an endpoint that is called at interview
time and returns the roster as JSON. Design decisions below were resolved in a
design interview with Josh on 2026-08-25.

## 1. Problem

A roster today is a static file (`type: 'network'` asset, CSV or JSON) frozen
into the `.netcanvas` at authoring time. Studies that recruit continuously, or
that want a participant's roster to reflect data collected elsewhere (a prior
wave, an institutional directory, another instrument), have no way to supply
roster data at interview time. The only workaround is exporting data from one
system and re-importing it as a static file before every interview.

There is no precedent in the protocol for a researcher-supplied URL: every
external resource is an asset reference, the apps' CSP `connect-src` lists are
closed allowlists (Architect `vite.config.ts:24-38`, Interviewer
`vite.renderer.config.ts:66-82`), and the runtime's roster fetch
(`packages/interview/src/utils/loadExternalData.ts`) has no `response.ok`
check, timeout, or size limit because its URL is always a locally-minted blob
URL. All of that must change deliberately, not incidentally.

## 2. Goals

- A researcher can define, in Architect's Resource Library, a roster that is
  resolved at interview time by a GET or POST request to an endpoint they
  control.
- Interview data — the current network, interview metadata — can be embedded
  in the request via placeholders the researcher edits in Architect.
- The feature works identically in Interviewer, Fresco, and Architect preview,
  from the participant's browser, with no new server infrastructure.
- Roster stages and name-generator panels can consume the new asset wherever
  they consume a static network asset today.
- A protocol using a dynamic roster is surfaced as requiring internet, with
  the same warn-but-allow posture as Geospatial.

## 3. Out of scope

- **Longitudinal identity linking.** Dynamic rosters are transport; matching
  entities across waves is Studio's concern (issue #1242 tree). Nothing here
  creates or depends on cross-wave identifiers.
- **Geospatial `dataSourceAssetId`.** The map-layer path renders via
  `useAssetUrl`, not the roster pipeline; extending it is real separate work
  and no use case asked for it.
- **Edges and ego in responses.** The response contract is nodes-only, exactly
  as the static JSON roster format behaves today (edges are ignored).
- **Response mapping/ETL.** No JSONPath-style extraction of arbitrary API
  shapes. Endpoints must return the canonical shape; anyone wrapping an
  existing API writes a shim, which they typically need for auth and
  filtering anyway.
- **Caching or offline fallback of responses.** Follows the Mapbox
  `NetworkOnly` decision (Interviewer `vite.config.ts:233-242`): never serve
  stale third-party data.

## 4. Decisions

Each decision records the alternative it displaced and why.

1. **New asset type, `dynamicnetwork`.** Rejected extending `network` to be
   source-or-request: every consumer that assumes a network asset has a
   `source` file (Architect column readers, preview roster collectors, the
   bundler, both importers) would need a branch, and a missed one fails
   silently. A new discriminated-union member fails safe — nothing treats it
   as a file until explicitly taught to. Rejected stage-level config: loses
   reuse across stages and the Resource Library home.
2. **Fetched on each stage entry; never cached.** Rejected fetch-once-per-
   session: it makes embedding the _current_ network in the request
   meaningless. The endpoint sees the network as it stands when the
   participant reaches the stage.
3. **Content-hash node identity, without the index salt.** Rejected requiring
   a stable external ID in the response (kept the pipeline identical to
   static files instead; cross-wave identity is out of scope). Because the
   asset is refetched and servers may reorder rows, the existing
   content-plus-index hash would change every row's identity on reorder, so
   dynamic rosters hash row content only. Consequence, accepted: two
   byte-identical rows in one response collapse into one roster entry.
4. **Requests leave the participant's browser directly, on every host.**
   Rejected a Fresco server-side proxy (divergent per-host behaviour plus an
   SSRF surface to defend) and a shared proxy worker (routes participant data
   through project infrastructure, against the offline-first privacy
   posture). Consequences, accepted: endpoints must serve CORS, and the PWAs'
   CSP `connect-src` must be relaxed from a host allowlist to a scheme
   allowlist (§6).
5. **Request payload uses variable _names_, not codebook UUIDs.** The network
   is serialized export-style so endpoint authors see meaningful fields.
6. **Auth is a custom-header list.** Header values are inline strings or
   references to existing `apikey` assets. Rejected a single hard-wired
   bearer header (locks out `X-Api-Key`-style endpoints) and no-auth (pushes
   secrets into URLs).
7. **Authoring-time data comes from a stored sample response.** Architect's
   "Send test request" performs the real request and stores the response in
   the protocol as the asset's `source` file. Column pickers, Preview, and
   synthetic generation read the sample; none of them ever contact the
   endpoint. Rejected live-fetch-everywhere (Architect and CI become
   dependent on the endpoint being up) and manual column declaration
   (typo-prone, Preview gets nothing).
8. **Failure reuses the existing roster load-error surfaces, enhanced with
   retry.** No hard block (a dead endpoint must never strand an interview)
   and no fallback to the sample (that is authoring test data; showing it to
   a participant fabricates data).
9. **One canonical response shape** — the existing JSON roster format.
   Rejected also accepting a bare array (second parse branch) and
   configurable mapping (an ETL tool inside Architect).
10. **New protocol schema version (9).** Revised during spec review on
    2026-08-25 — the design interview had initially resolved this as an
    additive schema 8 change. Schema 8 is released and 8.0.0 apps are in the
    field, and the schema version is the compatibility contract: a protocol
    no released app can run must be legibly unsupported ("schema 9 is not
    supported") rather than failing a generic validation error inside a
    version the app claims to support. Dynamic rosters therefore define
    schema 9, with a v8→v9 migration (§5.12). Accepted consequence: a
    protocol opened and saved in the new Architect becomes schema 9 even if
    it never uses a dynamic roster, so researchers mid-study must update
    Interviewer/Fresco before re-importing edited protocols — the normal
    cost of a version bump.

## 5. Design

### 5.1 The `dynamicnetwork` asset

New member of the asset discriminated union
(`packages/protocol-validation/src/schemas/9/assets/assets.ts` — schema 9's
tree, §5.12):

```ts
const dynamicNetworkAssetSchema = baseAssetSchema.extend({
  type: z.enum(['dynamicnetwork']),
  /**
   * Stored sample response (canonical response shape, JSON), written by
   * Architect's "Send test request". Ships in the zip like any file asset;
   * it is the data source for column pickers, Preview, and synthetic
   * generation, and is never used during a real interview.
   */
  source: assetSourceSchema,
  request: z.strictObject({
    /**
     * Template string. The origin (scheme://host[:port]) must be literal —
     * placeholders may appear only in the path and query. https:// only,
     * with http://localhost and http://127.0.0.1 permitted for development.
     */
    url: z.string().min(1),
    method: z.enum(['GET', 'POST']),
    /** Static values only — no placeholders in headers. */
    headers: z
      .array(
        z.union([
          z.strictObject({ name: headerNameSchema, value: z.string().min(1) }),
          z.strictObject({ name: headerNameSchema, valueAssetId: assetReference() }),
        ]),
      )
      .optional(),
    /**
     * POST only. A JSON document in which placeholders appear inside string
     * values. Must itself parse as JSON.
     */
    body: z.string().optional(),
  }),
});
```

`source` is **required**: a dynamic roster asset is not valid until a test
request has succeeded once. This is the guarantee that makes every authoring
surface (columns, Preview, synthetic, CI) deterministic and offline.

Because `source` is a real file in `assets/`, the whole existing file-asset
machinery — zip extraction (`extractProtocol.ts`), the export bundler's
`rewriteManifest`, Interviewer's encrypted IndexedDB storage, Fresco's object
storage upload — handles it with no special casing beyond the type switch.

The `assetReference()` tag on `valueAssetId` makes header key usage visible to
`collectAssetReferences`, so Architect's "in use" accounting and
delete-protection cover referenced `apikey` assets automatically.

### 5.2 Placeholders and substitution

Syntax is `{{dot.path}}`. The context namespace is a closed registry (constants
in `@codaco/shared-consts`, so Architect validation and the runtime cannot
drift):

| Path                                              | Value                                              |
| ------------------------------------------------- | -------------------------------------------------- |
| `network`                                         | Current interview network, serialized as §5.3      |
| `network.nodes` / `network.edges` / `network.ego` | Sub-trees of the same                              |
| `interview.id`                                    | Host's interview/session id                        |
| `interview.caseId`                                | Interviewer case ID; Fresco participant identifier |
| `interview.startedAt`                             | ISO timestamp the session started                  |
| `protocol.name`, `protocol.hash`                  | From the protocol payload                          |
| `stage.id`                                        | The stage whose roster is being fetched            |
| `now`                                             | ISO timestamp at request time                      |

Substitution rules — these are security rules, not conveniences:

- **URL:** placeholders must resolve to scalars (string/number/boolean); each
  substituted value is percent-encoded with `encodeURIComponent`. Using
  `network` (or any object-valued path) in a URL is a protocol validation
  error — an entire network does not belong in a query string.
- **Body:** the template is parsed as JSON first, and substitution happens on
  the parsed tree. A string that is exactly one placeholder (`"{{network}}"`)
  is replaced by the typed value (object, number, string). A string with
  embedded placeholders (`"wave-{{interview.caseId}}"`) gets string
  interpolation. Placeholders never concatenate into raw JSON text, so
  participant data cannot inject structure.
- **Headers:** no placeholders. Static strings or `apikey` values only, so
  the preflight-triggering header set is fully known at authoring time.
- Unknown paths are a protocol validation error (checked against the
  registry, authoring time). At runtime, a context value that is legitimately
  absent (`interview.caseId` on a host without one) substitutes as JSON
  `null` in bodies and the empty string in URLs.

### 5.3 Network serialization

`serializeNetworkForRequest(network, codebook)` (new, in
`packages/interview/src/contract/dynamicRoster.ts`) produces:

```jsonc
{
  "nodes": [{ "id": "<_uid>", "type": "Person", "attributes": { "Name": "…" } }],
  "edges": [{ "id": "<_uid>", "type": "Knows", "from": "<_uid>", "to": "<_uid>", "attributes": {} }],
  "ego": { "attributes": {} }
}
```

Attribute keys are codebook variable **names** (the reverse of the interview's
internal UUID keying); attributes with no codebook match keep their raw key
(mirroring how unmatched roster columns are stored). Entity `type` is the
codebook entity name. `id` is the internal `_uid` — stable within the session,
which is what an endpoint needs to avoid re-offering already-present nodes.

### 5.4 The request at runtime

`useExternalData` (`packages/interview/src/hooks/useExternalData.tsx`)
branches on asset type. For `dynamicnetwork` it does not call
`onRequestAsset`; instead it calls the new executor in
`packages/interview/src/contract/dynamicRoster.ts`:

1. Build the request from the template and current context.
2. `fetch(url, { method, headers, body, signal, referrerPolicy: 'no-referrer',
credentials: 'omit' })`. POST bodies are sent with
   `Content-Type: application/json` (set by the app; not overridable).
3. Enforce: 30-second timeout via `AbortSignal.timeout`; `response.ok` (a
   non-2xx status is a typed error); a 20 MB response cap (checked against
   `Content-Length` when present and enforced while reading the stream); a
   substituted URL longer than 8 KB is an error before sending.
4. Parse as JSON and validate against the canonical response schema (§5.5).
   **The runtime enforces exactly the rules the test request enforces; an
   invalid response is a fetch failure, never partially ingested.**
5. Hand the nodes to the existing parse pipeline
   (`parseExternalNetworkAsset`), with one difference: primary keys are
   `` `${subjectType}_${hash({ node })}` `` — content only, no index salt
   (Decision 3). Static-file rosters keep their existing salted hash;
   nothing changes for them.

Behavioural requirements on the endpoint, enforced socially (documented) not
mechanically: requests must be read-only/idempotent regardless of method —
POST exists to carry a body, not to mutate. A stage with two panels reading
the same dynamic asset may issue two requests.

The existing encrypted-variable passphrase gate
(`NameGeneratorRoster.tsx:164-216`) operates on parsed data and applies
unchanged.

The interview context (`interview.*` placeholders) arrives via a new optional
`Shell` prop:

```ts
export type InterviewRequestContext = {
  interviewId: string;
  caseId?: string;
  startedAt: string; // ISO
};
```

Interviewer populates it from the session record, Fresco from the interview +
participant rows (`caseId` = participant identifier), Architect preview and
Storybook with synthetic values.

### 5.5 Response contract

One canonical shape, validated by a strict Zod schema
(`dynamicNetworkResponseSchema`) that lives in
`@codaco/protocol-validation` next to `validateExternalData.ts` so Architect's
test request and the interview runtime share it:

```jsonc
{ "nodes": [{ "attributes": { "Name": "Alice", "Age": 34 } }] }
```

- `nodes` is required and must be an array (empty is valid — an empty roster
  is a true statement, not an error).
- Each element must have an `attributes` object; values must satisfy the
  existing `VariableValueSchema` rules.
- Attribute names must pass the existing `validateNames` NMTOKEN rule
  (`A-Za-z0-9._-:`), the same rule static imports enforce — otherwise GraphML
  export breaks long after the interview.
- Unknown top-level keys (including `edges`) are ignored, matching the static
  JSON roster behaviour.

Attribute-to-codebook mapping is unchanged: best-effort by name via
`getParentKeyByNameValue`, unmatched keys stored raw under
`allowUnknownAttributes`.

### 5.6 Failure handling and retry

Rule: **a failed fetch is presented where roster load errors are presented
today, and the participant is never trapped.**

- `useExternalData` keeps its four-state machine and gains a `retry()`
  re-trigger. Its error state records whether the device was offline at
  failure time (`useOnline`).
- `NameGeneratorRoster`'s existing load-failure empty state and `NodePanel`'s
  external-panel error UI both gain a Retry action, with distinct copy for
  offline ("This roster needs an internet connection…") versus server
  failure ("The roster could not be loaded. Try again in a moment."),
  following the Geospatial search precedent of never conflating "failed"
  with "empty".
- When the device regains connectivity while an offline-caused error is
  showing, the fetch retries automatically once.
- Navigation follows normal stage rules; there is no fetch-gated block.
  Errors are captured to analytics under the existing `external-data`
  feature tag.

### 5.7 "Requires internet" derivation

Rule: **one shared derivation, consumed everywhere the answer is shown.**

New helper in `@codaco/protocol-validation`:

```ts
export function protocolRequiresInternet(protocol: Pick<Protocol, 'stages' | 'assetManifest'>): boolean;
// true when any stage is Geospatial, or any referenced asset is dynamicnetwork
```

It replaces the two duplicated derivations
(`apps/interviewer/src/lib/protocol/protocolRequiresInternet.ts` and the
inline mirror in `apps/architect/src/components/ProtocolInfoCard.tsx:120-123`),
both of which become consumers. Surfaces that follow automatically: the
Architect and Interviewer "Requires Internet" pills, Interviewer's
warn-but-allow session-start dialog (`NewSessionForm.tsx:47-63`, copy
generalized from "a map stage" to name the features actually present), and the
in-interview offline banner (`GeospatialOfflineIndicator`), whose predicate
and copy are extended to cover dynamic rosters.

### 5.8 Architect authoring

- **Resource Library.** New resource type "Dynamic roster" in the
  AssetBrowser type filter and `NewAsset` flow, with a creation/edit dialog
  (pattern: `APIKeyBrowser`, larger): URL, method, header rows (name +
  inline-value-or-apikey-picker), and a body template editor shown for POST.
- **Send test request.** The dialog's test panel substitutes placeholders
  from a synthetic context (network from `generateNetwork` in
  `@codaco/protocol-utilities` against the protocol's codebook, so the
  endpoint sees realistic data), performs the real fetch, validates the
  response against the canonical schema with per-error messages, and shows
  row count and columns. Accepting the result stores the response JSON as
  the asset's sample file (`source`, generated filename `<uuid>.json`) via
  the existing asset-storage path. The asset cannot be saved without a
  stored sample. Re-testing replaces the sample.
- **Stage editors.** The `ResourcePicker`/`DataSource` type filter for
  roster and panel data sources accepts `['network', 'dynamicnetwork']`.
  `useVariablesFromExternalData` reads the sample file for `dynamicnetwork`
  (it is canonical-shape JSON, so `getVariableNamesFromNetwork` works
  unchanged). Card/sort/search editors need no changes beyond that.
- **Asset preview.** A `dynamicnetwork` renderer showing the endpoint
  summary (method + origin) and the sample as the existing network table
  preview.
- The `assetManifest` reducer gains an action for creating/updating the
  asset (protocol-lock-gated, like `addApiKeyAsset`), and
  `SUPPORTED_EXTENSION_TYPE_MAP` is untouched — this type is never created
  by file drop.

### 5.9 Preview and synthetic generation

Rule: **Preview and synthetic generation never contact the endpoint; they
always read the stored sample.** The `collectRosterExternalData` host adapters
(`apps/architect/src/components/PreviewHost/previewRosterData.ts`,
`apps/interviewer/src/lib/synthetic/loadRosterData.ts`) extend their
`type !== 'network'` guard to also accept `dynamicnetwork` and resolve its
sample file exactly as they resolve a static file. Preview interviews
therefore exercise roster stages deterministically and offline.

### 5.10 Host changes

- **Contract.** `ResolvedAsset` gains `'dynamicnetwork'` in its `type` union
  and an optional `request` field carrying the request config verbatim from
  the manifest; `Shell` gains the optional `interviewContext` prop (§5.4).
  `onRequestAsset` is unchanged — at interview time a dynamic asset is never
  resolved to a URL.
- **Interviewer.** `buildResolvedAssets` copies `request` from the manifest
  entry. The sample file is stored/encrypted like any file asset. One
  behavioural requirement to verify with a test: `hashProtocol` excludes
  `assetManifest`, so re-importing a protocol whose only change is the
  endpoint config produces the same hash — the import path must still
  replace the stored protocol document (the existing `importedAt` bump
  handles asset refresh).
- **Fresco.** `protocolImport` uploads the sample like any file asset (only
  `apikey` is excluded from upload). `mapInterviewPayload` populates
  `request` on the resolved asset from the stored protocol's manifest.
  Fresco sets no CSP today; no change needed for egress.
- **Architect preview.** `currentProtocolToPayload` passes `request`
  through; the preview asset resolver serves the sample for
  `collectRosterExternalData` as today.

### 5.11 CSP changes

Architect (`vite.config.ts`) and Interviewer (`vite.renderer.config.ts`)
`connect-src` changes from a closed host list to:

```
connect-src 'self' blob: https: http://localhost:* http://127.0.0.1:* <existing entries as needed>
```

The named Mapbox/GitHub/PostHog entries become redundant under `https:` and
are removed; the explanatory comments are updated to state the new rule: the
app's fetch egress is any TLS origin, because roster endpoints are
researcher-configured and unknowable at build time. `http://localhost` exists
solely so researchers can develop endpoints locally. All other directives
(`script-src`, `default-src`, `object-src`, …) are unchanged. The tradeoff is
acknowledged in §6.

### 5.12 Schema version 9 and migration

The version-bump mechanics follow the repository's existing pattern: only the
current version keeps the full modular schema tree, and superseded versions
are frozen to loose stubs (schema 7 today is an 11-line `z.looseObject` stub
whose only job is discriminating and pre-validating documents before
migration).

- `packages/protocol-validation/src/schemas/8/` is renamed to `schemas/9/`
  and evolved in place: `schemaVersion: z.literal(9)`, the `dynamicnetwork`
  asset (§5.1), and the refinements in §7.
- `schemas/8/` is recreated in the frozen schema-7 shape: a loose `schema.ts`
  stub, plus the existing v7→v8 `migration.ts`, which stays put — each
  version directory holds the migration _into_ that version.
- `schemas/index.ts`: `z.literal(9)` joins `SchemaVersionSchema`,
  `CURRENT_SCHEMA_VERSION = 9`, `ProtocolSchemaV9` joins
  `VersionedProtocolSchema`, `CurrentProtocolSchema = ProtocolSchemaV9`, and
  the star export moves from `./8/schema.ts` to `./9/schema.ts`.
- `schemas/9/migration.ts` — the v8→v9 migration, registered in
  `migration/migrate-protocol.ts`. It is a version bump plus one
  normalisation: panels whose `dataSource` does not resolve to a manifest
  asset of an allowed type are dropped. The normalisation exists because §7
  validates panel data sources for the first time and `migrateProtocol`
  post-validates its output — a migration must never produce an invalid
  protocol. Dropping such a panel preserves effective behaviour: it renders
  a permanent load error today.

Consumers that read `CURRENT_SCHEMA_VERSION` / `CurrentProtocol` (Fresco's
`validateAndMigrateProtocol`, Studio's migrate/validate, both importers)
follow automatically. Classic apps (schema 7) are unaffected. The canonical
protocols, templates, and fixtures in `packages/protocols` are re-saved at
schema 9.

## 6. Security

Governing rules, in order of importance:

1. **Participant data can never choose where a request goes.** The origin is
   a literal in the protocol; placeholders are confined to path, query, and
   body. Validated at authoring time and re-checked by the runtime before
   sending.
2. **Substitution cannot inject structure.** URL values are percent-encoded;
   body substitution operates on the parsed JSON tree, never on JSON text
   (§5.2).
3. **TLS only.** `https://` origins, with `http://localhost`/`127.0.0.1`
   permitted for development. Enforced in the schema and again by the
   runtime executor.
4. **Responses are data, never code.** Strict-schema JSON parsing, 20 MB
   cap, 30 s timeout, `response.ok` required, values through
   `VariableValueSchema`, names through `validateNames`. Nothing from a
   response is ever interpreted as markup or script.
5. **Requests carry no ambient authority.** `credentials: 'omit'` (no
   cookies), `referrerPolicy: 'no-referrer'` (a Fresco interview URL is the
   participant's access capability and must not leak — extends the rationale
   of Fresco's `Referrer-Policy: no-referrer` on `/interview/*`).
6. **Credentials are participant-visible by design.** Same posture as the
   Mapbox `apikey`: header values ship in the `.netcanvas` and leave the
   participant's browser. Documentation must state that a roster endpoint
   key must be scoped to the roster endpoint only, treated as public, and
   never shared with systems that protect anything else.
7. **Acknowledged tradeoff — CSP.** Relaxing `connect-src` to `https:`
   removes the exfiltration backstop the host allowlist provided against
   injected code. Compensating controls: `script-src` remains `'self'`, so
   the injection the allowlist defended against is itself still blocked;
   the allowlist was already absent on Fresco.
8. **Acknowledged residual risk — protocols become network-capable.** A
   hostile `.netcanvas` can now cause requests from a participant's device
   (including, in principle, to TLS intranet hosts). Preflight gates any
   request with custom headers or a POST body; a bare templated GET is the
   remaining simple-request surface. Mitigation is the existing trust
   boundary — protocols are trusted content from the researcher — made
   explicit in the import documentation.
9. **Header hygiene.** Header names must be RFC 7230 tokens; forbidden
   browser-controlled names (`Host`, `Origin`, `Referer`, `Cookie`,
   `Content-Length`, …) and `Content-Type` (app-controlled) are rejected at
   validation time.
10. **No SSRF surface added on any server.** All requests originate in the
    participant's browser; no host proxies (Decision 4).

CORS is the endpoint author's obligation and is documented: the endpoint must
answer preflights (any custom header or JSON POST triggers one) and send
`Access-Control-Allow-Origin` covering the deployment origins (or `*`).

## 7. Validation rules

Protocol-level refinements in `schemas/9/schema.ts`:

- `NameGeneratorRoster.dataSource` must reference a manifest asset of type
  `network` **or** `dynamicnetwork` (extends the roster rule carried forward
  from schema 8, `schema.ts:1015-1032`).
- `panels[].dataSource` (NameGenerator, NameGeneratorQuickAdd): when not
  `'existing'`, must reference a manifest asset of type `network` or
  `dynamicnetwork`. This closes the pre-existing gap where panel data
  sources were never existence- or kind-checked; it lands here because the
  new type makes the missing rule load-bearing, and the v8→v9 migration
  normalises pre-existing violations (§5.12).
- On each `dynamicnetwork` asset: URL origin is literal, `https` (or
  localhost); `body` present iff `method === 'POST'`; body template parses
  as JSON; every placeholder path is in the registry; no object-valued
  placeholder in the URL; header names are valid and not forbidden;
  `valueAssetId` references an `apikey` asset.

Roster column references stay `existence: 'unchecked'` (issue #1392
rationale applies identically to sample columns).

## 8. File-level change map

**`@codaco/shared-consts`** — new: placeholder-path registry + types.

**`@codaco/protocol-validation`**

- `src/schemas/9/` — the modular tree moved from `src/schemas/8/` and
  evolved: `assets/assets.ts` (`dynamicNetworkAssetSchema`, header schemas,
  union member), `schema.ts` (`z.literal(9)`, refinements §7),
  `migration.ts` (new — v8→v9, §5.12).
- `src/schemas/8/` — recreated as the frozen loose stub (schema-7 pattern);
  the v7→v8 `migration.ts` stays.
- `src/schemas/index.ts` — version-9 literal, `CURRENT_SCHEMA_VERSION`,
  union/current-schema exports.
- `src/migration/migrate-protocol.ts` — register the v8→v9 migration.
- `src/utils/dynamicNetworkResponse.ts` (new) — canonical response schema.
- `src/utils/protocolRequiresInternet.ts` (new) — shared derivation (§5.7).
- `src/index.ts` — exports.

**`@codaco/protocols`** — canonical development/sample protocols, templates,
and fixtures re-saved at schema 9.

**`@codaco/interview`**

- `src/contract/dynamicRoster.ts` (new) — template substitution, request
  builder, executor, `serializeNetworkForRequest`; exported from
  `src/contract/index.ts`.
- `src/contract/types.ts` — `ResolvedAsset.request`,
  `InterviewRequestContext`, Shell prop.
- `src/hooks/useExternalData.tsx` — type branch, `retry()`, offline-aware
  error state, content-only hash path.
- `src/utils/loadExternalData.ts` — accept an injected primary-key strategy
  (index-salted for files, content-only for dynamic).
- `src/interfaces/NameGeneratorRoster/*`, `src/interfaces/NameGenerator/
components/NodePanel.tsx` — retry UI + failure copy.
- `src/components/GeospatialOfflineIndicator.tsx` — generalized predicate
  and copy.
- `src/contract/rosterData.ts` — `collectRosterExternalData` accepts the
  new type (sample path).

**Architect** — resource dialog + test-request panel (new components under
`src/components/AssetBrowser/`), `assetManifest` duck action, `AssetBrowser`
type filter + preview renderer, `ResourcePicker`/`DataSource` type lists,
`useVariablesFromExternalData`, `PreviewHost/previewRosterData.ts`,
`currentProtocolToPayload.ts`, `ProtocolInfoCard` (use shared helper),
`vite.config.ts` CSP.

**Interviewer** — `lib/assets/assetResolver.ts` (`buildResolvedAssets`),
`lib/protocol/protocolRequiresInternet.ts` (delegate to shared helper),
`lib/synthetic/loadRosterData.ts`, `NewSessionForm` copy, `routes/
Interview.tsx` (context prop), `vite.renderer.config.ts` CSP.

**Fresco** — `mapInterviewPayload.ts`, `InterviewClient.tsx` (context prop).

## 9. Testing

- **protocol-validation:** schema unit tests for the new asset (valid/invalid
  origins, method/body coupling, header rules, placeholder registry,
  object-in-URL); refinement tests for roster + panel data sources
  (including the newly closed panel gap); response-schema tests (empty
  nodes valid, bad names rejected); `protocolRequiresInternet` cases;
  `collectAssetReferences` picks up `valueAssetId`.
- **migration:** a valid v8 protocol migrates to a valid v9 protocol
  changed only in `schemaVersion`; a v8 protocol with a dangling panel
  `dataSource` has that panel dropped and post-validates;
  `getMigrationInfo(8, 9)` reports the migration notes; the existing
  v1→v8 chain fixtures still land on the new current version.
- **interview:** substitution unit tests (tree substitution, typed
  replacement, interpolation escaping, encoding, absent values); executor
  tests with a mocked `fetch` (timeout, non-2xx, oversize, invalid JSON,
  offline); content-only hash stability under reorder and dedup across
  refetch; `useExternalData` retry and auto-retry-on-reconnect; Storybook
  stories for the roster error/retry states (loading, offline, server
  failure) — Chromatic covers them.
- **Interview e2e matrix:** the `verifying-an-interface-change` skill
  applies — NameGeneratorRoster and panels change behaviourally; add a
  matrix configuration with a dynamic source served by Playwright route
  interception, and update ARIA snapshots for the retry states. Visual
  baselines per `preparing-e2e-visual-baselines` if pixels move.
- **Architect e2e:** create a dynamic roster resource against an intercepted
  endpoint, run the test request, configure a roster stage from its sample
  columns, confirm Preview uses the sample with the endpoint unreachable.
- **Interviewer:** session-gate dialog for a dynamic-roster protocol while
  offline; re-import test proving an endpoint-config-only change (same
  protocol hash) takes effect.
- **Fresco:** `mapInterviewPayload` carries `request`; import stores the
  sample.
- **Oracle discipline:** every "fetch was not made" assertion (Preview,
  synthetic, sample paths) must fail when a fetch _is_ made — assert via
  route interception counters, not absence of visible change
  (`writing-an-oracle-that-can-fail`).

## 10. Documentation

- New page: _Building a dynamic roster endpoint_ — request anatomy,
  placeholder table, canonical response shape, CORS/preflight obligations,
  idempotency requirement, key-visibility warning (§6.6).
- `working-with-rosters.en.md`, `name-generator-roster.en.mdx`,
  `key-concepts/resources.en.mdx` — the new resource type and test-request
  flow.
- `interviewer-online-and-offline-workflows.en.mdx`, `gdpr-compliance
.en.mdx`, `irb-best-practices.en.md` — dynamic rosters join Geospatial as
  a third-party connection to disclose.
- `protocol-schema-information.en.mdx` — current schema version becomes 9;
  the app-support matrix gains the 9 row and the guidance that re-saving a
  protocol in Architect upgrades it.

## 11. Shipping

Normal changeset lane, one changeset: `@codaco/protocol-validation` (**major**
— `CURRENT_SCHEMA_VERSION` changes and every consumer's protocols migrate on
next open/import), `@codaco/interview` (minor), `@codaco/shared-consts`
(minor), Architect, Interviewer, Fresco (minor each). Suggested implementation
sequence (one plan, PRs may be combined): (1) schema 9 + migration +
validation + shared helpers, (2) interview runtime + retry UX, (3) Architect
authoring + preview, (4) hosts + CSP + docs. E2E suite selection follows from
the workspace dependency closure as usual.
