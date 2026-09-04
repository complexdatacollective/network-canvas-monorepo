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
  entities across waves is Studio's concern (issue #1242 tree). **Amended
  2026-09-04:** the transport now _carries_ an identifier that a source such
  as Studio mints (Decision 3 amendment), and nothing here mints, interprets,
  or reconciles one — deciding which real person two records describe remains
  entirely out of scope.
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
   static files instead; cross-wave identity was out of scope — see the
   2026-09-04 amendment below, which admits an optional id without
   _requiring_ one). Because the asset is refetched and servers may reorder
   rows, the existing
   content-plus-index hash would change every row's identity on reorder, so
   dynamic rosters hash row content only. Consequences, accepted: two
   byte-identical rows in one response collapse into one roster entry, and a
   row whose attributes change between fetches becomes a _different_ node —
   an already-nominated person whose server-side record changed is re-offered
   in the roster. The endpoint contract is therefore: return stable attribute
   payloads for a person within an interview session, and use the embedded
   current network (§5.3) to filter already-present people out server-side.

   **Amendment (2026-09-04).** The response contract additionally admits an
   **optional per-node stable id**: a node MAY carry a non-empty string `id`
   alongside its `attributes`, and when present the parse pipeline uses it as
   the node's identity instead of the content hash (§5.4 step 5, §5.5). When
   absent, content-hash identity applies exactly as decided above — the
   amendment changes nothing for endpoints that do not send ids. Motivation:
   longitudinal prior-data rosters (#1300, #1302), where Studio serves a
   participant's prior-wave alters and an alter whose attributes changed
   between waves must not fork into a new node — under pure content-hash
   identity such an alter is re-offered as new, defeating cross-wave alter
   linkage.

   The obligations attach **per element, not per response**, because `id` is
   optional per node and one response may carry both kinds:

   - An **id-less** element carries the obligations decided above, unchanged:
     return a stable attribute payload for that person within an interview
     session, and filter the person out server-side once they appear in the
     embedded current network (§5.3).
   - An **id-bearing** element carries those same obligations **plus** one
     more — the id is non-empty, stable for that person across fetches and
     across waves, and unique to that person, so two different people never
     share an id. Sending ids adds a contract; it does not relax one.
     Server-side dedupe against the embedded network remains the mechanism
     that keeps already-present people out of the roster.

   Uniqueness is scoped to the interview network, per subject type: the parse
   pipeline keys an id-bearing node as `` `${subjectType}_${id}` ``, so two
   dynamic assets in one protocol that both return `"1"` for _different_
   people of the same type collapse into one node, and the second person is
   filtered out of every panel that compares against the current network. An
   author serving a protocol from more than one endpoint must therefore
   namespace ids (prefix by source); two sources sharing an id is correct
   only when they genuinely name the same person.

   Amended by product-owner ruling before implementation of #1451–#1456
   began (epic #1457, tracker #1514).

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
   the protocol as the asset's `source` file. Column pickers, synthetic
   generation, and CI read the sample and never contact the endpoint —
   those surfaces must be deterministic and work offline. Rejected manual
   column declaration (typo-prone) and live-fetching column options
   (Architect editing becomes dependent on the endpoint being up).
   **Preview is the deliberate exception** (revised 2026-08-25 during spec
   review): it executes the live request exactly as an interview would
   (§5.9), because Preview is the researcher's end-to-end test surface for
   the endpoint.
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
  // z.literal, NOT z.enum: the reference walker matches discriminated-union
  // branches only by ZodLiteral discriminators
  // (collectEntityAttributeReferences.ts:350-359), and this is the first
  // asset branch that itself carries references (valueAssetId below) — an
  // enum discriminator would make them invisible to collectAssetReferences.
  type: z.literal('dynamicnetwork'),
  /**
   * Stored sample response (canonical response shape, JSON), written by
   * Architect's "Send test request". Ships in the zip like any file asset;
   * it backs column pickers and synthetic generation. Interviews and
   * Preview fetch live instead (§5.9) — the sample is never shown to a
   * participant.
   */
  source: assetSourceSchema,
  /**
   * Hash (ohash, as in hashProtocol) of `request` at the moment the stored
   * sample was accepted. A protocol whose sampleOf does not match its
   * current request is invalid (§7): the sample must describe THIS request.
   */
  sampleOf: z.string().min(1),
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
surface (columns, synthetic generation, CI) deterministic and offline. And the
sample must be **fresh**: `sampleOf` binds the stored sample to the exact
request configuration it was produced by, so editing the URL, method, headers,
or body invalidates the sample at the protocol level — not merely in the
editor UI — and hand-authored protocols cannot claim a sample they never
proved (§5.8, §7).

Because `source` is a real file in `assets/`, the whole existing file-asset
machinery — zip extraction (`extractProtocol.ts`), the export bundler's
`rewriteManifest`, Interviewer's encrypted IndexedDB storage, Fresco's object
storage upload — handles it with no special casing beyond the type switch.

One further invariant keeps cross-host asset handling sound: **an assetId is
immutable — it names one exact request configuration and its sample.** When
the request configuration changes, **or an accepted re-test returns sample
bytes that differ from the stored sample**, Architect assigns the asset a
fresh id and rewrites every reference to it (stage `dataSource`, panel
`dataSource`) in the same undo gesture as the save (§5.8). File assets
already have this property (their bytes never change under an id), and
Fresco's globally deduplicated `Asset` table depends on it: `assetId` is
unique and shared across protocols there — `getNewAssetIds` skips uploading
an already-known id, so mutated bytes or configuration under a stable id
would either never reach Fresco or silently overwrite what another protocol
shares.

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
- **Request context is stable per interview.** `protocol.name` is
  snapshotted into the interview/session record at creation by each host;
  a later same-hash metadata edit to the stored protocol (§5.10) never
  changes what an in-flight or resumable interview sends — an endpoint
  routing on the placeholder cannot start returning a different roster
  midway through collection. (`protocol.hash` is immutable by
  construction, and `interview.*` is session-scoped already.)

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
which is what an endpoint needs to avoid re-offering already-present nodes
(the mitigation Decision 3 relies on: filtering happens server-side, against
this payload, not via client-side identity).

Attributes whose codebook variable is marked `encrypted` are **omitted from
the serialization**. The session store holds them only as ciphertext with
separate `_secureAttributes` metadata (`session.ts:214-225`), so sending them
"as is" would hand the endpoint undecryptable bytes while implying meaning —
and decrypting them for transmission would move values to an external server
that the encryption feature exists to keep contained. The omission is
documented for endpoint authors and covered by a test against an encrypted
network.

### 5.4 The request at runtime

`useExternalData` (`packages/interview/src/hooks/useExternalData.tsx`)
branches on asset type. For `dynamicnetwork` it does not call
`onRequestAsset`; instead it calls the new executor in
`packages/interview/src/contract/dynamicRoster.ts`:

1. Build the request from the template and a context whose network is a
   **stage-entry snapshot**: the dynamic branch serializes the network once
   when the stage is entered and does not take the live network as an
   effect dependency. Otherwise every nomination would mutate a dependency
   of `useExternalData`'s effect, clearing the roster back to loading and
   re-issuing the request mid-stage — Decision 2 means one fetch per stage
   _entry_, not per network change. A regression test proves adding or
   removing a node within the stage neither refetches nor resets the
   roster.
2. `fetch(url, { method, headers, body, signal, referrerPolicy: 'no-referrer',
credentials: 'omit', cache: 'no-store', redirect: 'error' })`. POST bodies
   are sent with
   `Content-Type: application/json` (set by the app; not overridable).
   `redirect: 'error'` closes a boundary bypass: a followed redirect
   re-targets the request _after_ the URL checks below have run, so an
   allowed public endpoint could bounce the request to a blocked loopback
   target. Endpoints must answer directly; the endpoint guide documents
   this.
   `cache: 'no-store'` is load-bearing: without it a GET endpoint that sends
   cacheable headers would be answered from the browser's HTTP cache, and a
   revisited stage would silently see stale data — violating Decision 2's
   fetch-on-each-entry rule from a layer no service-worker configuration
   covers. The service-worker layer needs its own guard too: the installed
   Architect and Interviewer Workbox configs match image and font URLs
   **by extension regex alone**, cross-origin included, with `CacheFirst` —
   and Workbox reads the Cache API explicitly, so `cache: 'no-store'` does
   not bypass it. A roster endpoint whose path happens to end in a matched
   extension would be served from cache on re-entry. Both apps therefore
   gain a higher-priority `NetworkOnly` route, registered before every
   extension cache, matching cross-origin fetch-style requests
   (`request.destination === ''` and a foreign origin) — which captures
   roster requests categorically without touching same-origin asset
   caching or element-initiated image/font loads. A config-level test
   asserts the route's position and matcher. Production builds additionally refuse any non-`https://` URL
   **and any loopback host regardless of scheme** — classified by parsing
   the hostname as an IP address, so `localhost`, `127.0.0.0/8`, `::1`,
   `0.0.0.0`, and IPv4-mapped IPv6 forms such as `[::ffff:127.0.0.1]` are
   all caught, not just the listed textual spellings; hostnames are
   normalised (trailing dot stripped) and the RFC 6761 special-use domain
   is rejected by name — `localhost` and anything ending in `.localhost`,
   which browsers resolve to the loopback interface — because
   `https://127.0.0.1` behind a locally trusted certificate would slip
   through a scheme-only check (the localhost allowance is development-only,
   §5.11/§6.3).
3. Enforce: a 30-second timeout composed with an effect-lifetime abort —
   `AbortSignal.any([AbortSignal.timeout(30_000), lifetime.signal])`, where
   the hook's cleanup aborts `lifetime` — so leaving the stage cancels the
   request and its response download rather than merely ignoring the
   eventual result, and re-entering never runs alongside a still-live
   predecessor (covered by a navigate-away-mid-flight test); `response.ok`
   (a non-2xx status is a typed error); a 20 MB response cap (checked
   against `Content-Length` when present and enforced while reading the
   stream); a substituted URL longer than 8 KB is an error before sending.
4. Parse as JSON and validate against the canonical response schema (§5.5).
   **The runtime enforces exactly the rules the test request enforces; an
   invalid response is a fetch failure, never partially ingested.**
5. Hand the nodes to the existing parse pipeline
   (`parseExternalNetworkAsset`), with one difference: primary keys are
   `` `${subjectType}_${id}` `` for an element carrying a stable `id`, and
   `` `${subjectType}_${hash({ node })}` `` for one that does not — content
   only, no index salt (Decision 3 and its 2026-09-04 amendment). The branch
   is evaluated per element, so a response may mix id-bearing and id-less
   nodes. Static-file rosters keep their existing salted hash; nothing
   changes for them.

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

Interviewer populates it from the session record; Fresco from the interview +
participant rows (`caseId` = participant identifier — note
`getInterviewById` (`apps/fresco/queries/interviews.ts:245-250`) includes
`protocol.assets` but not the `participant` relation today, so the query
must add it or the identifier cannot reach the payload); Architect preview
and Storybook supply synthetic values.

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
- Each element must have an `attributes` object. `null`/`undefined`
  attribute values are **stripped, not rejected** — the static-file parser
  deliberately drops nullish values before validating
  (`loadExternalData.ts`), and an endpoint that represents missing data as
  JSON `null` must not fail where the byte-identical file succeeds. The
  remaining values must satisfy the existing `VariableValueSchema` rules.
- Attribute names must pass the existing `validateNames` NMTOKEN rule
  (`A-Za-z0-9._-:`), the same rule static imports enforce — otherwise GraphML
  export breaks long after the interview.
- Unknown top-level keys (including `edges`) are ignored, matching the static
  JSON roster behaviour.
- **Amendment (2026-09-04):** each element MAY additionally carry a stable
  `id` — a **non-empty** string (`z.string().min(1)`, the rule `sampleOf`
  already uses). `""` is a schema error, not an identity: every empty-id
  element would otherwise key to the same node, silently collapsing distinct
  people into one roster entry — the exact failure the amendment exists to
  prevent. When present the parse pipeline honors the `id` as the node's
  identity (§5.4 step 5); when absent, content-hash identity applies. Keys
  stay composite (`` `${subjectType}_${id}` ``, never the bare id), so a
  roster `_uid` is always non-empty and the roster's truthiness-guarded
  removal handler (`NameGeneratorRoster.tsx:249-257`) keeps working
  unchanged. This response `id` is **not** the `id` of §5.3's embedded
  request payload: there it is the interview-internal `_uid` of a node
  already in the network, here it is the endpoint's own stable identifier
  for a roster row. See the Decision 3 amendment for the stability and
  uniqueness obligations an id-sending endpoint takes on.

The same schema also validates **stored sample bytes at every import
boundary** — Architect opening a `.netcanvas`, Interviewer import, Fresco
import. Protocol validation sees only the sample's filename, so a
hand-authored or corrupted archive could otherwise pass validation and fail
much later in column pickers and every sample-backed synthetic path. A
malformed or missing sample is an import error, covered by tests in each
host.

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
- Navigation follows normal stage rules, with one deliberate exception:
  the stage's `behaviours.minNodes` forward-navigation gate
  (`useNodeLimits` / `useStageValidation`) is suspended while the dynamic
  source cannot supply enough candidates to satisfy it — the error state,
  and equally the **ready-but-exhausted** state: a valid `{ "nodes": [] }`
  response, or a roster whose every row is already in the network, makes
  `minNodes > 0` exactly as unsatisfiable as a dead endpoint. Without the
  waiver the participant faces a permanently blocked next arrow with
  nothing left to nominate — the trap Decision 8 forbids. The waiver is
  announced (the empty/error copy states the participant may continue), and
  the analytics capture records that the minimum was waived and why.
- Errors are captured to analytics under the existing `external-data`
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
  row count and columns. The scalar placeholders (`interview.*`,
  `protocol.*`, `stage.id`) are presented as **editable test values** with
  synthetic defaults — an endpoint keyed by `{{interview.caseId}}` needs a
  real enrolled identifier to return a representative response, and a
  synthetic one would yield a 404 or empty roster with no usable columns.
  The network placeholder stays generated. Of the edited test values, only
  the **`interview.*` overrides** persist (in Architect's local protocol
  workspace — never in the exported `.netcanvas`, since a real enrolled
  identifier is exactly what they may contain), and Preview substitutes
  those persisted values for its `interview.*` context (§5.9) so the
  end-to-end surface exercises the identity the researcher proved.
  `protocol.*`, `stage.id`, and `now` are intrinsic — Preview derives them
  from its live context, because §5.2 defines `stage.id` as the stage
  currently fetching, and an asset shared by two stages must see each
  stage's real id, not the test panel's.
  Accepting the result stores the
  response JSON as the asset's sample file (`source`, generated filename
  `<uuid>.json`) via the existing asset-storage path, and writes `sampleOf`
  from the tested request. The asset cannot be saved without a stored
  sample, **and any edit to the request configuration disables save until a
  test of the edited configuration succeeds** — otherwise column pickers and
  synthetic data would describe an endpoint participants never call, failing
  only during collection. Accepting a test whose configuration changed _or
  whose response bytes differ from the stored sample_ also assigns the
  asset its fresh id and rewrites references (§5.1's immutability
  invariant), all in one undo gesture. Because `sampleOf`
  hashes the request with header key references _resolved to their values_
  (§7), a change to a referenced `apikey` invalidates every dependent
  dynamic asset; Architect lists the affected assets via the reference index
  and requires re-testing them. The `sampleOf` refinement (§7) backs all of
  this at the protocol level.
- **Development-URL alert.** A protocol whose dynamic roster targets an
  `http://localhost` origin gets a timeline alert (the
  `TestingMapboxTokenAlert` pattern): such a protocol only works in
  development builds (§5.11) and must be pointed at a real TLS endpoint
  before deployment.
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

Rule: **Preview executes the live request; every surface that must be
deterministic and offline reads the stored sample.**

- **Architect Preview** behaves exactly like a real interview: the
  stage-entry fetch, retry affordances, and failure states all run against
  the researcher's real endpoint, with the persisted `interview.*` test
  values from the asset's test panel (§5.8) filling the host placeholders —
  the identity the accepted test proved, not a freshly fabricated one, so
  an endpoint keyed by `{{interview.caseId}}` behaves in Preview as it did
  in the test — while `protocol.*`, `stage.id`, and `now` come from the
  live Preview context and the preview network fills `{{network}}`.
  This is deliberate — Preview is where a researcher proves the endpoint
  works end to end before deployment, including how the stage degrades when
  it doesn't. Previewing a dynamic-roster stage therefore needs internet,
  surfaced by the same offline indicators as a real interview.
- **Synthetic state generation** — the `collectRosterExternalData` host
  adapters (`apps/architect/src/components/PreviewHost/previewRosterData.ts`,
  `apps/interviewer/src/lib/synthetic/loadRosterData.ts`) — reads the
  stored sample: it runs at startup across many stages at once and must be
  deterministic, offline-capable, and incapable of hammering the endpoint.
  The adapters extend their `type !== 'network'` guard to also accept
  `dynamicnetwork` and resolve the sample file exactly as a static file —
  parsed with the **same key strategy as the live path** (§5.4 step 5 — the
  element's `id` when it carries one, else the content-only hash): the
  collector's current index-salted keys would never match a live `_uid`, so
  a sampled node could be offered again by the live roster.
  With matching keys, a synthetic node drawn from the sample that still
  matches a live row dedupes naturally; a changed row appears as both —
  acceptable in a test surface.
- **Fresco's synthetic test interviews**
  (`app/api/generate-test-interviews/route.ts`) currently call
  `generateNetwork` with no roster data at all, so they would fabricate
  people for dynamic-roster stages. The route gains a storage-backed roster
  collector that reads samples from the asset store server-side, bringing
  it in line with the other two synthetic adapters.
- **Column pickers and CI** likewise read the sample; e2e intercepts the
  endpoint with Playwright routes wherever it exercises the live path.
- **The synthetic starting network stops before the start stage.**
  `PreviewHost.buildSession` today passes every stage to `generateNetwork`
  and only marks the start stage in-progress as a post-pass, so the network
  handed to the live request would contain nodes from the previewed roster
  stage itself and from stages the participant has not reached — an
  endpoint that filters out already-present people would return a roster no
  real participant would ever see. `generateNetwork` gains an option to run
  stage handlers only for stages before an index, and `PreviewHost` passes
  the preview start stage. This aligns example-data preview with real
  interview semantics for every stage type, and it is what makes the
  embedded `{{network}}` truthful.

### 5.10 Host changes

- **Contract.** `ResolvedAsset` gains `'dynamicnetwork'` in its `type` union
  and an optional `request` field carrying the request config verbatim from
  the manifest; `Shell` gains the optional `interviewContext` prop (§5.4).
  `onRequestAsset` is unchanged — at interview time a dynamic asset is never
  resolved to a URL.
- **Interviewer.** `buildResolvedAssets` copies `request` from the manifest
  entry. The sample file is stored/encrypted like any file asset. Because
  §5.1 re-keys an edited request and rewrites its stage references, a
  request edit on a _referenced_ asset changes `stages` and therefore the
  protocol hash — it arrives as an ordinary new import, and so does a
  refreshed sample, which re-keys the same way (§5.1). What legitimately
  stays same-hash (the v8→v9 re-import, metadata edits,
  changes to unreferenced assets) must still take effect: the import path
  replaces the stored protocol document (the existing `importedAt` bump
  handles asset refresh) — **except `experiments`**, which the hash also
  excludes but which governs encryption behaviour for resumable sessions;
  a same-hash import whose `experiments` differ is rejected with guidance.
  Covered by tests for both directions.
- **Fresco.** Fresco does not persist the asset manifest — its `Protocol`
  row stores only `stages` and `codebook` JSON — so the request config
  needs a home: the `Asset` model gains a nullable `request Json` column
  (Prisma migration), the same pattern as `value` for `apikey` rows.
  `protocolImport` uploads the sample like any file asset (only `apikey` is
  excluded from upload) and persists `request` and `sampleOf` on the asset
  row; the insert schema and `insertProtocol` carry them through;
  `mapInterviewPayload` populates `request` on the resolved asset from the
  asset row **and excludes dynamic-roster sample URLs from the participant
  payload** — today every stored asset URL is serialized to the interview
  client, and a sample produced by a test against a real identifier may
  contain a real person's roster. Nothing breaks: the runtime never
  requests a dynamic asset's URL (`onRequestAsset` is unused for them), and
  the sample stays server-side for synthetic use. Fresco also persists the
  protocol document's own `name` (a new column beside `Protocol.name`,
  which stores the uploaded archive filename for display) and resolves
  `{{protocol.name}}` from it — snapshotted onto the interview at creation
  (§5.2) — so the placeholder means the same thing on every host and stays
  stable for in-flight interviews across metadata edits. Interviewer does
  the same: the session record captures the name at creation and the
  context reads the snapshot, not the re-loaded protocol document. Storing `request` on the globally deduplicated `Asset` row is
  sound _because of_ §5.1's immutability invariant — an assetId names one
  exact configuration, so protocols sharing an id share it correctly and a
  changed configuration always arrives as a new asset. Fresco sets no CSP
  today; no change needed for egress.
  Fresco also needs the same same-hash story as Interviewer:
  `useProtocolImport` currently rejects an import whose `hashProtocol`
  matches an existing protocol ("delete the existing protocol first"), and
  deleting is destructive to collected interviews. Importing a protocol
  with a matching hash becomes an in-place update behind a confirmation.
  §5.1's re-keying bounds what this path carries: a request edit on a
  _referenced_ asset rewrites stage `dataSource` strings, changes the hash,
  and imports as an ordinary **new** protocol — in-flight interviews
  deliberately keep the configuration they started under, and new sessions
  use the new protocol — and a refreshed sample re-keys and arrives the
  same way (§5.1). What legitimately stays same-hash is the v8→v9
  re-import, metadata edits, and unreferenced-asset
  changes; the update replaces every protocol-level field **except
  `experiments`** — `schemaVersion` included, since a curated list that
  skipped it would leave a row claiming 8 while serving 9-only asset
  behaviour. `experiments` is also outside the hash, but it governs
  encryption for existing and resumable interviews, so a same-hash import
  whose `experiments` differ is rejected with guidance rather than
  silently rewriting encryption behaviour under interviews collected
  without it. Same-hash means codebook and stages are identical, so
  existing interviews are otherwise unaffected.
- **Architect preview.** `currentProtocolToPayload` passes the asset
  through unchanged — type `'dynamicnetwork'` with `request` intact — and
  `PreviewHost` supplies a synthetic `interviewContext`, so the runtime's
  dynamic branch executes in Preview exactly as it does in the field
  (§5.9). The preview asset resolver still serves the sample file, which
  synthetic state generation consumes.

### 5.11 CSP changes

Architect (`vite.config.ts`) and Interviewer (`vite.renderer.config.ts`)
`connect-src` changes from a closed host list to:

```
connect-src 'self' blob: https: <existing entries as needed>
```

The named Mapbox/GitHub/PostHog entries become redundant under `https:` and
are removed; the explanatory comments are updated to state the new rule: the
app's fetch egress is any TLS origin, because roster endpoints are
researcher-configured and unknowable at build time.

`http://localhost:* http://127.0.0.1:*` is appended **only in development
builds**. A production allowance would let any imported protocol issue simple
GETs to arbitrary loopback ports on a participant's machine — CORS blocks
reading the response but not sending the request, and local services that
trust loopback need neither. Endpoint authors develop against the dev build
or put a TLS tunnel in front of a local server; the production runtime
enforces the same boundary (§5.4), and Architect warns on localhost URLs
(§5.8). All other directives (`script-src`, `default-src`, `object-src`, …)
are unchanged. The tradeoff is acknowledged in §6.

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
- Every direct `../schemas/8/` import under `src/utils/` rebinds to
  `../schemas/9/` as part of the move. Most break loudly, because the
  helper modules they import move with the tree — but
  `collectEntityAttributeReferences.ts:22` imports `../schemas/8/schema.ts`
  directly (deliberately bypassing `schemas/index.ts` to sidestep a module
  cycle), and that path resolves **silently** to the recreated loose stub:
  the walker would traverse an empty schema and every reference collection
  (`collectAssetReferences`, entity references — Architect's in-use
  indexes and delete protection) would return nothing without any error. A
  canary test asserts `collectAssetReferences` returns nested hits for a
  fixture protocol, so the current-schema binding can never silently
  regress again.
- `schemas/index.ts`: `z.literal(9)` joins `SchemaVersionSchema`,
  `CURRENT_SCHEMA_VERSION = 9`, `ProtocolSchemaV9` joins
  `VersionedProtocolSchema`, `CurrentProtocolSchema = ProtocolSchemaV9`, and
  the star export moves from `./8/schema.ts` to `./9/schema.ts`.
- `schemas/9/migration.ts` — the v8→v9 migration, registered in
  `migration/migrate-protocol.ts`. It is a version bump plus one
  normalisation: panels whose `dataSource` is **not the `'existing'`
  sentinel** and does not resolve to a manifest
  asset of an allowed type are dropped — `'existing'` panels are valid
  in-session sources, exempt from §7's asset check, and must survive the
  migration byte-identical (regression-tested). The normalisation exists because §7
  validates panel data sources for the first time and `migrateProtocol`
  post-validates its output — a migration must never produce an invalid
  protocol. Dropping such a panel preserves effective behaviour: it renders
  a permanent load error today.
- `migrateProtocol` post-validation becomes keyed to `targetVersion`.
  Today it validates every result against `CurrentProtocolSchema`
  unconditionally (`migrate-protocol.ts:78`); once current is 9, an
  explicit-target caller such as
  `apps/fresco/scripts/migrate-protocols-to-v8.ts` (`migrateProtocol(…, 8)`)
  would validate a v8 document against the v9 schema and always fail.
  Post-validation selects the schema for the requested target (frozen
  versions validate against their loose stubs), with an explicit-target
  regression test.
- Fresco's deploy-time protocol migration generalises with it.
  `scripts/migrate-protocols-to-v8.ts` runs from `setup-database.ts` on
  every platform build, and its `isConformantV8` check validates rows
  against `CurrentProtocolSchema` — once current is 9, every valid stored
  v8 row fails that check and is re-fed through v7→v8 normalisation on
  each deploy. The script becomes migrate-to-current
  (`migrate-protocols-to-current.ts`): rows below `CURRENT_SCHEMA_VERSION`
  migrate forward through the standard chain (asset manifest reconstructed
  as today; `stages`, `codebook`, `schemaVersion`, and the recomputed
  `hash` updated in one transaction), rows at the current version are
  validated against `CurrentProtocolSchema` and left untouched when
  conformant, and failures are skipped and logged as today. A regression
  test proves a conformant current-version row survives a deploy
  unmodified.

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
3. **TLS only, and no loopback, in production.** `https://` origins
   everywhere; loopback is valid in the schema but honoured only by
   development builds — the production CSP omits the `http:` loopback
   entries (§5.11), the production executor refuses **any loopback host
   under any scheme** (`https://127.0.0.1` behind a locally trusted
   certificate included, §5.4), and Architect flags loopback URLs (§5.8) —
   so a hostile protocol cannot use participants' browsers to probe
   loopback services in the field.
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
11. **The stored sample is protocol content.** A test run against a real
    enrolled identifier stores that person's roster inside the `.netcanvas`
    and every host's asset store. It is excluded from participant payloads
    (§5.10) and Preview's test values never export (§5.8), but anyone
    holding the protocol file can read the sample; documentation tells
    researchers to test with non-sensitive identifiers where roster content
    is sensitive.

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
  localhost, development-only per §6.3); the URL carries no credentials
  (a `user:pass@` URL parses to a clean origin yet `fetch()` refuses to
  construct the request, so it would pass a naive check and always fail at
  execution — rejected upfront, pointing the author at headers); `body`
  present iff `method === 'POST'`; body template parses as JSON; every
  placeholder path is in the registry; no object-valued placeholder in the
  URL; header names are valid and not forbidden; header **values** — both
  inline strings and the values of referenced `apikey` assets, which the
  whole-protocol refinement can read — satisfy Fetch's header-value
  constraints (ByteString range, no CR/LF/NUL, no leading or trailing
  whitespace), because the `Headers` constructor throws on violations and a
  schema-valid asset must never be structurally unexecutable;
  `valueAssetId` references
  an `apikey` asset; `sampleOf` equals the hash of the current `request`
  object **with header key references resolved to the referenced keys'
  values** — so rotating a key, editing the request, or fabricating a
  sample by hand all fail validation, not just editor state.

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
- `src/migration/migrate-protocol.ts` — register the v8→v9 migration;
  post-validation keyed to `targetVersion` (§5.12).
- `src/utils/dynamicNetworkResponse.ts` (new) — canonical response schema,
  including the optional non-empty per-node `id` (§5.5).
- `src/utils/protocolRequiresInternet.ts` (new) — shared derivation (§5.7).
- `src/utils/collectEntityAttributeReferences.ts`,
  `findVariableRoleConflicts.ts`, `findExclusiveVariableConflicts.ts`,
  `test-utils.ts` — direct `../schemas/8/` imports rebind to `schemas/9/`
  (§5.12; the `schema.ts` binding is the silent one).
- `src/index.ts` — exports.

**Root `CLAUDE.md` / `AGENTS.md`** (one file; `AGENTS.md` is a symlink) —
the protocol-validation section's "schemas are modularized in
`src/schemas/8/`" guidance updates to `src/schemas/9/`, so future feature
work follows the documented architecture into the right version.

**`@codaco/protocols`** — canonical development/sample protocols, templates,
and fixtures re-saved at schema 9.

**`@codaco/interview`**

- `src/contract/dynamicRoster.ts` (new) — template substitution, request
  builder, executor, `serializeNetworkForRequest`; exported from
  `src/contract/index.ts`.
- `src/contract/types.ts` — `ResolvedAsset.request`,
  `InterviewRequestContext`, Shell prop.
- `src/hooks/useExternalData.tsx` — type branch, `retry()`, offline-aware
  error state, dynamic identity path.
- `src/utils/loadExternalData.ts` — accept an injected primary-key strategy
  (index-salted for files; for dynamic, the element's `id` when it carries
  one, else content-only — §5.4 step 5, decided per element).
- `src/interfaces/NameGeneratorRoster/*`, `src/interfaces/NameGenerator/
components/NodePanel.tsx` — retry UI + failure copy; the roster stage
  suspends its `useNodeLimits` minNodes gate in the error state (§5.6).
- `src/components/GeospatialOfflineIndicator.tsx` — generalized predicate
  and copy.
- `src/contract/rosterData.ts` — `collectRosterExternalData` accepts the
  new type (sample path).

**Architect** — resource dialog + test-request panel (new components under
`src/components/AssetBrowser/`; test values persisted in the local protocol
workspace, §5.8), `assetManifest` duck action, `AssetBrowser`
type filter + preview renderer, `ResourcePicker`/`DataSource` type lists,
`useVariablesFromExternalData`, import-time sample validation (§5.5),
`PreviewHost/previewRosterData.ts`,
`currentProtocolToPayload.ts` + `PreviewHost` (pass `request` through,
persisted test values as the scalar context, §5.9/§5.10),
a localhost-URL timeline alert (`TestingMapboxTokenAlert` pattern, §5.8),
`ProtocolInfoCard` (use shared helper), `vite.config.ts` CSP (dev-gated
localhost, §5.11) + the cross-origin fetch `NetworkOnly` Workbox route
(§5.4).

**Interviewer** — `lib/assets/assetResolver.ts` (`buildResolvedAssets`),
`lib/protocol/protocolRequiresInternet.ts` (delegate to shared helper),
`lib/synthetic/loadRosterData.ts`, `NewSessionForm` copy, `routes/
Interview.tsx` (context prop + name snapshot, §5.2),
`vite.renderer.config.ts` CSP, `vite.config.ts` cross-origin fetch
`NetworkOnly` Workbox route (§5.4).

**Fresco** — `lib/db/schema.prisma` (`Asset.request`, `Asset.sampleOf`, and
the embedded protocol-name column, §5.10) +
Prisma migration, `utils/protocolImport.tsx` + `schemas/protocol.ts` +
`actions/protocols.ts` (persist request config + embedded name; validate
sample bytes at import, §5.5; same-hash in-place update
replacing all protocol-level fields except `experiments`, §5.10),
`hooks/useProtocolImport.tsx` (same-hash update flow),
`app/api/generate-test-interviews/route.ts` (storage-backed roster
collector, §5.9),
`scripts/migrate-protocols-to-v8.ts` → `migrate-protocols-to-current.ts` +
`scripts/setup-database.ts` (§5.12), `queries/interviews.ts`
(`getInterviewById` adds the `participant` relation, §5.4),
`mapInterviewPayload.ts`, `InterviewClient.tsx` (context prop).

**`@codaco/protocol-utilities`** — `generateNetwork` gains a
stop-before-stage option so Preview's synthetic starting network contains
only stages preceding the start stage (§5.9); `PreviewHost` passes it.

## 9. Testing

- **protocol-validation:** schema unit tests for the new asset (valid/invalid
  origins, URL credentials rejected, method/body coupling, header rules —
  names and the CR/LF/ByteString value constraints, inline and via
  referenced keys — placeholder registry, object-in-URL, `sampleOf`
  mismatch rejected —
  including via a changed referenced key value); refinement tests for both
  roster and panel data sources
  (including the newly closed panel gap); response-schema tests (empty
  nodes valid, bad names rejected, a non-empty `id` accepted, `id: ""` and a
  non-string `id` rejected, an element with no `id` still valid);
  `protocolRequiresInternet` cases;
  `collectAssetReferences` picks up `valueAssetId`, plus the canary that it
  returns nested hits at all (§5.12 — the walker's direct current-schema
  import must never silently bind to a frozen stub).
- **migration:** a valid v8 protocol migrates to a valid v9 protocol
  changed only in `schemaVersion`; a v8 protocol with a dangling panel
  `dataSource` has that panel dropped and post-validates, while an
  `'existing'`-sentinel panel survives byte-identical;
  `getMigrationInfo(8, 9)` reports the migration notes; the existing
  v1→v8 chain fixtures still land on the new current version; an explicit
  `migrateProtocol(doc, 8)` still succeeds post-v9 (target-keyed
  post-validation, §5.12).
- **interview:** substitution unit tests (tree substitution, typed
  replacement, interpolation escaping, encoding, absent values); executor
  tests with a mocked `fetch` (timeout, non-2xx, oversize, invalid JSON,
  offline, `cache: 'no-store'` set, redirects refused, production refusal
  of `http://` and of loopback hosts under any scheme including
  IPv4-mapped IPv6 literals); the sample collector applies the same identity
  strategy as the live path (supplied `id` when present, else the
  content-only hash), so a sampled node is excluded from a live roster
  containing the same row; two stage entries produce two network
  requests (the HTTP-cache bypass is observable, not assumed); adding or
  removing a node within the stage neither refetches nor resets the roster
  (entry snapshot, §5.4); navigating away mid-flight aborts the request and
  its download; content-only
  hash stability under reorder and dedup across refetch; identity tests for
  the Decision 3 amendment — an id-bearing row whose attributes change
  between fetches keeps one `_uid` and is not re-offered (the cross-wave
  case, which must fail if the pipeline falls back to the content hash), a
  response mixing id-bearing and id-less elements keys each by its own
  strategy, and two dynamic assets of the same subject type returning the
  same id yield one node (the documented namespacing consequence, asserted
  so it cannot regress silently); serialization
  omits encrypted attributes (tested against an encrypted network) and
  response parsing strips nullish values exactly as the static parser does;
  `useExternalData` retry and auto-retry-on-reconnect; the minNodes gate is
  suspended in the error state _and_ the ready-but-exhausted state, and
  restored on recovery; Storybook stories for the roster error/retry states
  (loading, offline, server failure) — Chromatic covers them.
- **Interview e2e matrix:** the `verifying-an-interface-change` skill
  applies — NameGeneratorRoster and panels change behaviourally; add a
  matrix configuration with a dynamic source served by Playwright route
  interception, and update ARIA snapshots for the retry states. Visual
  baselines per `preparing-e2e-visual-baselines` if pixels move.
- **Architect e2e:** create a dynamic roster resource against an intercepted
  endpoint, run the test request (overriding a scalar test value), configure
  a roster stage from its sample columns; edit the request and confirm save
  is blocked until a fresh test succeeds and the accepted edit re-keys the
  asset with references rewritten; confirm Preview executes the live
  (route-intercepted) request with the synthetic context substituted and an
  embedded network containing only nodes from stages before the preview
  start stage (§5.9), shows the fetched rows, and shows
  the error + retry state when the intercepted endpoint fails; confirm
  synthetic state generation reads the sample without issuing any request.
- **Interviewer:** session-gate dialog for a dynamic-roster protocol while
  offline; import rejects a malformed sample; re-import tests proving a
  same-hash re-import (metadata, v8→v9) replaces the stored document, that
  one with differing `experiments` is rejected, and that a request edit or
  sample refresh on a referenced asset arrives as a new protocol; a
  same-hash name edit does not change `{{protocol.name}}` for an existing
  session (snapshot, §5.2); the Workbox config registers the cross-origin
  fetch `NetworkOnly` route before every extension cache (same assertion
  in Architect's config).
- **Fresco:** `mapInterviewPayload` carries `request` from the asset row
  and `caseId` carries the participant identifier (the `getInterviewById`
  include); import persists `request`/`sampleOf` and the embedded protocol
  name, and rejects a malformed sample; `{{protocol.name}}` resolves to the
  document name, not the archive filename (cross-host substitution test);
  the participant payload contains no dynamic-roster sample URL; a
  same-hash name edit does not change `{{protocol.name}}` for an existing
  interview (snapshot, §5.2);
  `generate-test-interviews` draws roster nodes from stored samples;
  regression tests for the same-hash in-place update — a v9 re-import of an
  untouched v8 protocol updates the stored `schemaVersion`, a metadata
  re-import takes effect without deleting the protocol or its interviews, a
  same-hash import with differing `experiments` is rejected, and a request
  edit or sample refresh on a referenced asset imports as a new protocol
  while existing interviews keep the old one; the deploy-time
  migrate-to-current script leaves a conformant v9 row untouched and
  migrates a v8 row exactly once (§5.12).
- **Oracle discipline:** every "fetch was not made" assertion (synthetic
  generation, column pickers) must fail when a fetch _is_ made, and
  Preview's "fetch was made" assertions must fail when it wasn't — assert
  via route interception counters, not absence of visible change
  (`writing-an-oracle-that-can-fail`).

## 10. Documentation

- New page: _Building a dynamic roster endpoint_ — request anatomy,
  placeholder table, canonical response shape (including the optional
  per-node `id`, when to send one, and the stability and namespacing
  obligations it carries — Decision 3 amendment), CORS/preflight
  obligations, no-redirect requirement (§5.4), idempotency requirement,
  key-visibility warning (§6.6), and the sample-content privacy guidance
  (§6.11).
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
(minor), `@codaco/protocol-utilities` (minor), `@codaco/sample-protocol` and
`@codaco/development-protocol` (**major** each — their published payloads
jump to schema 9, and the mirror-sync guard requires the compatibility
packages to change with the canonical `packages/protocols` content),
Architect, Interviewer, Fresco (minor each). The §10 documentation
pages ship as a **separate changeset in the Documentation lane** — the
Documentation app is a separately gated product and `pnpm check:changesets`
rejects mixing it into the normal lane. Suggested implementation
sequence (one plan, PRs may be combined): (1) schema 9 + migration +
validation + shared helpers, (2) interview runtime + retry UX, (3) Architect
authoring + preview, (4) hosts + CSP + docs. E2E suite selection follows from
the workspace dependency closure as usual.

Sequencing constraint: the schema-8 corrections work (2026-08-25 — post-release
tightenings that stay in schema 8 as validation errors, with its own spec in
its corrective PR) merges **first**. The 8→9 move then carries the corrected
tree, so schema 9 is born with the corrections rather than racing them. That
work's scope rule and this one are complementary: corrections of flaws in a
released schema stay in that schema; a new capability is a contract change and
bumps the version.
