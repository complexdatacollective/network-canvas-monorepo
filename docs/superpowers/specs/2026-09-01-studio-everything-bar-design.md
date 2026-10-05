# Studio Everything Bar Design

Issue: #1243 (Platform foundation)
Related: #1561 (app shell — the header this bar mounts in), #1242
(specification tree), #1272 (editor foundation), #1315 (WCAG component
foundations), #1317 (researcher-UI accessibility), #1310 (Studio UI
localization), #1262 (study model), #1263 / #1264 (participants), #1285
(gallery), #1259 (audit log), and the documentation app's search pipeline.

Design mockups with decision callouts:
<https://claude.ai/code/artifact/5b3e0f5f-769b-45f7-a23c-3078cb084184>

## 1. Summary

The app shell (#1561) gives Studio a header, four area sidebars, and roughly
forty researcher-facing destinations once the specification tree is built out.
Every one of those destinations, every action a researcher can take, and every
page of user documentation currently has exactly one path to it: know where it
lives, and click there.

The **everything bar** is a single search-and-command surface mounted in the
app shell's header and opened from anywhere with `⌘K` / `Ctrl+K`. A researcher
types what they want — a place, a thing, an action, or a question — and the bar
answers from three sources:

1. **Go to** — destinations in the researcher's current context and entities
   (studies, templates, and later participants and sessions) across everything
   they can access;
2. **Commands** — actions the researcher can take, with their keyboard
   shortcuts shown inline; and
3. **Documentation** — the documentation site's search index, held and
   served by the instance, with Studio-relevant pages ranked first.

The bar is a launcher, not an executor: it takes the researcher to the place
where something happens, and never performs the action itself. It cannot show
a destination the chrome would hide or an action the server would refuse,
because it reads the same permission-aware sources the chrome reads.

## 1.1 Decisions this design records

Taken 2026-09-01 in specification review:

1. **One bar, three sources.** Navigation, commands, and documentation share a
   single surface with fixed group order. There is no separate docs-search
   widget, command palette, and quick switcher.
2. **Launcher, not executor.** A command result navigates to the screen that
   owns the action, or opens that screen's existing dialog. The bar itself
   never issues a mutation, so confirmation flows, permission checks, and
   audit producers stay exactly where their owning features put them.
3. **One manifest feeds the sidebar and the bar.** Each area's navigation is
   declared as data; `NavList` renders it and the bar searches it. Parity is
   structural, not maintained by hand.
4. **Entity search is server-owned** and spans every team the researcher
   belongs to, ranked current-study first, current-team second.
5. **Documentation is searched inline, from an index the instance holds.**
   The documentation site's build publishes a search-index artifact; Studio's
   server caches it and answers documentation queries itself, so results
   render as the researcher types, exactly like the other groups, and no
   query ever leaves the instance (invariant 5). Studio-relevant pages are
   tagged with a `products` field and boosted, never filtered — every docs
   page remains findable. Results open the documentation site; Studio does
   not embed a second docs renderer.
6. **One shortcut registry owns every binding.** `⌘K` opens the bar.
   Manifest entries and commands declare their chords (`g` then `a` for the
   activity log), and a single Studio-local shortcut registry aggregates
   them, detects collisions at test time, binds the global handlers, and is
   the only source the bar's hints render from. A shortcut cannot drift from
   the entry that advertises it, and two entries cannot silently claim one
   chord.
7. **The component is shared.** The dialog, input, listbox, grouping, and
   keyboard model land in `@codaco/fresco-ui` as `navigation/EverythingBar`,
   built on Base UI's autocomplete and dialog primitives already in the
   package's dependency set. Studio supplies the providers; the contents are
   Studio's information architecture and stay app-local.
8. **Participant results are gated and arrive with the participants
   feature.** Records that identify a person appear only for researchers
   holding the PII grant, are never written to the bar's local recents, and
   the search procedure registers its audit classification with #1263/#1264
   under the audit specification's producer policy.
9. **Registering with the bar is an acceptance criterion.** Every future
   researcher-facing feature registers its destinations and commands as part
   of landing, the same way the audit specification makes event producers
   part of each owning feature.

Alternatives considered and rejected are recorded in §11.

## 2. Requirements

### 2.1 Fundamental requirement

From any researcher screen, a researcher can type what they want — a place, an
action, or a question — and reach it without knowing where it lives, with a
keyboard or screen reader as directly as with a mouse.

### 2.2 Invariants

These hold for the bar from this design forward. Each is testable; §12 says
how.

1. **Parity.** Every destination reachable through the shell's chrome is
   reachable through the bar, because both render the same manifest. A
   destination cannot exist in one and not the other.
2. **No new surface.** The bar never widens what a researcher can see or do.
   Destinations and commands are permission-filtered by the same
   `study.shell` / team capability data the chrome uses, the server check
   remains the boundary, and activating a result lands on a screen that
   enforces it.
3. **No mutations.** The bar issues navigation and opens existing surfaces.
   It calls no mutation procedure.
4. **Selection stability.** The highlighted item is tracked by its
   provider-qualified identity, never by list position. Late asynchronous
   results insert into their ranked position within their group (§3.4) —
   a current-study entity arriving after local destinations still ranks
   above them — but an insertion can never change which item is highlighted,
   and group order itself never changes.
5. **Query privacy.** Query text never leaves the instance. Every provider —
   including documentation — is answered by the instance itself; the only
   automatic outbound documentation traffic is the server's periodic index
   refresh (§5.5), which carries no researcher input. A query typed to find
   a participant or a confidentially named study therefore cannot reach a
   third party, in any group, on any keystroke. Explicitly activating a
   documentation result is the researcher choosing to visit the
   documentation site: that navigation carries the result's URL and never
   the query text.
6. **PII gating.** No identifying participant data appears in results without
   the PII grant, and providers whose persistence policy forbids it can never
   have results written to locally persisted recents.
7. **App shell only.** The bar is app-shell chrome. Site, focused, and
   participant shells never mount it — a participant can never open a
   researcher search surface.
8. **Localized whole strings.** Every label, group heading, hint, and empty
   state is a whole translatable string; documentation results respect the
   researcher's locale with an explicit fallback.

## 3. What the bar returns

### 3.1 Go to

Two kinds of result share the group, because researchers do not distinguish
"screen" from "thing" when typing a name:

- **Destinations** — every permission-filtered manifest entry the researcher
  can reach: the current study's areas, its team's administration, account,
  and the platform destinations (gallery, templates), labelled with their
  area ("Activity log · Team"). Search spans all of them — from a study
  screen, typing "activity" finds the team's activity log, which is the
  fundamental requirement at work; only the empty state (§3.5) narrows to the
  current area. Chord hints render on destinations that have them.
- **Entities** — studies across every team the researcher belongs to (labelled
  with their team when the researcher has more than one), templates, and —
  when their owning features land — participants, sessions, and published
  protocol versions. Activating an entity navigates to its canonical route
  (`/study/$studyId`, `/gallery/$templateId`, …); for a study in another
  team, that works because the URL owns the study and `study.shell` derives
  and reconciles the team (#1561 invariant 1, §6.3) — no team-scoped URL is
  needed.

### 3.2 Commands

Actions the researcher can take, each resolving to the screen or dialog that
owns it:

- global commands — create a study, import a protocol, switch team, open
  language settings, sign out;
- area commands contributed by each area's registrations — invite a team
  member (team area), create an API token (account area), pause collection
  (study settings, once #1262's lifecycle controls exist).

Every command, including these, is expressed as the §5.1 activation union —
a route, or a route plus a surface its screen owns. "Sign out" is the
instructive case: signing out is not a screen, so the command opens the
account area's sign-out confirmation surface, and confirming there runs the
existing navigate-verify-release sequence the shell preserves (#1561 §6.5).
The bar launched it; the account area performed it. A command that cannot be
expressed this way does not belong in the bar.

Like destinations (§3.1), search spans every permission-filtered command the
researcher can reach, not only the mounted area's — from a study screen,
typing "invite" finds the team's invitation command. The current area's
commands rank first (§3.4); only the empty state narrows to them.

A command a researcher lacks the capability for is absent, not disabled and
not annotated — matching the shell's permission-aware navigation rule and
invariant 2. The concept mock's "Requires Manager role" teaching row is
deliberately not adopted: a result the researcher cannot activate is either a
new-surface leak (if activatable) or a new non-launching result type (if
not), and role teaching belongs in documentation and the owning screens.

### 3.3 Documentation

Results from the documentation index the instance holds (§5.5), rendered
inline as the researcher types — documentation is a peer of the other groups,
not a mode behind an extra step. Results come in the researcher's
documentation locale, with pages tagged `studio` boosted to the top of the
group (§6). Each result opens the documentation site in a new tab —
deliberately leaving Studio, because a half-embedded docs reader would fork
the documentation experience and its locale negotiation.

Serving the index from the instance rather than querying a third-party search
API is what makes inline search safe: the bar is where researchers type
participant names and confidentially named studies, and those keystrokes
never leave the instance (invariant 5). The documentation site's own search
box keeps its Algolia DocSearch — someone typing there has chosen
documentation search; the bar cannot make that assumption.

### 3.4 Group order and ranking

Groups render in fixed order — **Go to**, **Commands**, **Documentation** —
matching how often each is wanted. Within Go to: current-study destinations
and entities first, then current team, then other teams, then platform; ties
break by last-modified, then name, then the immutable id — the final key is
unique, so the ordering is total and a pagination cursor can resume at any
boundary without skipping or repeating rows. Within Commands: the current area's
commands first, then other areas', then global. Within Documentation: the
index's lexical ranking with the Studio-tag boost (§6).
Result counts per group are bounded (five per group by default, with a "show
more" affordance per group) so the first Enter press is predictable.

There is deliberately no interleaved relevance-scored single list: a stable
group order is what makes the bar learnable, and cross-source scores are not
comparable anyway.

### 3.5 The empty query

Opening the bar without typing shows:

- recent activations (locally persisted, §5.6), excluding sensitive
  providers;
- the current area's destinations; and
- the current area's top commands.

Each item renders once: an activation that appears in recents is removed
from the inventory-derived sections below it (recents take precedence), so
one provider-qualified key never renders twice — duplicate React keys and
`aria-activedescendant` targets are structurally impossible in the empty
state.

This makes the bar useful as pure navigation — open, arrow down, Enter —
without requiring a query.

## 4. Interaction model

- **Open**: the header search affordance (rendered as a search field with a
  shortcut hint, like the documentation site's search button), or `⌘K` /
  `Ctrl+K` from any app route. The hint and every rendered mention of the
  shortcut show the platform's actual modifier — `⌘K` on macOS, `Ctrl+K`
  elsewhere — and the accessible label names the same binding. The shortcut
  is registered at the app-shell layout, so it works identically everywhere,
  including the editor.
- **Type**: local inventories (destinations, commands) filter synchronously
  on every keystroke. The entity and documentation providers debounce, abort
  superseded requests, and render into their groups with per-group pending
  indicators — both are answered by the instance's own server. A response
  commits only when its query generation matches the current input; aborting
  cannot revoke a promise the network already fulfilled, so a stale response
  that resolves after supersession is discarded, never rendered under the
  newer query. Late results insert at their ranked position within their
  group, and the highlighted item is preserved by identity (invariant 4);
  when an insertion above the highlight would push the highlighted item past
  the group's visible bound, the group's window extends to keep it rendered
  — `aria-activedescendant` always references a mounted option, and a
  keyboard user never watches their selection vanish.
- **Navigate**: arrow keys move through the flat result sequence across
  groups — a group's "show more" affordance is a row in that sequence, so
  arrowing past the last visible result reaches it and `Enter` reveals the
  next page with the highlight staying on the first revealed item. `Enter`
  on a result activates; `Esc` closes and returns focus to wherever it was.
  A footer row shows navigate / select / close hints, translated.
- **Activate**: destinations and entities are ordinary router navigations, so
  the editor's dirty-state blocker (#1561 §6.5) applies without special
  handling; a blocked navigation leaves the bar closed and the blocker's own
  dialog in charge. Commands navigate or open their owning dialog.
  Documentation opens in a new tab.
- **Chords**: outside the bar, `g` followed by a destination key navigates
  directly (`g` then `a` — activity log). Chords are declared on manifest
  entries and commands, aggregated and bound by the single shortcut registry
  (§5.3), displayed as hints in the bar's results, suppressed while focus is
  in an editable field, and disabled entirely when a dialog is open. The
  default chord set ships with the study and team areas' manifests; the exact
  keys are recorded there, not here.

## 5. Architecture

### 5.1 Provider seam

`@codaco/fresco-ui` defines the interface; apps supply implementations:

```ts
type EverythingBarItem = {
  id: string;
  group: 'go-to' | 'commands' | 'documentation';
  label: string;              // already translated
  context?: string;           // "Team", "Study · Field Research Lab"
  rank: {
    tier: number;             // the §3.4 bucket, provider-normalized:
                              // 0 current study/area → 3 platform/global
    position?: number;        // the provider's own order within the tier
                              // (a server-ranked page keeps its relevance order)
    recency?: string;         // ISO timestamp for within-tier ordering
  };
  chordHint?: string[];       // ['G', 'A'], read from the shortcut registry
  activate:
    | { kind: 'navigate'; href: string }
    | { kind: 'open'; href: string; surface: string }  // owning route + surface (below)
    | { kind: 'external'; href: string };    // documentation
};

type EverythingBarProvider = { id: string } & (
  | {
      // Local: a synchronous inventory. The component filters, matches,
      // ranks, and pages it itself, on the same keystroke — no promise, so
      // a local result can never be mistaken for a late remote one.
      local: true;
      items(): EverythingBarItem[];
    }
  | {
      // Remote: a debounced, abortable, paged search.
      local: false;
      search(
        query: string,
        signal: AbortSignal,
        cursor?: string,      // continuation from a previous result's `next`
      ): Promise<{ items: EverythingBarItem[]; next?: string }>;
      empty?(signal: AbortSignal): Promise<EverythingBarItem[]>;
    }
) & (
  | {
      persistence: 'recents';
      // Required on this branch: recents are stored as references and must
      // be revalidated against current permissions before rendering (§5.6).
      resolve(id: string): Promise<EverythingBarItem | null>;
    }
  | { persistence: 'never' }  // no resolve, no per-item opt-in
);
```

Item identity is provider-qualified: the component keys every result as
`providerId:itemId` and uses that key for highlighting, activation, React
reconciliation, and `aria-activedescendant`. Two providers returning the same
natural id — a destination and a command both named "settings" — therefore
cannot collide, and recents already store the same provider-plus-id pair.

`rank` is how §3.4's ordering crosses the seam: providers normalize their own
context into the tier. In Go to, tiers follow resource ownership for
destinations and entities alike — current study → 0, its team → 1, other
teams → 2, platform → 3 — so a study destination stays tier 0 from every
screen of that study, and on a team screen a team destination shares tier 1
with team entities rather than outranking them. Commands tier by area:
current area → 0, other areas → 1, global → 2. The component merges every
provider's
items within a group by tier, then position (ascending, when given), then
recency (descending), then label, then the provider-qualified key as the
total-order final tie-breaker, with absent optional fields placed
deterministically: within a tier, items carrying `position` precede items
without one, and among the positionless, present `recency` precedes absent.
Two valid implementations cannot disagree about the first result or a
pagination window because a comparison involving a missing field is defined,
not implementation-chosen. `position` is how a provider whose server
already ranked its results keeps that order through the merge — the
documentation provider assigns each item its absolute position in the
query's accumulated result sequence (a second page continues from the count
already delivered, never restarting at zero), so the merge cannot
alphabetize away §5.5's ranking or interleave pages; the entity provider
omits it and orders by recency. Without a
normalized rank the component could only concatenate provider outputs, and a
late current-study entity could never sort above an already-rendered
lower-tier destination.

Within one provider, item ids must be unique across its complete inventory —
the qualified key only separates providers from each other. A provider that
aggregates sources namespaces its ids, and an id must denote the same
destination regardless of where the researcher currently is: the destination
provider derives `area:resourceId:entryId`
(`study:st_42:settings`, `team:tm_7:members`), never a context-relative
`study:settings` that would silently retarget a persisted recent to
whichever study is current when it is resolved (§5.6). Platform entries need
no resource segment. A registry test asserts per-provider uniqueness.

The `open` variant deliberately carries no callback. It is declarative route
plus surface: `href` is the owning screen's route and `surface` an identifier
that screen registers ("members.invite", "participants.import"). Activation
navigates to the route, and the destination screen opens its named surface on
arrival — which is what makes a cross-area command work when its owner is not
mounted: "Invite a team member" selected from a study screen navigates to the
members screen and opens its invitation flow there. An opaque
`run: () => void` would let a command hold a mutation the registry test could
never see; a route the shell navigates and a name the destination resolves
keep the launcher rule (invariant 3) statically checkable: the registry test
can assert every activation is a route, an external link, or a route paired
with a surface the named screen registers, and nothing else is expressible.

`persistence` is required on the provider, not optional on the item, for the
same reason: a sensitive provider that forgot to mark one participant row
would otherwise leak an identifying label into `localStorage`. A provider
declared `'never'` has no per-item escape hatch.

Continuation is a property of the group, not of any one source. Each group
renders one "show more" row whenever anything remains: local matches beyond
the bound, remote items fetched but unrevealed, or a provider holding a
`next` cursor. Activating it reveals the next bounded slice of the group's
merged total order, and the frontier rule decides which fetches that
requires: every provider delivers its results in its own
merged-order-compatible ranking, so nothing in a provider's unfetched
continuation can rank ahead of the last item it has already delivered — its
frontier. A held row may be revealed once it ranks ahead of every
cursor-holding provider's frontier; the component fetches a provider's next
page only when the slice would read past that provider's frontier. This is
what keeps both failure modes out: held rows are never revealed ahead of a
page that could outrank them, and a multi-cursor group does not fetch every
provider on every activation and accumulate unbounded unrevealed buffers. A
mixed group therefore cannot strand one source's results behind another's
pagination, never reveals more than the slice, and never reveals a slice
out of merged order.
Studio's remote providers pass cursors straight through to their procedures'
`cursor`/`nextCursor` (§5.4, §5.5); a sixth matching local destination is
reachable, not silently cut (invariant 1). Late and revealed results honour
selection stability (invariant 4) on both paths.

A rejected provider `search` (other than an abort the component itself
issued) is caught by the component: the group's pending indicator clears and
the group renders a localized, retryable error row in place of results — a
transient RPC failure is never an unhandled rejection, an indefinite
spinner, or a false "no matches". This is per-search failure handling,
distinct from §5.5's documentation-unavailable state, which describes an
instance whose index never loaded.

The component owns matching over local inventories (case- and
diacritic-folded substring and initials matching), the keyboard model,
grouping, bounds, pagination, error containment, and recents. Providers own
what exists and whether the researcher may see it.

### 5.2 The navigation manifest

Each area layout (#1561 §5.3) declares its navigation as data:

```ts
type NavManifestEntry = {
  id: string;
  labelKey: string;             // whole-string translation key
  href: string;
  icon?: ComponentType;
  access: Capability | 'public';  // required: a typed capability key, or explicitly public
  topology: 'both' | 'managed' | 'self-hosted';  // required, like access
  chord?: string;               // the key after 'g', contributed to the shortcut registry
};
```

`access` is required, exactly as the command registry requires it: an entry
must name the capability that gates it or declare itself `public` on purpose,
and `Capability` is the typed key union of the authorization vocabulary — a
mistyped capability is a type error, not a destination that silently
disappears for everyone while the parity test still passes. The command
registry uses the same type.
An optional field would make a forgotten gate indistinguishable from an
intentionally public route, and the parity test would pass while both the
sidebar and the bar exposed a destination the researcher cannot use. The
server denial remains the boundary either way; this keeps the chrome honest.

`topology` carries the shell's deployment-mode gating (#1561 §10.4) into the
shared filter, and it is required for the same reason `access` is: an entry
must say `'both'` on purpose, because an omitted classification defaulting to
both is exactly how a managed-only destination would leak into self-hosted
chrome. A managed-only destination such as team billing declares
`topology: 'managed'`, and the one manifest filter — capabilities from
`study.shell`/team context plus the deployment mode from `ShellContext` —
produces the entry set that both `NavList` and the bar consume. Capability
filtering alone could not remove a managed-only route on a self-hosted
instance, and the shell 404s it server-side; the chrome must not offer a dead
door.

There is no manifest-less chrome: the platform destinations the header
renders (gallery, templates, account) are themselves a platform manifest, and
the header renders it the way area sidebars render theirs. A header link
cannot be added outside the manifest, so the parity invariant covers the
header too. `NavList` renders each area's manifest; the bar's destination
provider searches the filtered union of every manifest the researcher can
reach (§3.1), not only the mounted area's. This is the structural parity
guarantee: adding a route means adding a manifest entry, and that one
addition surfaces it in its chrome, the bar, and the shortcut registry at
once. If #1561's slice 2 ships its sidebars or header links as JSX before
this design lands, converting them to manifest data is the first task of this
design's slice 2.

### 5.3 The command and shortcut registries

The **command registry** is a typed registry, Studio-local, mirroring the
manifest's shape plus an `activate`. Area layouts contribute contextual
commands via the same mechanism they use to declare their sidebar; global
commands register at the app layout. A registry test enumerates every entry
and asserts a label key, a capability or an explicit `public` marker, a
topology classification, and an activation that is a route, an external
link, or a route paired with a surface its screen registers (§5.1) — the
launcher rule made structural.

A command whose availability depends on resource state — pause collection
exists only while a study is collecting — declares an `availability`
predicate: a pure function of the shell context (`study.shell`'s study state
and permissions), evaluated by the same registry filter that applies
capability and topology. This matters precisely for cross-area commands,
whose owning layouts are unmounted and cannot conditionally withhold their
registrations. The predicate reads already-fetched context and performs no
IO; the owning screen remains the enforcement, exactly as with capability
gating — the predicate only keeps the bar from offering a launch to a screen
that cannot perform the action.

The **shortcut registry** is the single authority for key bindings. Manifest
entries and commands _declare_ chords; they do not bind them. The registry
aggregates every declaration, binds the global handlers (`⌘K` and the
`g`-chords), and is the only source the bar reads hints from — `chordHint` on
an item is derived, never authored. Two declarations claiming one chord in
any reachable combination of areas is a test failure, not a runtime
last-writer-wins. This is what decision 6 means by one owner: declaration is
distributed with the features, binding and display are centralized.

### 5.4 Entity search

One new query procedure in `@codaco/studio-rpc`:

```ts
search.entities({ query, context: { studyId?, teamId? }, limit?, cursor? }) -> {
  items: Array<
    | {
        scope: 'team';                    // team-owned entities
        kind: 'study' | ...;              // extended by owning features
        id: string;
        label: string;
        teamId: string;
        teamLabel: string | null;         // null when the researcher has one team
        updatedAt: string;
      }
    | {
        scope: 'study';                   // study-owned entities (sessions,
        kind: ...;                        // published versions — added by owners)
        id: string;
        label: string;
        studyId: string;
        teamId: string;
        updatedAt: string;
      }
    | {
        scope: 'platform';                // platform-level entities (#1561 §4)
        kind: 'template' | ...;
        id: string;
        label: string;
        updatedAt: string;
      }
  >;
  nextCursor: string | null;
}
```

The branches follow the accepted ownership model, and each carries every
identifier its kind's canonical route requires — the provider constructs
hrefs from the result alone and never performs a second lookup. Templates and
the gallery live above teams, so the platform branch has no tenant to
attribute; a shape that required `teamId` on it would force the server to
invent one. Study-owned kinds (sessions at `/study/$studyId/sessions/…`,
published versions at `/study/$studyId/versions`) carry their `studyId` on
the study branch when their owning features add them. `limit` defaults to the
group bound in §3.4 and is server-capped; `nextCursor` is what the group's
"show more" affordance requests the next bounded page with. The ordering ends
in the immutable unique key (scope, team, id) per §3.4, and the cursor
encodes the full ordering tuple — keyset pagination over a total order, so
equal last-modified values and duplicate display names cannot make a page
boundary skip or repeat rows.

The server resolves the researcher's memberships once, searches each team
under its own tenant scope (row-level security intact — no cross-team query),
bounds results per kind, and applies the context-first ranking in §3.4.
Matching is name-prefix and substring on display names; anything cleverer is a
ranking refinement inside the procedure, not a contract change.

Inputs are bounded at the RPC boundary, shared by both search procedures: a
`query` that must be non-empty after whitespace normalization and within a
server-enforced maximum length (an empty or oversized query is rejected —
the debounced UI never produces either, so only a bypassing client hits
them), a capped `limit`, and a cursor that must parse. The result `limit`
bounds output; the query bounds are what keep a hostile client from turning
the matcher and ranker into a scan over every visible row or feeding them
unbounded input.

`search.entities` is non-sensitive by contract: every kind it can ever return
is metadata a team member may see. Under the audit design that makes it an
excluded ordinary read — "opening non-sensitive metadata lists" is outside
the log's scope (audit design §7.2), and the audit command registry
classifies mutations, so a read-only query carries no registration at all.
Sensitive kinds never join it — participants arrive as their own procedure
called by their own `persistence: 'never'` provider (§7), and that procedure
is a sensitive read under the audit design's audited-read path, so the server
response shape, the audit policy, and the persistence policy share one
boundary. A mixed procedure would either fetch participant-identifying rows
on every ordinary study search or force the safe kinds out of recents along
with the sensitive one.

### 5.5 The documentation provider

Documentation search runs against an index the instance holds, not a
third-party query API. The documentation site's build emits a search-index
artifact set (§6); `STUDIO_DOCS_INDEX_URL` names the **manifest**, and the
manifest references each schema major's per-locale artifacts by relative
path, resolved against the manifest's own URL — which is what makes a mirror
a straight directory copy and lets Studio discover the locales and majors
without a second setting. The server fetches the manifest, selects its
supported schema major and the needed locales, caches the artifacts, and
revalidates periodically with conditional requests and last-good semantics —
a failed refresh keeps serving the cached index rather than losing the
group. One query procedure serves the SPA:

```ts
search.documentation({ query, locale, limit?, cursor? }) -> {
  items: Array<{
    title: string;
    hierarchy: string[];    // section → page → heading
    url: string;            // absolute, into the documentation site
    lang: string;
    products: string[];
    excerpt: string;
  }>;
  nextCursor: string | null;
}
```

The query runs server-side over the cached index — that is the contract, not
one of two permitted layouts, so the procedure, its ranking, and its bounds
are the single documentation-search path. `limit` defaults to the group bound
in §3.4 and is server-capped; a common query matching many heading records
returns one bounded page, and the "show more" affordance requests the next
with `nextCursor` — the server never streams the whole matching index at a
keystroke. The Studio-tag boost is applied _into_ the ranking score — a
fixed additive boost to any record whose `products` includes `studio` —
never as a subsequent sort key, which would demote it to a tie-breaker that
only ever reorders exact score ties. The resulting ordering is total, as
§5.4's is: boosted score, then the record's anchored URL as the immutable
unique final key, with the cursor encoding the full tuple, so tied scores at
a page boundary cannot skip or repeat records. The procedure shares §5.4's
input bounds: a non-empty normalized query up to the maximum length, capped
limit, parseable cursor.

Ranking is the index's lexical ranking with a fixed boost for records whose
`products` includes `studio` — a boost, never a filter, so every
documentation page stays findable. The locale filter uses the researcher's
Studio locale when the index manifest publishes it and `en` otherwise; the
published-locale list ships in the index manifest, never guessed (today it is
`['en']`).

The artifact contract is versioned (§6): the manifest maps every published
schema major to its artifacts, Studio selects its supported major from that
map and fetches those paths, and every fetched artifact is validated against
Studio's schema before it replaces the cached index — an unparseable or
wrong-major artifact is rejected, the last-good index keeps serving, and an
operational signal is raised. The
documentation site and Studio release independently (separate release lanes),
so a docs deploy publishing a newer schema must not be able to silently take
documentation search away from a running Studio.

`STUDIO_DOCS_INDEX_URL` joins the server env catalogue, defaulted at the
resolve layer to the documentation site's published index, so both the
managed and self-hosted topologies get documentation search out of the box.
An operator can point it at a mirror, or set the literal value `off` to
disable it — a sentinel rather than an empty string, because the env
boundary's `emptyStringAsUndefined` folds an empty value back into the
default and would make "set it empty" silently re-enable the feature.

Absence and failure are distinct states. With `off`, documentation search is
intentionally not part of this instance: the Documentation group does not
exist and the rest of the bar is unaffected. With a configured URL whose
manifest or artifacts have never successfully loaded (or whose last fetch
failed validation with no last-good index to fall back on), the group
renders §8's documentation-unavailable state as text — a researcher must be
able to tell "this instance has no documentation search" from "documentation
search is broken", and an operator must not be able to mistake a fetch
failure for a clean disable.

### 5.6 Recents

Activations from providers declaring `persistence: 'recents'` are recorded to
`localStorage`, most-recent-first, bounded, keyed per researcher — the same
local-persistence posture as the shell's sidebar collapse memory. Items from
a `'never'` provider are never written (invariant 6).

A stored entry is a reference — provider id and item id — not a snapshot to
render. On open, the empty state resolves each reference through the
provider's `resolve` against the researcher's _current_ permissions; an entry
that no longer resolves (membership lost, capability revoked, entity deleted
or renamed away) is discarded and pruned from the store, never shown from the
stale label. Rendering the stored label directly would resurrect
destinations the researcher can no longer use and labels that no longer
exist. Recents are a convenience, so a missing, cleared, or wholly
unresolvable store renders the empty state's other content and nothing
breaks.

## 6. Documentation pipeline changes

Two changes in the documentation app make the instance-held index exist:

1. **Frontmatter.** Documentation pages gain an optional `products` list
   (`products: [studio]`; a page may name several products). Untagged pages
   are simply unboosted — no migration of existing content is required.
2. **Index artifact.** The documentation build emits a search index — one
   record per heading-anchored section, carrying title, hierarchy, absolute
   URL, locale, workflow section, `products`, and a bounded content excerpt —
   published under schema-versioned paths
   (`…/search-index/v1/<locale>.json`), together with one manifest mapping
   every published schema major to its per-locale artifact paths, alongside
   the published locales and the content version — a map, not a single
   major, because the manifest must advertise v1 and v2 simultaneously while
   a Studio release consuming v1 remains supported. The docs app already
   renders structured MDX with per-page frontmatter; the index is a build
   output of that same pipeline, not a crawler product.

   The versioned path is the compatibility contract between two products
   that release independently: a schema change is a new major published at a
   new path, and the build keeps emitting every major a supported Studio
   release consumes until that support is explicitly dropped — majors are
   cheap static artifacts of the same build. Studio's side of the contract
   (fetch its supported major, validate before replacing the cache, keep
   last-good on failure) is §5.5.

The documentation site's own Algolia DocSearch is untouched — it keeps its
crawler and its own search UI, where querying a third party is fine because
the visitor has chosen documentation search. Studio deliberately does not
query Algolia: bar queries include participant names and confidentially named
studies, and typing in Studio must never send text to a third party
(invariant 5). As Studio documentation is written (#1242 has no documentation
epic — pages land under the existing sections), tagging is part of authoring.

## 7. Permissions, PII, and audit

The governing rule is invariant 2: the bar reads permission-filtered sources
and launches permission-enforcing screens, adding no checks of its own and
bypassing none.

- **Destinations and commands** filter on the capabilities `study.shell` and
  the team context already deliver. The server denial path behind every gated
  destination (#1561 invariant 4) is what makes this safe rather than
  merely tidy.
- **Entity search** enforces membership server-side per team scope. Studies
  and templates are non-sensitive metadata, so the procedure is an excluded
  ordinary read under the audit design's §7.2 — outside the audit log and
  outside the mutation command registry, which classifies mutations, not
  reads (§5.4).
- **Participants** are the sensitive case, and they arrive with #1263/#1264,
  not before. When they land they are their own procedure and their own
  provider, never new kinds on `search.entities` (§5.4): results identifying
  a person are returned only to holders of the PII grant (absent otherwise —
  masked rows would still leak existence); the procedure registers its audit
  classification under the audit specification's "viewing
  participant-identifying information" policy at that time; and the provider
  declares `persistence: 'never'`, which keeps every result out of local
  recents with no per-item opt-out (§5.1, §5.6). One boundary carries the
  response shape, the audit policy, and the persistence policy together. The
  bar's architecture treats this as one more provider — nothing in the
  component changes.
- **Opening the bar and typing** — the interaction itself, and the
  non-sensitive reads it triggers (`search.entities`,
  `search.documentation`) — is ordinary navigation, excluded from the audit
  log per the audit specification's §7.2 exclusions. The exclusion is about
  what the read returns, not how it was triggered: an RPC that returns
  participant-identifying rows is a sensitive read and is audited under its
  own policy (the participants bullet above) even when a debounced keystroke
  issued it.
- **Documentation queries** never reach a third party. They are answered
  from the instance's cached index (§5.5); the only automatic outbound
  documentation traffic is the server's periodic index refresh, which
  carries no researcher input. Activating a documentation result navigates
  the browser to the documentation site by the researcher's explicit choice,
  carrying the result's URL and never the query text.

## 8. Accessibility

- The bar is a Base UI dialog containing the ARIA combobox pattern Base UI's
  autocomplete implements: `role="combobox"` input, `role="listbox"` results
  with `role="group"` per section, `aria-activedescendant` selection, result
  counts announced politely on settle — one announcement per settled query,
  not one per arriving provider.
- Focus is trapped while open; `Esc` restores focus to the trigger or prior
  element; activating a destination hands off to the route-change focus
  contract (#1561 §7.2) — the destination's `h1` receives focus under the
  existing focus-was-lost rule.
- Chord shortcuts are advertised in the bar (hints on destinations), operable
  without them, suppressed in editable fields, and listed on the account
  area's keyboard-shortcuts reference so they are discoverable outside the
  bar itself.
- Motion (dialog entry, group settle) uses the shared `MotionSpring` presets
  gated on `useReducedMotion()`.
- Every state — empty, pending per group, no results, docs unavailable — is
  rendered text, not just a spinner.

## 9. Internationalisation

- Group headings, hints, footer keys, placeholder, and empty states are whole
  translated strings (#1310). The placeholder names the three things the bar
  does; the exact copy belongs to the UX-copy pass, not this design.
- Matching is case- and diacritic-insensitive via `Intl`-backed folding, and
  makes no word-order or whitespace assumptions that break agglutinative or
  CJK labels; the match highlight maps back to the original string by index.
- Documentation locale negotiation is §5.5's rule: the researcher's locale
  when the index manifest publishes it, else `en`.
- Chord hints render the keys, which are not translated; chord keys are
  declared in manifest and command data and can be localized per locale later
  without touching the component — the declarations and the shortcut
  registry, not the component, own them.

## 10. Shared components

New `@codaco/fresco-ui` public subpath:

| Subpath                    | Responsibility                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `navigation/EverythingBar` | Dialog, input, grouped listbox, keyboard model, matching, recents, provider orchestration |

Built on the `@base-ui/react` autocomplete and dialog primitives already in
fresco-ui's dependency set — no `cmdk` or other parallel palette dependency
is introduced. The trigger button is composed from the existing input-field
variants (as the documentation site's search button already demonstrates).
Router-agnostic: navigation activations go through a link/navigate render
prop, exactly as `NavItem` and `SiteNavigation` do.

Studio-local: the providers, the manifest and registry contents, chord
bindings, recents storage, and the documentation-index cache and its
configuration plumbing.

Adding the subpath requires `pnpm --filter @codaco/fresco-ui sync-exports`;
stories with interaction tests land alongside the component per the WCAG
foundations work (#1315).

## 11. Alternatives considered

- **Three separate surfaces** (docs search widget, command palette, quick
  switcher). Rejected: three shortcuts to learn, three ranking models, and
  the core value — not needing to know which kind of thing you want — is
  exactly what separation destroys.
- **Executing commands inline from the bar** (with a confirmation step for
  mutations). Rejected: it duplicates every owning screen's confirmation and
  error UX inside the palette, creates a second mutation path the audit
  specification would have to classify command-by-command, and saves one
  click. The launcher rule keeps the bar out of the audit and permission
  business entirely.
- **An interleaved relevance-ranked single list.** Rejected: cross-source
  scores (local fuzzy match vs Postgres name match vs the docs index) are
  not comparable, and unstable ordering makes the first Enter press a
  gamble.
- **Querying the documentation site's Algolia index from the bar.**
  Rejected: every debounced query — participant names, confidentially named
  studies — would reach a third party as a side effect of typing. The
  documentation site's own search box does not have this problem, because
  someone typing there has chosen documentation search; the bar cannot make
  that assumption, so it searches an index the instance holds instead (§5.5).
- **A deferred "Search the documentation" action** (explicit intent before
  any query left the instance). Considered during review as the privacy fix
  for the Algolia path and rejected 2026-09-01: it made documentation a
  second-class citizen of the bar behind an extra keystroke, and the
  instance-held index achieves stronger privacy with none of the friction.
- **Embedding documentation in a Studio panel.** Rejected: it forks the
  reading experience, locale negotiation, and analytics of the documentation
  site for the sake of not opening a tab.
- **`cmdk`** (the common palette library). Rejected: fresco-ui is already on
  Base UI, which now ships the autocomplete/combobox machinery `cmdk`
  provides; a second listbox primitive in the design system is a parallel
  implementation of the kind the development guidelines exclude.
- **Filter sigils** (`>` for commands, `?` for docs). Rejected for the
  default interaction: groups make modes unnecessary and sigils are
  undiscoverable and keyboard-layout-hostile. The provider seam does not
  preclude adding them if pilot feedback asks.
- **Hiding the bar behind the shortcut only** (no header affordance).
  Rejected: `⌘K` is a power-user convention; the visible search field is how
  everyone else finds it, and it doubles as the discoverability surface for
  the shortcut itself (the `⌘K` hint in the field).

## 12. Verification

### 12.1 Component tests (fresco-ui, stories + interaction tests)

- Combobox semantics: roles, `aria-activedescendant`, group labels, count
  announcements, focus trap and restore.
- Selection stability: a late-arriving result set inserting at its ranked
  position — including above the highlighted item — never changes which item
  is highlighted (the oracle: the highlighted provider-qualified key before
  and after resolve are equal, proven able to fail by breaking the
  identity-tracking path), and the inserted results land in §3.4 rank order,
  not appended below lower-priority rows. When the insertion would push the
  highlighted item past the group's visible bound, the window extends to
  keep it mounted — `aria-activedescendant` never references an unmounted
  option.
- Rank merging: items from different providers in one group merge by
  (tier, position, recency, label, qualified key) — a tier-0 remote item
  sorts above a tier-1 local item that rendered first, and a same-tier
  server-ranked page with deliberately non-alphabetical positions renders in
  position order, so a component that ignores `position` and alphabetizes
  fails the test. A same-tier merge where only one item carries `position`
  and only one carries `recency` renders in the defined null-placement
  order, identically across runs.
- Error containment: a provider `search` that rejects (not via the
  component's own abort) clears the group's pending state and renders the
  localized retryable error row — never an unhandled rejection, a stuck
  spinner, or an empty "no matches".
- Identity: two providers returning the same natural id render, highlight,
  and activate as distinct items — the provider-qualified key backs React
  keys and `aria-activedescendant`, asserted with a deliberate cross-provider
  collision.
- Keyboard: arrows traverse across groups, reach each group's "show more"
  row past its last visible result, and `Enter` there reveals the next page
  with the highlight on the first revealed item; `Enter` on a result
  activates, Esc closes and restores focus; reduced-motion path renders
  without transitions.
- Superseded queries: a remote response resolved after a newer keystroke —
  fulfilled at the network layer before its abort landed — is discarded; the
  test resolves the old request deliberately late and asserts nothing from
  it renders under the newer query.
- Matching: diacritic folding, initials, index-mapped highlight on non-Latin
  labels.
- Pagination: a remote provider returning `next` renders its group's "show
  more" affordance, and activating it calls `search` with the cursor and
  appends the page without moving the highlighted item; a local group whose
  filtered matches exceed the group bound renders the affordance from
  component state and reveals the next bounded slice, so a sixth matching
  destination is reachable; a mixed group — local remainder plus a provider
  cursor — fetches the outstanding cursor before revealing, then reveals
  exactly one bounded slice of the merged order per activation (§5.1): the
  test seeds a remote continuation whose items outrank the held local rows
  and asserts the revealed slice contains them in merged order, with neither
  source stranded; only a group with nothing further renders no affordance.

### 12.2 Studio integration tests

- **Parity**: every manifest entry across every area surfaces in the bar's
  destination provider — including areas other than the mounted one (§3.1) —
  and an entry whose `access` capability the test session lacks is absent
  from both sidebar and bar; one test over the shared data, which is the
  point of §5.2. The same cross-area assertion covers commands: a team-area
  command is found from a study screen (§3.2). The header is enumerated too:
  every header destination is a platform-manifest entry, so a link added
  outside the manifest fails the test. In self-hosted mode a
  `topology: 'managed'` entry (team billing) is absent from sidebar, header,
  and bar alike. A type-level assertion (or registry test) proves `access`
  and `topology` cannot be omitted, and the provider type's discriminated
  unions prove a `persistence: 'recents'` provider cannot omit `resolve` and
  a local provider exposes a synchronous inventory rather than a promise.
- **Launcher rule**: the registry test in §5.3 — every activation is a
  route, an external link, or a route paired with a surface its destination
  screen registers; the activation type admits no callback, so a mutation is
  not expressible, and a `surface` naming nothing the `href`'s screen
  registers fails the test.
- **Shortcuts**: the shortcut registry rejects two declarations of one chord
  in any reachable area combination, and every hint the bar renders
  round-trips through the registry — a chord declared but not registered, or
  hinted but unbound, fails the test.
- **Entity search**: membership scoping (a study in a team the researcher
  left never appears), context-first ranking, the server-capped limit and
  cursor pagination — including a page boundary falling inside a run of rows
  tied on last-modified and name, which must neither skip nor repeat any row
  — platform-scoped results carrying no invented team, the
  no-existence-oracle posture on unknown context ids, and rejection of an
  empty-after-normalization query, an over-length query, and an unparseable
  cursor (both search procedures).
- **Command availability**: a command with an `availability` predicate is
  absent while the shell context fails it (pause collection on an
  already-paused study) and present when it passes, evaluated without the
  owning area mounted.
- **Docs provider**: absent when `STUDIO_DOCS_INDEX_URL=off` (the sentinel
  disables despite `emptyStringAsUndefined` folding empty values into the
  default — both asserted), and rendering the documentation-unavailable
  state — not absence — when the URL is configured but no index has ever
  loaded or the last fetch failed validation with no last-good fallback
  (§5.5); the documentation path issues no outbound request carrying
  query text — the only outbound documentation traffic observed in the test
  double is the index refresh (asserted by inspecting outbound traffic, not
  assumed); locale filter and `en` fallback from the index manifest; a
  `studio`-tagged record ranks above an otherwise-equal untagged one, and
  untagged records still appear (boost, not filter); a broad query returns
  one server-capped page with a working `nextCursor`, and a page boundary
  inside a run of equal-score records neither skips nor repeats (the
  anchored-URL final key makes the order total); a failed refresh, a
  wrong-schema-major artifact, and an unparseable artifact each keep serving
  the last good index and raise the operational signal.
- **Recents**: items from a `persistence: 'never'` provider are not written
  even when the provider "forgets" per-item marking (there is nothing to
  forget — the policy is provider-level); stored references re-resolve on
  open, and an entry whose provider no longer returns it (revoked
  capability, lost membership, deleted entity) is pruned and not rendered; a
  recent for one study's destination re-resolves to that study after
  switching to another (the resource-scoped id, §5.1) rather than silently
  retargeting; a recent duplicated by a current-area inventory entry renders
  once (§3.5); a cleared store renders the empty state.

### 12.3 End-to-end

One journey appended to the shell's Playwright journey: open with `⌘K`, type
a study name from another team, land on it (focus on its `h1`), reopen, run
"Invite a team member" and land in the members screen's invitation flow,
reopen, type a query and verify the Documentation group renders inline
results from a fixture index (`STUDIO_DOCS_INDEX_URL` points at a local
fixture in E2E — no external dependency in CI) while the browser's network
log shows no cross-origin request containing the query text. The browser
necessarily sends the query to Studio's own same-origin RPC, so the
cross-origin assertion covers only the client half; the server half — that
Studio's outbound traffic to the documentation host is the index refresh and
never carries a query — is §12.2's server-side outbound-traffic test, not
this journey's.

## 13. Delivery plan

Sequential PRs on `main`, each shippable. Slice 1 has no Studio dependency
and can proceed alongside #1561's slices; slices 2–3 need #1561's slices 1–2
(the header and area layouts) merged.

| #   | Slice                          | Contents                                                                                                                                                                                              |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Component**                  | fresco-ui `navigation/EverythingBar` with provider seam, matching, recents, stories and interaction tests; `sync-exports`                                                                             |
| 2   | **Destinations and commands**  | Navigation manifests for the shipped areas (converting #1561's sidebars to manifest data if they landed as JSX); command registry; header trigger; `⌘K`; chords                                       |
| 3   | **Entities and documentation** | `search.entities` and `search.documentation` procedures and providers; `STUDIO_DOCS_INDEX_URL` env entry, server index cache and refresh; documentation-app `products` frontmatter and index artifact |
| 4   | **Owning-feature providers**   | Standing policy, not a PR: participants, sessions, versions, gallery search land as acceptance criteria of #1263/#1264, #1269, #1276, #1285                                                           |

The documentation app's index artifact (§6) can land ahead of slice 3 — it is
inert until Studio fetches it.

## 14. Open questions

1. **Default chord set.** The mechanism is decided (declared in manifests
   and commands, bound by the shortcut registry); the exact keys per area
   should be settled when slice 2 writes the manifests, with pilot-partner
   feedback able to change them cheaply.
2. **Recents scope.** Local storage per researcher per browser, matching the
   shell's sidebar-memory default. Whether recents ever sync across devices
   is a question for observed demand, not structure.
3. **Architect adoption.** The component is router-agnostic and Architect has
   destinations and commands of its own. Adoption is the shared-first
   aspiration, on Architect's timetable, and nothing in this design depends
   on it.
4. **Air-gapped installs.** `STUDIO_DOCS_INDEX_URL` defaults to the
   documentation site's published index, can be mirrored, and is disabled
   with the `off` sentinel. Whether the self-host image should additionally
   bundle a snapshot of the index at release time, so a fully offline
   install still has documentation search, is a packaging question for
   #1250.

## 15. GitHub tracking

A feature issue under #1243 tracks this design, referencing #1561 as its
prerequisite for slices 2–3 and carrying slice 4's standing policy into the
acceptance criteria of the named owning features. The decision-log entries in
§1.1 are recorded on #1242 with this date, per the tree's convention.
