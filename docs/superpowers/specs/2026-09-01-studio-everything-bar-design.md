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
3. **Documentation** — the documentation site's search index, with
   Studio-relevant pages ranked first.

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
5. **Documentation comes from the documentation site's existing Algolia
   index.** Studio-relevant pages are tagged with a `products` facet and
   boosted, never filtered — every docs page remains findable. Results open
   the documentation site; Studio does not embed a second docs renderer.
6. **The command registry owns keyboard shortcuts.** `⌘K` opens the bar, and
   the same registry that lists commands binds their global chords
   (`g` then `a` for the activity log). A shortcut cannot drift from the
   palette entry that advertises it.
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
4. **Selection stability.** Asynchronous results appending to the list never
   move the highlighted item or reorder groups already on screen.
5. **Query privacy.** Query text leaves the instance only for the
   documentation provider, only when that provider is configured. A
   self-hosted instance without documentation-search configuration sends
   nothing anywhere.
6. **PII gating.** No identifying participant data appears in results without
   the PII grant, and sensitive providers are excluded from locally persisted
   recents.
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

- **Destinations** — the current area's manifest entries plus the platform
  destinations (gallery, templates, account), labelled with their area
  ("Activity log · Team"). Chord hints render on destinations that have them.
- **Entities** — studies across every team the researcher belongs to (labelled
  with their team when the researcher has more than one), templates, and —
  when their owning features land — participants, sessions, and published
  protocol versions. Activating an entity navigates to its canonical route
  (`/study/$studyId`, `/gallery/$templateId`, …).

### 3.2 Commands

Actions the researcher can take from where they are, each resolving to the
screen or dialog that owns it:

- global commands — create a study, import a protocol, switch team, open
  language settings, sign out;
- contextual commands contributed by the current area — invite a team member
  (team area), create an API token (account area), pause collection (study
  settings, once #1262's lifecycle controls exist).

A command a researcher lacks the capability for is absent, not disabled —
matching the shell's permission-aware navigation rule. Where a role
requirement is worth teaching (the screenshot mock's "Requires Manager role"),
the owning feature can register the command as visible-with-explanation; the
default is absence.

### 3.3 Documentation

Results from the documentation site's Algolia index, in the researcher's
documentation locale, with pages tagged `studio` boosted to the top of the
group (§6). Each result opens the documentation site in a new tab —
deliberately leaving Studio, because a half-embedded docs reader would fork
the documentation experience and its locale negotiation.

### 3.4 Group order and ranking

Groups render in fixed order — **Go to**, **Commands**, **Documentation** —
matching how often each is wanted. Within Go to: current-study destinations
and entities first, then current team, then other teams, then platform; ties
break by last-modified, then name. Within Commands: contextual before global.
Within Documentation: Algolia's ranking with the `products:studio` boost.
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
- the top contextual commands.

This makes the bar useful as pure navigation — open, arrow down, Enter —
without requiring a query.

## 4. Interaction model

- **Open**: the header search affordance (rendered as a search field with the
  `⌘K` hint, like the documentation site's search button), or `⌘K` /
  `Ctrl+K` from any app route. The shortcut is registered at the app-shell
  layout, so it works identically everywhere, including the editor.
- **Type**: local providers (destinations, commands) filter synchronously on
  every keystroke. Remote providers (entities, documentation) debounce,
  abort superseded requests, and render into their group with a per-group
  pending indicator. Late results append; they never re-rank what is on
  screen (invariant 4).
- **Navigate**: arrow keys move through the flat result sequence across
  groups; `Enter` activates; `Esc` closes and returns focus to wherever it
  was. A footer row shows navigate / select / close hints, translated.
- **Activate**: destinations and entities are ordinary router navigations, so
  the editor's dirty-state blocker (#1561 §6.5) applies without special
  handling; a blocked navigation leaves the bar closed and the blocker's own
  dialog in charge. Commands navigate or open their owning dialog.
  Documentation opens in a new tab.
- **Chords**: outside the bar, `g` followed by a destination key navigates
  directly (`g` then `a` — activity log). Chords are declared on manifest
  entries, displayed as hints in the bar's results, suppressed while focus is
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
  chordHint?: string[];       // ['G', 'A']
  sensitive?: boolean;        // excluded from recents
  activate:
    | { kind: 'navigate'; href: string }
    | { kind: 'open'; run: () => void }      // owning dialog/screen surface
    | { kind: 'external'; href: string };    // documentation
};

type EverythingBarProvider = {
  id: string;
  local: boolean;             // synchronous filter vs debounced fetch
  search(query: string, signal: AbortSignal): Promise<EverythingBarItem[]>;
  empty?(signal: AbortSignal): Promise<EverythingBarItem[]>;
};
```

The component owns matching for local providers (case- and diacritic-folded
substring and initials matching), the keyboard model, grouping, bounds, and
recents. Providers own what exists and whether the researcher may see it.

### 5.2 The navigation manifest

Each area layout (#1561 §5.3) declares its navigation as data:

```ts
type NavManifestEntry = {
  id: string;
  labelKey: string;           // whole-string translation key
  href: string;
  icon?: ComponentType;
  permission?: string;        // capability from study.shell / team context
  chord?: string;             // the key after 'g'
};
```

`NavList` renders the manifest; the bar's destination provider searches the
union of the active manifests plus the platform destinations. This is the
structural parity guarantee: adding a route to an area means adding a manifest
entry, and that one addition surfaces it in the sidebar, the bar, and the
chord table at once. If #1561's slice 2 ships its sidebars as JSX before this
design lands, converting them to manifest data is the first task of this
design's slice 2.

### 5.3 The command registry

A typed registry, Studio-local, mirroring the manifest's shape plus an
`activate` and an optional global shortcut. Area layouts contribute contextual
commands via the same mechanism they use to declare their sidebar; global
commands register at the app layout. A registry test enumerates every entry
and asserts a label key, a permission or an explicit `public` marker, and an
activation that is a navigation or a named owning surface — the launcher rule
made structural.

### 5.4 Entity search

One new query procedure in `@codaco/studio-rpc`:

```ts
search.entities({ query, context: { studyId?, teamId? } }) -> {
  items: Array<{
    kind: 'study' | 'template' | ...;   // extended by owning features
    id: string;
    label: string;
    teamId: string;
    teamLabel: string | null;           // null when the researcher has one team
    updatedAt: string;
  }>
}
```

The server resolves the researcher's memberships once, searches each team
under its own tenant scope (row-level security intact — no cross-team query),
bounds results per kind, and applies the context-first ranking in §3.4.
Matching is name-prefix and substring on display names; anything cleverer is a
ranking refinement inside the procedure, not a contract change. The procedure
is a read of non-sensitive metadata and registers `none` in the audit command
registry — until a sensitive kind (participants) is added, at which point that
kind's clauses carry their own classification (§7).

### 5.5 The documentation provider

Studio queries the same Algolia index the documentation site's DocSearch
uses, with the same search-only key model. Configuration follows the
deployment-mode pattern (#1561 §10.4): `STUDIO_DOCS_SEARCH_APP_ID`,
`STUDIO_DOCS_SEARCH_INDEX`, `STUDIO_DOCS_SEARCH_KEY`, and
`STUDIO_DOCS_SEARCH_LOCALES` join the server env catalogue, are exposed on
the existing `status` procedure, and reach the bar through `ShellContext`.
When unset — the self-host default — the Documentation group does not exist
and no query leaves the instance (invariant 5). The managed deployment sets
them.

The query filters `lang:<locale>`, where `<locale>` is the researcher's
Studio locale when `STUDIO_DOCS_SEARCH_LOCALES` includes it and `en`
otherwise — the published-locale list is configuration received from the
instance, never guessed (today it is `['en']`). The boost is
`optionalFilters: ['products:studio']`, the same boost-not-restrict mechanism
the documentation site already uses for its section boost.

### 5.6 Recents

Activations are recorded to `localStorage`, most-recent-first, bounded, keyed
per researcher — the same local-persistence posture as the shell's sidebar
collapse memory. An entry stores the item's provider, id, href, and label —
except items marked `sensitive`, which are never written (invariant 6).
Recents are a convenience, so a missing or cleared store renders the empty
state's other content and nothing breaks.

## 6. Documentation pipeline changes

Three changes outside Studio make the `products` facet exist:

1. **Frontmatter.** Documentation pages gain an optional `products` list
   (`products: [studio]`; a page may name several products). Untagged pages
   are simply unboosted — no migration of existing content is required.
2. **Page metadata.** The documentation app's article layout emits
   `<meta name="docsearch:products" content="studio">` from that frontmatter,
   next to the metadata the crawler already reads.
3. **Crawler configuration.** The Algolia crawler (configured in the Algolia
   dashboard, not in this repository) extracts the meta tag into a `products`
   attribute on each record and declares it for faceting. The required
   crawler change is recorded here because the repository holds no crawler
   config to diff: `products` must be extracted as a custom attribute and
   added to `attributesForFaceting` as `searchable(products)`.

The documentation site's own DocSearch is unaffected: the facet is additive,
and the site may later adopt the same boost on its Studio section if wanted.
As Studio documentation is written (#1242 has no documentation epic — pages
land under the existing sections), tagging is part of authoring.

## 7. Permissions, PII, and audit

The governing rule is invariant 2: the bar reads permission-filtered sources
and launches permission-enforcing screens, adding no checks of its own and
bypassing none.

- **Destinations and commands** filter on the capabilities `study.shell` and
  the team context already deliver. The server denial path behind every gated
  destination (#1561 invariant 4) is what makes this safe rather than
  merely tidy.
- **Entity search** enforces membership server-side per team scope. Studies
  and templates are non-sensitive metadata; the procedure registers `none` in
  the audit command registry with that reason.
- **Participants** are the sensitive case, and they arrive with #1263/#1264,
  not before. When that provider lands: results identifying a person are
  returned only to holders of the PII grant (absent otherwise — masked rows
  would still leak existence); the search read registers its audit
  classification under the audit specification's "viewing
  participant-identifying information" policy at that time; and
  `sensitive: true` keeps every such result out of local recents (§5.6).
  The bar's architecture treats this as one more provider — nothing in the
  component changes.
- **Opening the bar and typing** is ordinary navigation and is excluded from
  the audit log, per the audit specification's §7.2 exclusions.
- **Documentation queries** reach Algolia, a third party. This is inherent to
  the documentation site's own search already; the bar keeps it opt-in per
  instance (§5.5) and never includes entity names or identifiers in the
  request beyond what the researcher typed.

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
  when published, else `en`.
- Chord hints render the keys, which are not translated; chord keys are
  manifest data and can be localized per locale later without touching the
  component — the manifest, not the component, owns them.

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
bindings, recents storage, and the docs-search configuration plumbing.

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
  scores (local fuzzy match vs Postgres name match vs Algolia) are not
  comparable, and unstable ordering makes the first Enter press a gamble.
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
- Selection stability: a late-arriving provider result set appended below the
  highlighted item never changes which item is highlighted (the oracle: the
  highlighted id before and after resolve are equal — proven able to fail by
  breaking the append path).
- Keyboard: arrows traverse across groups, Enter activates, Esc closes and
  restores focus; reduced-motion path renders without transitions.
- Matching: diacritic folding, initials, index-mapped highlight on non-Latin
  labels.

### 12.2 Studio integration tests

- **Parity**: for each area, every manifest entry surfaces in the bar's
  destination provider, and a manifest entry with a `permission` the test
  session lacks is absent from both sidebar and bar — one test over the
  shared data, which is the point of §5.2.
- **Launcher rule**: the registry test in §5.3 — every command's activation
  is a navigation or a named owning surface; no command holds a mutation
  procedure reference.
- **Entity search**: membership scoping (a study in a team the researcher
  left never appears), context-first ranking, bounds, and the
  no-existence-oracle posture on unknown context ids.
- **Docs provider**: absent without configuration (and no network request is
  issued — asserted, not assumed); locale filter and `en` fallback; the
  `products:studio` boost appears in the request as an optional filter, not a
  filter.
- **Recents**: sensitive items never written; a cleared store renders the
  empty state.

### 12.3 End-to-end

One journey appended to the shell's Playwright journey: open with `⌘K`, type
a study name from another team, land on it (focus on its `h1`), reopen, run
"Invite a team member" and land in the members screen's invitation flow,
reopen, verify the Documentation group renders results for a seeded query in
the test double's index (the E2E environment stubs Algolia — no third-party
dependency in CI).

## 13. Delivery plan

Sequential PRs on `main`, each shippable. Slice 1 has no Studio dependency
and can proceed alongside #1561's slices; slices 2–3 need #1561's slices 1–2
(the header and area layouts) merged.

| #   | Slice                          | Contents                                                                                                                                                                               |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Component**                  | fresco-ui `navigation/EverythingBar` with provider seam, matching, recents, stories and interaction tests; `sync-exports`                                                              |
| 2   | **Destinations and commands**  | Navigation manifests for the shipped areas (converting #1561's sidebars to manifest data if they landed as JSX); command registry; header trigger; `⌘K`; chords                        |
| 3   | **Entities and documentation** | `search.entities` procedure and provider; docs-search env catalogue entries, `status` exposure, documentation provider; documentation-app frontmatter + meta tag; crawler facet change |
| 4   | **Owning-feature providers**   | Standing policy, not a PR: participants, sessions, versions, gallery search land as acceptance criteria of #1263/#1264, #1269, #1276, #1285                                            |

The crawler configuration change (§6, crawler configuration) is coordinated
with slice 3 and is harmless to make early — the facet is inert until Studio
queries it.

## 14. Open questions

1. **Default chord set.** The mechanism is decided (manifest-owned); the
   exact keys per area should be settled when slice 2 writes the manifests,
   with pilot-partner feedback able to change them cheaply.
2. **Recents scope.** Local storage per researcher per browser, matching the
   shell's sidebar-memory default. Whether recents ever sync across devices
   is a question for observed demand, not structure.
3. **Architect adoption.** The component is router-agnostic and Architect has
   destinations and commands of its own. Adoption is the shared-first
   aspiration, on Architect's timetable, and nothing in this design depends
   on it.
4. **Visible-with-explanation commands.** §3.2 defaults gated commands to
   absent. Whether specific commands (pause collection) should instead appear
   with their role requirement, as the concept mock suggests, is a UX-copy
   and role-teaching question for the owning features.

## 15. GitHub tracking

A feature issue under #1243 tracks this design, referencing #1561 as its
prerequisite for slices 2–3 and carrying slice 4's standing policy into the
acceptance criteria of the named owning features. The decision-log entries in
§1.1 are recorded on #1242 with this date, per the tree's convention.
