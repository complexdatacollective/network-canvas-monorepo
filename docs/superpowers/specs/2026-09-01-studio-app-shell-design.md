# Studio App Shell and Researcher Information Architecture Design

Issue: #1243 (Platform foundation)
Related: #1242 (specification tree), #1262 (study model), #1272 (editor
foundation), #1315 (WCAG component foundations), #1317 (researcher-UI
accessibility), #1310 (Studio UI localization), #1253 (billing placeholder),
#1250 / #1251 (self-host and managed topologies)

Approved for implementation 2026-09-01.

Screen-by-screen mockups of the approved shell:
<https://claude.ai/code/artifact/0ac11d8f-3308-4c91-8ed5-9f5f3fcc24b1>

The three layouts it was chosen from, with the route map and the trade-offs:
<https://claude.ai/code/artifact/5dc7ed77-eb9c-4fe3-9751-ca83b81db940>

## 1. Summary

Studio's client today is a masthead with a wordmark and a sign-out button, a
single `/` route rendering a 1032-line `TeamWorkspace`, and a deep editor route.
Navigation between areas has been accreting per feature — the team activity
screen reaches its destination by adding a link to the team workspace's header
— and the specification tree adds roughly forty more researcher-facing routes.

Nothing in the tree owns the shell. #1272 owns the _editor's_ three-region
layout and nothing owns the application around it.

This design specifies that shell: the route tree, the navigation chrome, the
data the chrome needs, the accessibility contract every route change honours,
and the shared components the chrome is built from. It also fixes the surface
boundaries the marketing and sign-up tiers introduce, because those decide which
chrome a route gets and a route cannot be retro-fitted into a different shell
cheaply.

It is scheduled **before** the studies screens (#1262's client slice) rather
than after. Every decision in §2.2 is one that gets more expensive with each
screen that ships under the old assumptions, and today exactly two screens
depend on them.

### 1.1 Decisions this design records

Taken 2026-09-01 in specification review:

1. **The study is the application.** A protocol is not an object a team owns
   alongside its studies; it is how a study defines its data collection, so it
   is the study's **Editor**. "Protocols" ceases to be a top-level noun.
2. **Teams are study-focused.** Multiple studies per team are supported and
   uncommon. Navigation optimises for depth _within_ a study, not for choosing
   between studies.
3. **Templates and the gallery are platform-level**, above teams.
4. **Navigation layout**: a study sidebar, with a header carrying everything
   that is not the study — team switcher, gallery, templates, account.
5. **Routing**: the root is the marketing site. The application lives under
   fixed first segments — `/study/$studyId`, `/team/$teamId`.
6. **Shell chrome is shared**: the reusable parts land in `@codaco/fresco-ui`,
   not in `apps/studio/client`.

Alternatives considered and rejected are recorded in §5.6.

## 2. Requirements

### 2.1 Fundamental requirement

A researcher can reach every area of their study, their team's administration,
and the platform's shared surfaces from anywhere in the application, always
knowing which team and which study they are acting in — and a screen reader or
keyboard user can do so with the same certainty as a sighted mouse user.

### 2.2 Invariants

These hold for every route added to Studio from this design forward. Each is
testable, and §11 says how.

1. **The URL owns the study; the team is derived.** `/study/$studyId` is
   authoritative. Every team-scoped procedure names its team explicitly, and
   Better Auth's active-team setting is never read as an authorization input. A
   procedure whose caller cannot yet know the team — `team.acceptInvitation`,
   `study.shell` — resolves the tenant server-side from an identifier it owns,
   and reads nothing team-scoped until that tenant is pinned. The active-team
   setting _follows_ the committed URL: no `loader` and no `beforeLoad` in
   Studio performs a mutation. ("Every RPC procedure takes an explicit
   `teamId`" would be too strong, and always was: `status`, `me` and
   `team.acceptInvitation` do not — `schemas.ts:79-84`.)
2. **Chrome is a property of route position, not of route content.** Site,
   focused, app and participant are four sibling branches of one route tree. A
   new route inherits its shell from where it is added and cannot acquire the
   wrong one by forgetting to opt out of something.
3. **Participant routes never mount researcher chrome**, and their URL space is
   reserved now.
4. **Navigation is permission-aware, never permission-enforcing.** Hiding a
   destination someone cannot use is a courtesy. The server check remains the
   boundary, and every gated destination has a server-side denial path.
5. **Every route change moves focus and announces the destination**, under the
   rule Architect already established: land on the route's own `h1`, and only
   when the navigation lost focus.
6. **The session is resolved through one query, not per navigation.** Guards
   read it with `fetchQuery`, so a fresh session costs nothing and an
   invalidated one is re-asked before the guard decides. No session snapshot is
   frozen into router context.
7. **Deployment mode is a route input, in both directions.** Marketing,
   pricing, legal, the sign-up funnel and billing exist only in the managed
   topology; first-run setup exists only in the self-hosted one. A route outside
   its topology is refused by the HTTP layer with a genuine 404, the client
   renders its not-found state, and the server independently refuses the
   corresponding procedures — in both directions. `/` is exempt: it exists in
   both topologies (marketing in managed, a redirect in self-hosted).
8. **The shell has no layout-only screens.** A destination that exists to be
   clicked through — a list of one study — resolves instead of rendering.
9. **Every study destination is enumerated by the study sidebar.** The sidebar
   lists every `/study/$studyId/*` route that is neither a detail route of a
   listed destination (`/sessions/$sessionId`) nor owned by `editorLayoutRoute`.
   §11.1 asserts this from the route tree, so a study route added later cannot
   silently become unreachable.

## 3. Surface model: four shells, one deployable

One Node artifact and one origin serve four products. The first thing the route
tree encodes is which of the four a route belongs to.

| Shell           | Chrome                                         | Authentication | Topology     |
| --------------- | ---------------------------------------------- | -------------- | ------------ |
| **Site**        | `SiteNavigation` + `SiteFooter` (fresco-ui)    | Signed out     | Managed only |
| **Focused**     | Centred panel, optional step indicator, no nav | Either         | Both         |
| **App**         | Header + area sidebar (this design's subject)  | Required       | Both         |
| **Participant** | None; the interview owns the viewport          | Token          | Both         |

The **focused** shell covers sign-in, the sign-up funnel, hosted-checkout
return, invitation acceptance, first-run setup and the no-team state. It exists
because those screens are neither marketing nor application: they are
single-task, and giving them the app header would offer navigation to someone
who has nowhere to go yet.

Self-hosted instances serve **focused**, **app** and **participant** only. `/`
is the single exception, and it is not a site route there: under `self-hosted`
it redirects rather than rendering site chrome (§10.4).

## 4. Ownership model

Three levels, and the middle one is thin.

| Level        | Owns                                                               |
| ------------ | ------------------------------------------------------------------ |
| **Platform** | Marketing, sign-up, gallery, templates, the researcher's account   |
| **Team**     | Members, roles, activity, billing, integrations — administration   |
| **Study**    | Editor, participants, waves, sessions, schedule, recruitment, data |

The team is the tenancy, confidentiality and billing boundary (#1249, #1253) and
the home of people and permissions (#1256, #1257). It is not, for the typical
user, a place they work. The study is.

## 5. Route tree

### 5.1 Top-level segments

The first path segment is drawn from a closed set, known at build time:

```
/                     marketing (site)
/pricing              site
/legal/$document      site
/sign-in              focused
/sign-up/*            focused
/invitations/$invitationId  focused
/setup                focused
/no-team              focused
/enter/$token/*       participant
/account/*            app · platform level
/gallery/*            app · platform level
/templates/*          app · platform level
/team/$teamId/*       app · team level
/study/$studyId/*     app · study level
```

Naming the entity in the path (`/study/`, `/team/`) is what keeps this cheap.
A flat namespace — studies addressed directly at the root — would have required
study identifiers to be unique across every team on an instance, plus a
reserved-word list defending `/pricing` and `/enter` from a study named
"pricing". With the entity segment present, the top-level set is closed and no
identifier can collide with a route.

A human-readable study slug, if it is ever wanted, is decorative and
non-authoritative: `/study/<slug>-<id>`, with the id parsed off the end and the
slug ignored by the lookup. The id stays the only identifier, so a rename never
breaks a shared URL and no uniqueness scope is needed. A slug that _addressed_ a
study cannot work here: `protocols` has no uniqueness on `name` (only
`unique().on(id, teamId)`), a researcher in several teams can hold two studies
called "baseline", and making a slug authoritative would need an instance-wide
unique index over a table that is FORCEd under per-team RLS — which would also
answer "is this name taken in another team?", the existence oracle §6.3 refuses.
What the entity segment buys is that no route can collide with a study
identifier and the top-level set stays closed. It does not buy slug
addressability.

### 5.2 Complete route table

Issue references identify the feature that owns each destination's content; this
design owns only their position and chrome. The **Topology** column is the same
classification §10.4 enforces at the HTTP layer.

**Site**

| Route              | Purpose             | Topology                               | Issue |
| ------------------ | ------------------- | -------------------------------------- | ----- |
| `/`                | Marketing home      | managed (self-hosted: redirect, §10.4) | #1251 |
| `/pricing`         | Plans               | managed                                | #1253 |
| `/legal/$document` | Terms, privacy, DPA | managed                                | #1253 |

**Focused**

| Route                        | Purpose                                    | Topology    | Issue        |
| ---------------------------- | ------------------------------------------ | ----------- | ------------ |
| `/sign-in`                   | Magic link, OAuth, SSO                     | both        | #1255        |
| `/sign-up`                   | Account creation                           | managed     | #1255        |
| `/sign-up/team`              | Name the team                              | managed     | #1249        |
| `/sign-up/plan`              | Plan selection                             | managed     | #1253        |
| `/sign-up/checkout`          | Hand-off to hosted checkout                | managed     | #1253        |
| `/sign-up/complete`          | Checkout return; creates the first study   | managed     | #1253, #1262 |
| `/invitations/$invitationId` | Invitation acceptance (**shipped**)        | both        | #1256        |
| `/setup`                     | First-run configuration                    | self-hosted | #1250        |
| `/no-team`                   | No team yet; create or await an invitation | both        | #1249, #1250 |

`/sign-in` carries a search contract of `{ error?: string; invitationId?: string }`,
matching what `router.tsx:50-56` already parses.

**Participant** (no chrome)

| Route                     | Purpose                     | Issue |
| ------------------------- | --------------------------- | ----- |
| `/enter/$token`           | Entry, language, info pages | #1265 |
| `/enter/$token/consent`   | Consent capture             | #1266 |
| `/enter/$token/interview` | The interview runtime       | #1293 |
| `/enter/$token/complete`  | Completion, return callback | #1292 |

**App — platform level**

| Route                      | Purpose                         | Issue        |
| -------------------------- | ------------------------------- | ------------ |
| `/account`                 | Profile                         | #1255        |
| `/account/language`        | Locale preference               | #1310        |
| `/account/sign-in-methods` | Linked providers, sessions      | #1255        |
| `/account/tokens`          | Personal API tokens             | #1288        |
| `/gallery`                 | Browse shared protocols         | #1285        |
| `/gallery/$templateId`     | Template detail, provenance     | #1283, #1284 |
| `/templates`               | The instance's template library | #1282        |

**App — team level** (`/team/$teamId`)

| Route                                                        | Purpose                                  | Topology | Issue               |
| ------------------------------------------------------------ | ---------------------------------------- | -------- | ------------------- |
| `/`                                                          | The team's studies; create; import       | both     | #1262, #1280        |
| `/members`                                                   | Membership and invitations (**shipped**) | both     | #1256               |
| `/roles`                                                     | Role assignment and PII grants           | both     | #1257               |
| `/activity`                                                  | Audit trail (**shipping in #1554**)      | both     | #1259               |
| `/billing`                                                   | Plan, seats, invoices                    | managed  | #1253               |
| `/settings`                                                  | Name, defaults, deletion                 | both     | #1249               |
| `/settings/api`, `/settings/webhooks`, `/settings/messaging` | Integrations                             | both     | #1288, #1291, #1305 |

**App — study level** (`/study/$studyId`)

| Route                     | Purpose                                 | Issue               |
| ------------------------- | --------------------------------------- | ------------------- |
| `/`                       | Overview and data-collection monitoring | #1268               |
| `/editor`                 | Protocol editor, current draft          | #1272               |
| `/editor/codebook`        | Entities and variables                  | #1273               |
| `/editor/stages/$stageId` | Stage and interface editing             | #1274               |
| `/editor/assets`          | Protocol assets                         | #1278               |
| `/editor/translations`    | Protocol content translation            | #1311, #1312        |
| `/editor/preview`         | In-editor interview preview             | #1279               |
| `/versions`               | Published versions and structural diff  | #1276               |
| `/participants`           | Participant records                     | #1263, #1264, #1270 |
| `/waves`                  | Timepoints and progression              | #1267               |
| `/sessions`               | Collected sessions                      | #1269               |
| `/sessions/$sessionId`    | One session's data                      | #1269               |
| `/schedule`               | Schedule builder and monitoring         | #1304, #1307        |
| `/recruitment`            | Onboarding, consent, links              | #1265, #1266        |
| `/settings`               | Lifecycle, delivery, closure            | #1262               |
| `/export`                 | Interchange and archive                 | #1324               |

### 5.3 Route-tree structure

Studio uses code-based routing (`createRoute`), which this design keeps. The
tree gains four layout routes below the root, a component-less study route, and
four area layouts below the app layout:

```
rootRoute                       createRootRouteWithContext<ShellContext>()
├── siteLayoutRoute             id: 'site'         SiteNavigation + SiteFooter
│   └── '/'  '/pricing'  '/legal/$document'
├── focusedLayoutRoute          id: 'focused'      centred panel
│   └── '/sign-in'  '/sign-up/*'  '/invitations/$invitationId'  '/setup'  '/no-team'
├── participantLayoutRoute      id: 'participant'  no chrome
│   └── '/enter/$token/*'
└── appLayoutRoute              id: 'app'          header + AppFrame; session guard
    ├── accountLayoutRoute      '/account'         sidebar: account settings
    ├── '/gallery'  '/gallery/$templateId'  '/templates'      no sidebar
    ├── teamLayoutRoute         '/team/$teamId'    sidebar: team administration
    └── studyRoute              '/study/$studyId'  NO component
        ├── studyLayoutRoute    id: 'study-area'   sidebar: the study
        │   └── '/'  '/participants'  '/waves'  '/sessions'
        │       '/sessions/$sessionId'  '/schedule'  '/recruitment'
        │       '/versions'  '/export'  '/settings'
        └── editorLayoutRoute   '/editor'          sidebar: protocol outline
            └── '/'  '/codebook'  '/stages/$stageId'  '/assets'
                '/translations'  '/preview'
```

`studyRoute` declares the path, the params, the `beforeLoad` guard and the
`study.shell` loader, and renders **nothing**: a route with no `component`
renders `Outlet` (`route.options.component ?? router.options.defaultComponent ?? Outlet`),
so it contributes no DOM. Its two children are sibling area layouts, exactly one
of which is ever matched. That is what makes the editor's outline _replace_ the
study sidebar rather than render beside it — TanStack Router renders every
matched route's component and nests the child inside the parent's outlet, so an
editor layout nested _under_ `studyLayoutRoute` would render two `<nav>`s and
two `<main id="main-content">`s, with the skip link resolving to the outer one.

`studyRoute` stays mounted across the study↔editor transition, so study-scoped
state survives it and the loader runs once for both areas.

**The sidebar is owned by the area layout, not by the app layout.**
`appLayoutRoute` renders the header and `<AppFrame>`; each area layout renders
its `<nav>` and its `<main id="main-content">` into `AppFrame`'s region (§9). A
route whose area declares no sidebar renders `<main>` alone — `/gallery`,
`/gallery/$templateId` and `/templates` are the only such routes, and §11.1
holds them to an explicit allowlist.

Sidebar state splits by modality. Non-modal state — scroll position, collapsed
groups, the desktop collapse state — persists across navigations within an area
and resets between areas, because the area layout stays mounted. The mobile
drawer does not: it is a modal dialog, and no shell-owned modal surface may
outlive the navigation it initiated (§7.3).

### 5.4 Migration of shipped routes

Three route changes land with this design:

| Now                                                       | Becomes                                     |
| --------------------------------------------------------- | ------------------------------------------- |
| `/` → `TeamWorkspace` (team switcher, members, protocols) | `/team/$teamId` and `/team/$teamId/members` |
| `/teams/$teamId/protocols/$protocolId/drafts/$draftId`    | `/study/$studyId/editor`                    |
| `/teams/$teamId/activity` (in #1554)                      | `/team/$teamId/activity`                    |

`TeamWorkspace.tsx` (1032 lines) splits along its existing seams: the team
switcher moves into the header, member management and invitations become
`/team/$teamId/members`, and the protocol list becomes the team's study list.
Creating a protocol becomes creating a study; importing a `.netcanvas` file
(#1280) creates a study.

No public URLs exist yet — Studio has no production deployment — so no redirects
are required. This is the cheapest moment this migration will ever have.

### 5.5 Navigation chrome

**Header** (constant across every app route):

- Wordmark, linking to the researcher's landing destination (§6.4).
- Team chip — a `DropdownMenu` switcher listing the researcher's teams, with
  team administration and "create a team" beneath the list.
- Study chip, whenever inside a study — displays `study.name` from
  `study.shell`, so the study a researcher is acting in is named on every study
  route including every hour spent in the editor. Its dropdown lists the team's
  other studies when `teamStudies.items.length > 1`, and always offers "All
  studies in this team" and "Create a study", mirroring the team chip's
  commands. At one study the chip is still present and still names the study;
  only the sibling list is absent.
- Gallery and Templates.
- Account menu — profile, language, sign out.

The team chip is present in the editor. A wrong-team edit is expensive and slow
to notice, and this is the one place a researcher spends hours without
navigating.

**Study sidebar**, grouped in the order the work happens:

```
  Overview
  DESIGN     Editor · Versions
  COLLECT    Participants · Waves · Sessions · Schedule · Recruitment
  DATA       Export
  ————————
  Study settings
```

The grouping encodes the study lifecycle rather than decorating the list; it is
the reason a sidebar beats a tab strip here, and the labels must be
translatable whole strings.

`DATA` is a one-item group deliberately: the grouping above encodes the study
lifecycle, export is what follows collection, and #1324's sibling destinations
(archive, deposit) join this group rather than forcing a regrouping later. It is
not appended to COLLECT (export is not collection) and not placed below the rule
(that block is configuration; export is work).

Destinations whose contents are countable carry their count — participants,
waves, sessions, versions, protocol assets. The counts come from `study.shell`
(§6.3) rather than from a request per destination, they are omitted rather than
shown as zero when the area is empty, and they are decoration for assistive
technology: the count is part of the link's accessible name ("Participants, 84")
so it is not announced as a stray number.

**Editor sidebar** is the protocol outline specified by #1272 — codebook,
ordered stages, assets, translations — with a "Back to study" affordance at the
top that returns to `/study/$studyId`.

On narrow viewports the area layout renders an **area bar** — the drawer trigger
plus the area's name — as the first element of its region, directly beneath the
app header, and the drawer beside it. The trigger belongs to the area because
the sidebar does; an area with no sidebar renders no area bar. Putting the
trigger inside the app header instead would require a descendant to publish
upward into an ancestor's render, which is the mechanism §5.3 says does not
exist.

**Team sidebar**: Studies, Members, Roles, Activity, Billing, Settings.

**Account sidebar**: Profile, Language, Sign-in methods, API tokens.

### 5.6 Alternatives considered

- **A single tab strip on the study** (no sidebar). Gives every screen the full
  viewport and is the least chrome to build. Rejected: eight destinations is
  already tight before scheduling and consent land, translation expands labels
  by roughly a third, there is nowhere to put counts or a live badge, and a tab
  strip cannot express the design/collect grouping.
- **A permanent icon rail beside the study sidebar** for team, gallery and
  account. Rejected for now: it produces four vertical strips in the editor, and
  for the typical single-study team the rail is permanent furniture holding two
  icons. Should multi-study teams later prove common, revisiting this does not
  disturb the area layouts: each sizes itself by container query against the
  region it is given (§9), so narrowing that region is not a change to any of
  them.
- **Team-scoped study URLs** (`/team/$teamId/study/$studyId`). Rejected: the
  team is derivable from the study and the redundancy makes every study URL
  longer and every study link require two identifiers to construct.
- **The editor as a descendant of the study layout.** Rejected: the router
  renders both components and nests the child in the parent's outlet, producing
  two sidebars, nested `<main>`s and a duplicate `#main-content` that the skip
  link resolves to the wrong one.
- **The editor as a full-path sibling** (`/study/$studyId/editor` parented
  directly on `appLayoutRoute`). Correct behaviourally, rejected because it
  duplicates `$studyId`, the guard and the loader across two route definitions
  and needs a shared options object to stop them drifting. The component-less
  `studyRoute` parent gets the same rendering with one declaration.
- **A sidebar slot on `AppFrame`** filled by the area layout. Rejected: filling
  a parent's slot from a descendant needs upward publication during the parent's
  render, which React does not provide during a parent's own render, and it does not
  remove the nested `<main>` unless `AppFrame` also owns `<main>`.

## 6. Shell state and data

### 6.1 Router context

```ts
type ShellContext = {
  queryClient: QueryClient;
};
```

Injected via `createRootRouteWithContext<ShellContext>()` and supplied to
`RouterProvider`.

Context carries nothing that can go stale. The session and the deployment mode
are queries, resolved by guards with `fetchQuery` (§6.2, §10.4). A
`session: SessionSnapshot | null` frozen at boot would be permanently wrong
after the first auth transition, which is the same defect `ensureQueryData` has.

### 6.2 Session resolution

`probeSession()` currently calls `authClient.getSession()` inside `beforeLoad`
on every navigation into the authenticated tree — a request per click once there
are a dozen destinations.

**`sessionQueryOptions`**: `queryKey: ['session']`, `staleTime: Infinity` —
explicitly _not_ `'static'`, which returns `false` from `isStaleByTime` before
the `isInvalidated` check and would make invalidation permanently inert. The
`queryFn` is today's `probeSession()` body with one change: it _returns_ only
the two definitive answers (`signedIn`, and `signedOut` for both a null session
and the 503-no-database case, preserving that behaviour exactly) and **throws
`ServerUnreachableError`** for the unreachable case. Throwing leaves
`state.data === undefined`, so a boot-time network blip is never cached behind
`staleTime: Infinity`, and it lands on the router's
`defaultErrorComponent: ErrorScreen` exactly as `router.tsx`'s authenticated
guard does today. `fetchQuery` forces `retry: false` when unset, so there is no
retry storm.

**Guards call `await queryClient.fetchQuery(sessionQueryOptions)`** —
cache-served and request-free while fresh, and a real awaited refetch once
invalidated. **Studio loaders and guards use `fetchQuery`, never
`ensureQueryData`**: `ensureQueryData` returns the cached value without
consulting `state.isInvalidated`, its `revalidateIfStale` prefetch is
fire-and-forget and is read off the raw options (so it cannot be set through
`defaultOptions`), and `fetchQuery` gives the same cache-hit behaviour while
honouring invalidation.

Each auth transition names its own mechanism, and "invalidate" is not the right
word for two of them:

- **Sign-in inside the SPA**, where the response carries the session:
  `queryClient.setQueryData(['session'], snapshot)` — correct on the next guard
  with no round trip and no race. Where the transition goes through a full
  document load (social callback, magic-link verify) the cache is empty and
  nothing is needed.
- **Sign-out**: `queryClient.clear()` after a successful `authClient.signOut()`
  — the sequence `AppLayout.tsx` and `AcceptInvitation.tsx` already use, kept
  verbatim. Removal, not invalidation, is what makes the next `fetchQuery` see
  `state.data === undefined`. Invalidating would also work — `invalidateQueries`
  marks every matched query invalid before it decides what to refetch, so with
  `staleTime: Infinity` the next `fetchQuery` re-asks even though the query has
  no observers, which is exactly the mechanism the 401 case below relies on.
  `clear()` is chosen because sign-out invalidates more than the session: every
  other cached query belongs to the researcher who just left, and removal is the
  only operation that guarantees none of it is served to whoever signs in next.
- **401 mid-session**:
  `queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'none' })`
  followed by `await router.invalidate()`, which marks committed matches invalid
  so `beforeLoad` re-runs without waiting for a navigation. Do **not**
  `setQueryData(['session'], 'signedOut')`: the refetch must let `/api/auth/*`
  decide signedOut vs unreachable vs 503-no-database, so one procedure's
  authorization failure cannot fabricate a state the auth endpoint never
  reported.

Set `defaultPreload: 'intent'` with `defaultPreloadStaleTime: 0` so TanStack
Query's freshness rules govern preloaded route data. This is safe only because
Studio loaders are pure reads (§6.6): preload runs `beforeLoad` _and_ the
loader, on hover and on keyboard focus after 50ms, and
`defaultPreloadStaleTime: 0` re-runs it per hover.

### 6.3 Study resolution and team derivation

`studyRoute`'s loader calls
`await queryClient.fetchQuery(studyShellQueryOptions(studyId))`, wrapping one
procedure that answers the shell's questions at once:

```ts
study.shell({ studyId }) -> {
  study: { id, name, state, waveSummary },
  team:  { id, name, role },
  permissions: string[],       // effective capabilities for this researcher
  teamStudies: {               // the owning team's studies, most recent first
    items: Array<{ id: string; name: string }>,  // capped; includes this study
    hasMore: boolean,          // true when the team has more than the cap
  },
  counts: {                    // sidebar counts; a key is absent when zero
    participants?: number, waves?: number, sessions?: number,
    versions?: number, assets?: number,
  },
}
```

`studyShellQueryOptions(studyId)` uses `staleTime: 60_000`, so no navigation
within a study issues a request more than once a minute, and is invalidated
explicitly by the mutations that change what it reports (study rename, study
creation and deletion within the team, permission and role changes). The counts
are decoration and a minute of staleness in them is acceptable; identity and
permissions are invalidated rather than left to the timer.

**There is no `studyCount`.** The chip's visibility and its contents come from
one field, so they cannot disagree — a chip whose visibility came from a count
and whose list came from elsewhere could open onto nothing. The cap is a fixed
number the menu can show without becoming a scroll list; when `hasMore` is true
the menu's last entry is a link to `/team/$teamId` rather than a truncated list
presented as complete. The team's full, paginated study list stays with
`/team/$teamId`.

**Tenancy resolution — `requireStudy`.** The input carries no `teamId`. A cold
direct navigation to `/study/$studyId` has none to send. This is the same shape
as invitation acceptance, where `schemas.ts:79-81` records the rule: a caller who
cannot yet be checked against a membership must not have their tenant taken from
the browser, because there is nothing to validate it against. The server
resolves it:

1. Read the caller's own memberships from `team_members` — policy-free, already
   read before any pin by `getMembership`, and served by
   `team_members_user_id_team_id_idx`.
2. For each of those teams, ordered with the session's active team first so the
   common case is one probe, build `createTenantDb(pool, teamId)` and look the
   study up by primary key under RLS. The first hit supplies
   `team: { id, role }`, the pinned `tenantDb` and the study row.
3. No hit in any of the caller's teams → `FORBIDDEN`.

The rule this states: before a `TenantDb` is pinned, the resolver may read only
the caller's membership rows — never a study name, state, count, permission or
team name. Every field in the response is read after pinning.

**The denial code is `FORBIDDEN`.** A study the caller cannot reach — because it
does not exist, or because it belongs to a team they are not a member of — is
refused identically in both cases, matching `requireTeam`'s posture
(`rpc.ts:103`, `rpc-team.test.ts:220`) and `contract.ts:76-78`. Because the
search space is exactly the caller's own teams, the two cases are
indistinguishable by construction; the existence oracle is closed without a
special case. `NOT_FOUND` keeps its existing narrower meaning: an authorized
tenant whose subject row is absent.

Rejected, in writing: a policy-free `study_directory(study_id, team_id)` index
would resolve the tenant in one unpinned statement, but it has a `team_id`
column and is not an auth table, so `db/__tests__/rls.test.ts`'s derived
tenant-table set fails on it by design — adopting it means amending the guard
that exists to stop exactly that, to save a couple of indexed lookups on a route
that loads once per study. Widening the RLS predicate to accept a set of teams
is a tenancy-model change, not a shell change.

**The loader mutates nothing.** Active-team reconciliation is not a loader side
effect; see §6.6.

### 6.4 Landing destination

Signing in resolves rather than listing:

1. One team, one study → `/study/$studyId`.
2. One team, several studies → `/team/$teamId`.
3. Several teams → the most recently active team, resolved as above.
4. No team → `redirect({ to: '/no-team' })`.

`/no-team` is a focused-shell route in both topologies. Three guards make the
state reachable and unsquattable:

- `appLayoutRoute.beforeLoad` keeps its session requirement and gains: a
  resolved session with zero team memberships throws
  `redirect({ to: '/no-team' })`. This is what catches a bookmark or deep link
  into `/study/…`, `/team/…`, `/account` or `/gallery`, not only the
  post-sign-in landing.
- `/no-team`'s own `beforeLoad`: signed out → `/sign-in`; one or more teams →
  re-run this resolution, so the screen cannot be squatted after an invitation
  is accepted in another tab.
- the sign-in route's signed-in redirect target changes from `/`
  (`router.tsx:64`) to this resolution, which terminates at `/no-team` in case 4.

Content by topology: managed offers team creation (entering `/sign-up/team`) and
explains the invitation path; self-hosted offers team creation only where
#1250's first-run rules permit it, and otherwise explains that a team owner must
invite them. In neither topology does it fall back to `/`, which is marketing in
managed and a redirect in self-hosted.

### 6.5 Navigation blocking

The editor registers a dirty-state blocker (`useBlocker`) and a lease that must
be released before leaving. The shell's obligations:

- Sidebar and header links are ordinary router navigations, so the blocker
  applies to them without special handling.
- The sign-out flow's existing "navigate first, verify we actually left, then
  release the lease and clear auth" sequence is preserved when the sign-out
  control moves into the account menu.
- A blocked navigation must not leave the sidebar showing the destination as
  active. Active state derives from the committed location, never from the
  pending one.

**Team switcher.** Selecting team T in the header: (a) resolve T's landing
destination per §6.4 — a read-only query, no session mutation; (b) navigate to
it as an ordinary blocker-aware navigation, rendering the menu entries as
`<Link>`s where possible and never passing `ignoreBlocker`; (c) confirm the
committed location equals _that exact destination_
(`router.state.location.pathname !== destinationPathname → return`), not merely
that the location changed; (d) perform no `setActive` — §6.6's reconciler
observes the newly committed team and issues the single write.

**A blocked navigation's promise parks; it does not reject.** `history` drops a
blocked push silently (`opts.onBlocked?.(); return`) and `onBlocked` is wired
nowhere in the router. The promise resolves later, when some _other_ navigation
commits, because `commitPromise.resolve` chains to the previous commit promise.
Two rules follow:

- Pending and spinner state is cleared from a committed-location subscription
  (or the blocker's own resolver), never from the awaited `navigate()` promise,
  or a cancelled discard latches the spinner forever.
- Every such sequence carries a generation token checked in its continuation,
  because a parked promise resumes on an unrelated later commit.

The second rule is a live bug in the sign-out sequence this section says it
preserves: sign out from a dirty editor → "Keep editing" (the
`navigate({ to: '/' })` promise parks) → later click "Back to protocols" and
discard → the app commits to `/`, the parked promise resolves,
`router.state.location.pathname === '/'` passes, and the researcher is signed
out without being asked. `AppLayout.tsx` gains the generation token in this
slice; the switcher is written with it from the start rather than copying the
pattern as-is.

### 6.6 Active team reconciliation

Exactly one place in Studio writes Better Auth's active organization: an effect
owned by the authenticated app-shell component (the Studio-local wrapper around
`AppFrame`), keyed on the **committed** team id.

It reads `team.id` from the committed study or team match — selected off
`router.state.matches`, never the pending location — compares it with the
session's `activeOrganizationId`, and only when they differ calls
`authClient.organization.setActive({ organizationId }, { disableSignal: true })`
followed by a settled
`Promise.allSettled([refetchActiveTeam(), refetchActiveMember()])`. Keying on
the committed team id makes it idempotent and unreachable from a route that
never mounted.

`disableSignal` is there because Better Auth otherwise schedules an overlapping
delayed refresh of its own (a 10ms `setTimeout` toggling the matched
nanostores). It suppresses `$activeOrgSignal`, `$sessionSignal`,
`$activeMemberSignal` and `$activeMemberRoleSignal`; the two refetches above
replace the first and third, so "exactly one refresh path is authoritative"
holds for those two queries and nothing else refreshes on its own. Note what
that leaves: `$sessionSignal` is suppressed and nothing replaces it, so the
session's own `activeOrganizationId` — the value this effect compares against —
stays stale until the next full session read. The effect is nonetheless
idempotent because it is keyed on the committed team id, not on that
comparison; the comparison is an optimisation that avoids a redundant write,
and it must never become the correctness argument.

**No loader and no `beforeLoad` performs this reconciliation**, and none of them
mutates anything. Preload runs both on hover and on keyboard focus after 50ms,
so a loader-based `setActive` would fire for every study link a researcher
arrow-keys past in the switcher, and `defaultPreloadStaleTime: 0` would re-fire
it per hover. Guarding on the `preload` flag is not a fix either: loaders also
run for navigations that are then cancelled by a sibling redirect or by a second
click, so a `preload`-guarded loader still mutates the session for a URL that is
never committed.

The two existing `setActive` call sites are removed by this design:
`TeamWorkspace`'s `switchToTeam` (§6.5) and `AcceptInvitation`'s
post-acceptance activation, whose `activationFailed` alert branch goes with it
(§10.2).

## 7. Accessibility

#1317 makes this an acceptance criterion; the shell is where most of it is
either won or lost, because it is the part every route inherits.

### 7.1 Landmarks and skip link

Every shell layout renders exactly one `<main id="main-content">`. Every shell
whose chrome precedes that main renders the skip link that targets it — the app
shell (header + area sidebar) and the site shell (`SiteNavigation`). The focused
and participant shells have no repeated block before main, so WCAG 2.4.1 does
not apply to them; they render the `<main>` without a skip link.

Concretely: `AppFrame` renders the skip link as the first focusable element of
the document, before the header, and each area layout renders the labelled
`<nav>` and the `<main id="main-content">` it targets (§9). The site shell gets
its skip link from `SiteNavigation` (§10.1). `SignIn.tsx`,
`AcceptInvitation.tsx` and `/no-team` gain `id="main-content"` on their existing
`<main>` so §7.2's target rule and the landmark test hold uniformly across all
four shells.

Each navigation region's `<nav>` carries a distinct accessible name drawn from
the closed set {Study, Team, Account, Protocol outline}.

### 7.2 Route-change focus and announcement

Architect's `RouteFocus` already solves this properly, including two subtleties
worth preserving verbatim: focus moves **only when the navigation lost focus**,
so it cannot fight a dialog's `finalFocus`, an autofocused field, or a focus
trap; and it refuses to focus a target inside `[inert]`, because focusing an
inert element silently fails and leaves focus on `<body>`.

That component moves to `@codaco/fresco-ui` (§9) with the location supplied as a
prop so it is router-agnostic — Architect passes wouter's, Studio passes
`useRouterState`'s. Architect is converted to the shared component in the same
slice; the app keeps no local copy.

Every route in Studio spreads `routeFocusTargetProps` on its `h1`. This is a
route-tree invariant, tested by rendering each route and asserting the target
exists.

### 7.3 Keyboard and screen-reader operation

- Sidebar navigation is a list of links, operated by Tab and Enter. It is not a
  composite widget and must not implement roving focus, which would make the
  destinations harder to reach, not easier.
- The current destination carries `aria-current="page"`; the visual active
  treatment never carries the state alone.
- The mobile drawer is built on `@codaco/fresco-ui/Modal`, not a bare
  `Dialog.Root`: focus is trapped while open, Escape and backdrop closes return
  focus to the trigger, and the page behind is genuinely `inert` — that last
  guarantee comes from `Modal`'s `inertOthers` sweep, since Base UI's own focus
  manager only sets `aria-hidden`.
- **The drawer closes on the navigation it initiated, and only when that
  navigation commits.** A `useBlocker`-cancelled navigation leaves it open — the
  same committed-location rule §6.5 states for active styling. Leaving it open
  across a commit would be worse than silent: `RouteFocus` refuses to move focus
  twice (the activated link still holds focus, so focus was never lost; and the
  destination heading sits inside the inerted subtree), while the announcer —
  exempted from the inert sweep as an `[aria-live]` region — still announces a
  destination that is out of the accessibility tree and untabbable.
- Because closing alone does not move focus, the drawer hands off explicitly:
  `Dialog.Popup`'s `finalFocus` returns `false` for a navigation-driven close,
  suppressing the trigger restore, and the shell calls the exported
  `focusRouteTarget()` once the popup has unmounted. `Modal` releases its
  isolation on `open` flipping rather than on unmount, so the destination is out
  of `[inert]` before that call runs.
- The team and study switchers are `DropdownMenu`, which supplies the menu
  semantics already.
- Collapsing the sidebar to icons leaves every item an accessible name, and the
  collapse control states which state it will move to.

### 7.4 Motion

Drawer and sidebar transitions use `motion/react` with the shared
`MotionSpring` presets, gated on `useReducedMotion()`.

## 8. Internationalisation

- Every navigation label, group heading and empty state is a whole string. No
  fragment concatenation; no English grammar assumptions (#1309).
- The sidebar and header size to their content. Labels expand by roughly a third
  in German and Portuguese and the chrome must not clip or truncate them.
- Layout uses CSS logical properties throughout, so RTL is a matter of direction
  rather than a second stylesheet (#1310).
- Locale comes from the account preference (`/account/language`) with the
  negotiation chain #1309 specifies.

## 9. Shared components

Per the shared-libraries-first principle and the decision recorded in §1.1, the
reusable chrome lands in `@codaco/fresco-ui`. Fresco currently has its own
app-local `NavigationBar` and `MobileNavDrawer`; Studio building a second set
would make it two implementations of the same thing in one monorepo.

New public subpaths:

| Subpath                 | Responsibility                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layout/AppFrame`       | Skip link (first focusable), `<header>` slot, and the area region that renders the router `Outlet`. Owns the responsive grid. Renders **no** `<nav>` and **no** `<main>`.                                          |
| `layout/AppArea`        | One area's frame: the labelled `<nav>` (desktop), the narrow-viewport area bar and `NavDrawer`, and `<main id="main-content">`. Rendered by each area layout; sidebar-less areas render `<main>` directly instead. |
| `navigation/NavList`    | A navigation region's contents: optional groups, translatable whole-string headings                                                                                                                                |
| `navigation/NavItem`    | One destination; link supplied by a render prop (router-agnostic)                                                                                                                                                  |
| `navigation/NavDrawer`  | The narrow-viewport presentation of a `NavList`, on `Modal`; closes on committed navigation with the §7.3 focus handoff                                                                                            |
| `navigation/RouteFocus` | `routeFocusTargetProps`, `focusRouteTarget` and the announcer, moved from Architect                                                                                                                                |

`AppFrame` is rendered once, by `appLayoutRoute`, so the header survives every
area transition. `AppArea` is rendered by the area layout, so the sidebar and the
`<main>` it labels belong to the area — including the drawer and its trigger.
The `<main id="main-content">` the skip link targets is rendered by a descendant
of the component that renders the link; §11.2 asserts the pair at runtime rather
than trusting one component to own both.

What stays Studio-local: the _contents_ of the header and each sidebar, the
switchers, and the landing-destination logic. Those are Studio's information
architecture, not shared UI.

Adding subpaths requires `pnpm --filter @codaco/fresco-ui sync-exports`; the
vitest guard fails if the generated export maps drift.

Every new component gets stories with interaction tests, alongside the WCAG
foundations work in #1315.

## 10. Marketing, sign-up and billing

### 10.1 Site shell

`@codaco/fresco-ui/navigation/SiteNavigation` and `SiteFooter` are the canonical
Network Canvas header and footer, already used by networkcanvas.com and the
documentation site, already router-agnostic through a link render prop, and
already carrying `protocolGallery` and `getStarted` items. Studio's site shell
adopts them and supplies TanStack Router links. It does not introduce a second
site header.

`SiteNavigation`'s item set (`SiteNavigationItemId`) needs a Studio-appropriate
entry; that is an additive change to a shared component, made in the shared
package, not worked around locally.

`SiteNavigation` gains the site shell's skip link, rendered as its first
focusable element, with a `skipToId` prop defaulting to `'main-content'` and a
translated label added to `SiteNavigation.messages.ts` alongside the existing
navigation copy. This is the shared-package change that also fixes
networkcanvas.com and the documentation site, neither of which has a skip link
today — the repo's only "Skip to main content" is in
`apps/studio/client/src/routes/AppLayout.tsx`. The cost that comes with it:
`id="main-content"` must be added to the existing `<main>` elements in
`apps/networkcanvas.com/app/[locale]/page.tsx`, `publications/page.tsx` and
`get-started/page.tsx` — and `summer-2026-update/page.tsx`, which has no
`<main>` at all and needs one before the link has a target — and
`apps/documentation/components/Layout.tsx`, in the same change.

That change also reaches outside the repository. `@codaco/site-navigation-element`
is published to npm and renders `SiteNavigation` into a shadow root for non-React
hosts, so every embedding site inherits the skip link. It cannot inherit a target:
the link resolves against the host page's document, which the web component does
not control. `skipToId` is therefore a documented attribute on the custom element,
and the element's README states that a host which sets it must provide the
matching element. The default remains `main-content`, and a host with no such
element gets a link that does nothing — which is why the attribute exists rather
than the link being unconditional.

### 10.2 Sign-up funnel

Account → team → plan → checkout → first study. The funnel's last step hands the
researcher an editor rather than an empty dashboard.

The invited-collaborator path skips team creation, plan and payment entirely.
`/invitations/$invitationId` (shipped) accepts, then resolves through the same §6.4
landing rule with the accepted team pinned: exactly one study visible to that
researcher in that team → `/study/$studyId`; zero or several → `/team/$teamId`.
Invitations are team-scoped and carry no study target — `team_invitations` has
no study column and `AcceptTeamInvitationResultSchema` returns only team fields
— so "the study they were invited to" does not exist as a concept. If a
study-targeted invitation is wanted it is a schema change (a nullable study
target plus the study-level grant in #1257), not a routing detail, and this
design does not assume it.

`AcceptInvitation.tsx`'s success control is today `<Link to="/">Open team</Link>`,
which after §5.4's migration points at marketing in managed mode and a redirect
in self-hosted; it becomes a navigation to the resolved destination. Its own
`authClient.organization.setActive` call and the `activationFailed` alert are
removed: §6.6's app-shell reconciler sets the active organization when the
destination commits, and the focused shell has no reconciler of its own by
design.

### 10.3 Payment

Card details never reach Studio. Plan selection hands off to a hosted checkout
and returns to `/sign-up/complete`; Studio stores a plan, a customer reference
and a subscription status, updated by a signed webhook. This keeps card handling
out of the codebase entirely, and it is why the funnel is a redirect flow rather
than a form.

The billing machinery itself remains deferred (#1253). This design reserves the
routes, the shell they render in, and the `/team/$teamId/billing` destination,
and requires that the shell render correctly when billing is absent.

### 10.4 Deployment-mode gating

**The variable.** `STUDIO_DEPLOYMENT_MODE` (`managed` | `self-hosted`) joins the
server env catalogue, defaulted at the resolve layer rather than in the schema —
the `variables.ts` no-`.default()` rule exists so a value cannot be compiled into
the production bundle.

**Unset ⇒ `self-hosted`.** That is the fail-closed value and matches the posture
every other optional surface in `resolve.ts` already takes (no `DATABASE_URL` ⇒
`auth: undefined`; no `SMTP_URL` ⇒ mailer `refuse`; no `S3_*` ⇒ 503). Its
failure mode is loud — a managed deployment that forgets the variable 404s its
own pricing page on the first smoke request — where the opposite default's is
silent: a university self-host publishing `/pricing`, `/sign-up/plan` and a
billing page.

Exactly one deployment sets it, and it must be readable at **runtime**, because
both `src/index.ts` and `src/netlify.ts` call `readEnv()` inside the running
process:

| Deployment                                                             | Value                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/Dockerfile` (self-host artifact)                          | unset ⇒ `self-hosted`; the image sets nothing                                                                                                                                                                                |
| The managed container deployment described in that Dockerfile's header | `STUDIO_DEPLOYMENT_MODE=managed` in the container environment                                                                                                                                                                |
| The Netlify site                                                       | `STUDIO_DEPLOYMENT_MODE=managed` as a **site** environment variable (`netlify env:set` / the UI), **not** in `netlify.toml`'s `[build.environment]`, which is the build environment and cannot reach the function at runtime |

Record that in `netlify.toml`'s header comment beside the existing note about
what the file cannot supply to the function. The Netlify lane serves `managed`
only: `src/netlify.ts`'s `config.path` does not claim `/` or `/pricing`, so the
CDN answers them and no function-level gate can run — if that ever needs to
change, the gated paths must be added to `config.path`.

Catalogue entry (mandatory — `CATALOGUE` is exhaustive over `VariableName` and
typecheck fails without it): `group: 'Process'`, a summary naming the two
topologies,
`deployment: 'Unset ⇒ self-hosted. The managed deployment sets managed in its runtime environment.'`,
`example: 'self-hosted'`, `devDefault: 'managed'` so the local lane can develop
the site and sign-up funnel. Regenerate the three documentation artifacts or
`env/__tests__/docs.test.ts` fails.

**The classification is total and two-directional**, and lives in
`@codaco/studio-rpc` (a new `./surfaces` subpath) — the only code shared by both
deployables — so the server gate and the client's route classification cannot
drift, and no client→server import is created:

- **Managed only**, 404 under `self-hosted`: `/pricing`, `/legal/$document`,
  `/sign-up`, `/sign-up/team`, `/sign-up/plan`, `/sign-up/checkout`,
  `/sign-up/complete`, `/team/$teamId/billing`.
- **Self-host only**, 404 under `managed`: `/setup`.
- **Both**: everything else — `/`, `/sign-in`, `/no-team`, `/invitations/$invitationId`,
  the participant branch, every app route.

`/` is in "both" deliberately. A self-hoster's origin root is the URL they hand
their researchers; 404ing it would make it dead. Under `managed` it renders
marketing, signed in or out (the wordmark is what carries a signed-in researcher
to their landing destination). Under `self-hosted` it is a redirect-only route:
a session resolves through §6.4, no session redirects to `/sign-in`.

**The 404 is an HTTP gate, not a client `throw notFound()`.** `notFound()` is a
marker object with no status, and Studio's client has no SSR entry that could
translate one; today `index.ts`'s two `serveStatic` mounts answer every unmatched
GET outside `/api`, `/rpc` and `/storage` with `index.html` at **200**, and
Netlify's `from = "/*" to = "/index.html" status = 200` redirect does the same.
So:

1. Extract the static and SPA-fallback wiring out of `src/index.ts` into an
   exported `mountClient(app, env)` (`src/client-assets.ts`) that `index.ts`
   calls. `index.ts` is not importable from a test — at module scope it reads
   env, opens two pg pools, awaits `checkSchema`, binds a port and installs
   SIGTERM handlers — so the gate must live somewhere a vitest can drive with
   `app.request()`.
2. `mountClient` registers, **before** both `serveStatic` mounts, a handler over
   the gated patterns for the resolved mode that returns the shell HTML with
   **status 404** and `Cache-Control: no-store` (the rule `setCacheHeader`
   already applies to `index.html`), so the client still renders its branded
   not-found state while the status line is honest and nothing caches it.
3. The client's `throw notFound()` on those routes is the courtesy layer, for
   in-app navigations where no HTTP request happens.
4. The server refuses the corresponding procedures independently and in both
   directions: plan, checkout and billing procedures refuse under `self-hosted`,
   and the first-run setup procedure refuses under `managed`, or a managed tenant
   can run first-run configuration.

The mode is exposed on the existing `status` procedure (`StatusSchema` gains
`deployment: { mode, billing }`; `createRpcRouter` receives it from the resolved
env, since `getInstanceStatus` takes only `AuthCapabilities` today). The client
reads it in `beforeLoad` with `fetchQuery(statusQueryOptions)` at
`staleTime: Infinity` — not from a boot snapshot in router context.

The failure this prevents is concrete: a university's self-hosted instance
serving a pricing page — and its mirror image, a managed tenant reaching
first-run setup.

## 11. Verification

### 11.1 Route-tree tests

Most of these use
`createAppRouter(createMemoryHistory({ initialEntries: [...] }))`, as the
existing client tests already do; the deployment-mode gate is tested at the HTTP
layer instead, because that is where it lives:

- Each route renders the shell its branch declares, asserted by the presence and
  absence of chrome landmarks. A participant route renders no `<nav>`; a site
  route renders no app header.
- **Tree shape, asserted at runtime, not at compile time.** A test walks the
  built `routeTree`, collects every leaf whose parent chain contains
  `appLayoutRoute`, and walks each one's `parentRoute` upward. Every such leaf
  must either have exactly one declared area layout (`accountLayoutRoute`,
  `teamLayoutRoute`, `studyLayoutRoute`, `editorLayoutRoute`) in its chain, or
  appear in the explicit sidebar-less allowlist
  `['/gallery', '/gallery/$templateId', '/templates']`. A leaf satisfying
  neither fails, and the message names its full path. The allowlist is the
  design decision made visible: adding to it is a review-time choice; forgetting
  an area layout is a test failure. (The previous claim that such a route "fails
  to compile" was not implementable — `addChildren` constrains a child only to
  `AnyRoute`, and nothing in `createRoute`'s options can express "declares a
  sidebar". §5.3's own tree, with `/gallery` and `/templates` directly under the
  app layout, was the counterexample.)
- Rendering each route in §5.2's table produces at most one sidebar `<nav>`,
  drawn from {Study, Team, Account, Protocol outline}, and exactly one
  `<main id="main-content">`. `/study/$studyId/editor` produces
  `['Protocol outline']` and no `main main`.
- Every study destination is enumerated: every `/study/$studyId/*` leaf that is
  not a detail route of a listed destination and not under `editorLayoutRoute`
  appears in the study sidebar's link set (invariant 9).
- The landing destination resolves per §6.4 for each of the four cases; signed
  in with zero teams, every app URL resolves to `/no-team`, and `/no-team` does
  not 404 in either topology.
- **Deployment-mode gating is tested at the HTTP layer**, table-driven over both
  lists, against a fixture client dist containing an `index.html`: under
  `self-hosted`, each managed-only path returns 404 with
  `Content-Type: text/html`, the shell body and `Cache-Control: no-store`, while
  `GET /` and `GET /setup` return 200; under `managed`, each managed-only path
  returns 200 and `GET /setup` returns 404. `app.test.ts`'s existing
  `GET /api/v1/nope` ⇒ 404 `application/problem+json` must still pass under the
  new registration order. The oracle is the status code, which today's wiring
  returns as 200, so the test fails against the current tree and against any
  later edit that drops the gate.
- An exhaustiveness test asserts that `MANAGED_ONLY`, `SELF_HOST_ONLY` and an
  explicit `BOTH` list partition `Object.keys(router.routesByPath)` exactly, so a
  route added later fails the test rather than silently defaulting to "both".
- The `createMemoryHistory` tests cover the courtesy layer only — that
  `throw notFound()` renders the not-found component for in-app navigations —
  and are not presented as proof of the 404.
- The migrated URLs resolve; the removed ones do not.

### 11.2 Accessibility tests

- Every app route exposes exactly one `data-route-focus-target` `h1`.
- A simulated navigation that drops focus to `<body>` lands focus on the new
  route's heading and announces its text; a navigation whose destination
  autofocuses a field does **not** move focus. Architect's existing
  `RouteFocus.test.tsx` cases move with the component and must keep passing
  against both routers.
- The drawer traps focus, closes on Escape and restores focus to its trigger.
- Opening the drawer, activating a destination and letting the navigation commit
  leaves no `[inert]` on the destination, lands focus on the destination's `h1`,
  and leaves no open dialog. Blocking the same navigation leaves the drawer open
  and focus inside it.
- Every route in §5.2's table renders exactly one `<main id="main-content">`;
  every site- and app-branch route additionally renders a skip link whose `href`
  resolves to an element present in that route's document.
- The current destination carries `aria-current="page"`.

### 11.3 Interaction tests

Storybook interaction tests for `AppFrame`, `AppArea`, `NavList`, `NavItem` and
`NavDrawer`: collapse and expand, drawer open and close, keyboard traversal,
long-label and RTL rendering.

### 11.4 Permission tests

Two distinct denials, both asserted, both `FORBIDDEN`:

- **Study level** — not a member of the owning team, or a study that does not
  exist. `study.shell` itself refuses, nothing inside the study shell renders,
  and the app shell shows a whole-area denial. Asserted at the RPC layer with
  the client out of the picture: a non-member's `studyId` and an unknown
  `studyId` produce identical `FORBIDDEN` responses.
- **Capability level** — a member of the team lacking a capability (billing,
  roles). `study.shell` succeeds, the sidebar omits the destination as a
  courtesy, and a direct navigation to that URL renders the permission-denied
  state served by the destination's own procedure inside the intact shell.

Both halves of each are asserted; the client-side half alone would let a
client-only check pass for the wrong reason. The code is asserted as `FORBIDDEN`
in both so the client cannot start branching on a code the server does not send.

Deployment-mode refusals are asserted at the RPC layer in both directions
(§10.4, point 4).

### 11.5 End-to-end

One Playwright journey: sign in, land on the study per §6.4, move between three
study areas, open the editor, confirm the outline **replaced** the study sidebar
(exactly one sidebar `<nav>`, named "Protocol outline") and the team and study
chips survived, return to the study, switch team through the header switcher and
confirm the URL committed before the active team changed, sign out. Whether
Studio's suite joins the release-only E2E policy now or once more surfaces exist
remains open on #1244.

## 12. Impact on shipped code

| File                                                                                | Change                                                                                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `client/src/router.tsx`                                                             | Four shell branches, the component-less `studyRoute`, four area layouts, context, preload policy                           |
| `client/src/routes/AppLayout.tsx`                                                   | Becomes the app shell: header + `AppFrame`; hosts the §6.6 reconciler; gains the §6.5 generation token                     |
| `client/src/routes/Home.tsx`                                                        | Removed; replaced by the landing resolution                                                                                |
| `client/src/routes/TeamWorkspace.tsx`                                               | Split into header switcher, `/team/$teamId`, `/team/$teamId/members`                                                       |
| `client/src/routes/Editor.tsx`                                                      | Re-parented; its outline becomes `editorLayoutRoute`'s sidebar                                                             |
| `client/src/routes/AcceptInvitation.tsx`                                            | Success control navigates to the §6.4 destination; `setActive` and the `activationFailed` alert removed; `main` gains `id` |
| `client/src/routes/SignIn.tsx`                                                      | `main` gains `id="main-content"`; signed-in redirect target becomes the §6.4 resolution                                    |
| `client/src/routes/NoTeam.tsx`                                                      | New focused route                                                                                                          |
| `apps/architect/src/components/RouteFocus.tsx`                                      | Replaced by the fresco-ui component; call sites converted                                                                  |
| `server/src/client-assets.ts`                                                       | New: `mountClient(app, env)`, extracted from `index.ts`, carrying the deployment-mode 404 gate                             |
| `server/src/index.ts`                                                               | Calls `mountClient`; the two `serveStatic` mounts move out                                                                 |
| `server/src/rpc.ts`                                                                 | `requireStudy` middleware; `status` receives the deployment mode                                                           |
| `server/src/env/{variables,catalogue,resolve}.ts`                                   | `STUDIO_DEPLOYMENT_MODE` and `deploymentMode` on `StudioEnv`                                                               |
| `apps/studio/netlify.toml`                                                          | Header comment: the site variable is set on the site, not in `[build.environment]`; this lane is managed-only              |
| `packages/studio-rpc/src/surfaces.ts` + `package.json` exports                      | New `./surfaces` subpath: the managed-only / self-host-only / both path lists                                              |
| `packages/studio-rpc/src/{contract,schemas}.ts`                                     | `study.shell`; `StatusSchema` gains `deployment`                                                                           |
| `packages/fresco-ui/src/navigation/SiteNavigation.tsx` + `.messages.ts`             | Skip link and its translated label                                                                                         |
| `apps/networkcanvas.com/app/[locale]/*`, `apps/documentation/components/Layout.tsx` | `id="main-content"` on existing `<main>` elements                                                                          |
| `packages/site-navigation-element`                                                  | `skipToId` documented as an element attribute; README note that the host owns the target                                   |

## 13. Delivery plan

Sequential PRs on `main`, each shippable. Slice 1 is the prerequisite for the
studies client work in #1262 and should land before it.

| #   | Slice                       | Contents                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Frame and route tree**    | fresco-ui `AppFrame`, `AppArea`, `NavList`, `NavItem`, `NavDrawer`, `RouteFocus` with stories and tests; Architect converted to the shared `RouteFocus`; the `SiteNavigation` skip link and `id="main-content"` in networkcanvas.com and documentation; the four shell branches; the session query (§6.2)                                                                          |
| 2   | **App shell and migration** | Header with switchers; `/team/$teamId` and `/study/$studyId` area layouts; `TeamWorkspace` split; editor re-parented; landing resolution, `/no-team` and the `appLayoutRoute` zero-team redirect; `study.shell` and `requireStudy`; the §6.6 active-team reconciler; the §6.5 switcher sequence and the `AppLayout` generation-token fix; `AcceptInvitation`'s `setActive` removed |
| 3   | **Deployment mode**         | `STUDIO_DEPLOYMENT_MODE`, status exposure, `packages/studio-rpc/src/surfaces.ts`, `mountClient` and the HTTP 404 gate with its status-code tests, the two-directional procedure refusals, and the route exhaustiveness test                                                                                                                                                        |
| 4   | **Site shell**              | `SiteNavigation`/`SiteFooter` adoption, marketing home, pricing, legal                                                                                                                                                                                                                                                                                                             |
| 5   | **Sign-up funnel**          | Focused-shell funnel, team creation, first study, invited path                                                                                                                                                                                                                                                                                                                     |

Slices 4 and 5 depend on marketing copy and a plan structure that do not exist
yet; they are specified here so the shell boundaries are right, and sequenced
last so they do not block the studies work.

Billing itself (#1253) is out of scope. This design reserves its routes and
requires the shell to render correctly without it.

## 14. Open questions

1. **Hosted checkout provider.** The design requires only that card handling
   stays outside Studio; the provider is a separate decision with self-host
   implications (a self-hosted instance has no checkout at all).
2. **Sidebar collapse memory.** Whether a collapsed sidebar persists per
   researcher, per area, or not at all. Defaulting to per-researcher in local
   storage until there is a reason to sync it.
3. **E2E policy entry.** Whether Studio's suite joins the release-only E2E
   policy with this work or later (#1244's existing open question).
