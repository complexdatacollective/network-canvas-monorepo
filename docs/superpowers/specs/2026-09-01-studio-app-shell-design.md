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
   authoritative. Better Auth's active-team setting follows the study's owning
   team and is never read as an authorization input — every RPC procedure
   continues to take an explicit `teamId` (the rule the contract already
   states).
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
6. **The session is resolved once and cached**, not fetched per navigation.
7. **Deployment mode is a route input.** Marketing, pricing, sign-up and billing
   exist only in the managed topology; a self-hosted instance serves a genuine
   404, and the server refuses the corresponding procedures independently.
8. **The shell has no layout-only screens.** A destination that exists to be
   clicked through — a list of one study — resolves instead of rendering.

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
return, invitation acceptance and first-run setup. It exists because those
screens are neither marketing nor application: they are single-task, and giving
them the app header would offer navigation to someone who has nowhere to go
yet.

Self-hosted instances serve **focused**, **app** and **participant** only.

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
/invitations/$id      focused
/setup                focused
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

A human-readable study slug can be introduced later as an alias resolved by the
same lookup (`/study/<id-or-slug>`) without breaking a single existing URL. That
is a genuine option the namespacing preserves, not deferred work this design
depends on.

### 5.2 Complete route table

Issue references identify the feature that owns each destination's content; this
design owns only their position and chrome.

**Site** (managed topology only)

| Route              | Purpose             | Issue |
| ------------------ | ------------------- | ----- |
| `/`                | Marketing home      | #1251 |
| `/pricing`         | Plans               | #1253 |
| `/legal/$document` | Terms, privacy, DPA | #1253 |

**Focused**

| Route               | Purpose                                  | Issue        |
| ------------------- | ---------------------------------------- | ------------ |
| `/sign-in`          | Magic link, OAuth, SSO                   | #1255        |
| `/sign-up`          | Account creation                         | #1255        |
| `/sign-up/team`     | Name the team                            | #1249        |
| `/sign-up/plan`     | Plan selection (managed)                 | #1253        |
| `/sign-up/checkout` | Hand-off to hosted checkout (managed)    | #1253        |
| `/sign-up/complete` | Checkout return; creates the first study | #1253, #1262 |
| `/invitations/$id`  | Invitation acceptance (**shipped**)      | #1256        |
| `/setup`            | First-run configuration (self-host)      | #1250        |

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

| Route                                                        | Purpose                                  | Issue               |
| ------------------------------------------------------------ | ---------------------------------------- | ------------------- |
| `/`                                                          | The team's studies; create; import       | #1262, #1280        |
| `/members`                                                   | Membership and invitations (**shipped**) | #1256               |
| `/roles`                                                     | Role assignment and PII grants           | #1257               |
| `/activity`                                                  | Audit trail (**shipping in #1554**)      | #1259               |
| `/billing`                                                   | Plan, seats, invoices (managed)          | #1253               |
| `/settings`                                                  | Name, defaults, deletion                 | #1249               |
| `/settings/api`, `/settings/webhooks`, `/settings/messaging` | Integrations                             | #1288, #1291, #1305 |

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
tree gains four layout routes below the root and three area layouts below the
app layout:

```
rootRoute                       createRootRouteWithContext<ShellContext>()
├── siteLayoutRoute             id: 'site'         SiteNavigation + SiteFooter
│   ├── '/'  '/pricing'  '/legal/$document'
├── focusedLayoutRoute          id: 'focused'      centred panel
│   ├── '/sign-in'  '/sign-up/*'  '/invitations/$id'  '/setup'
├── participantLayoutRoute      id: 'participant'  no chrome
│   └── '/enter/$token/*'
└── appLayoutRoute              id: 'app'          header; requires a session
    ├── accountLayoutRoute      '/account'         sidebar: account settings
    ├── '/gallery/*'  '/templates'                 no sidebar
    ├── teamLayoutRoute         '/team/$teamId'    sidebar: team administration
    └── studyLayoutRoute        '/study/$studyId'  sidebar: the study
        ├── '/'  '/participants'  '/waves'  …
        └── editorLayoutRoute   '/editor'          sidebar: protocol outline
```

**The sidebar is owned by the area layout route, not by the app layout.** This
is what makes "the sidebar is always the thing you are inside" structural rather
than conventional: there is no place to render a sidebar for a route whose area
has not declared one, and the editor's outline is not a special case — it is
`editorLayoutRoute`'s sidebar, expressed the same way `studyLayoutRoute`
expresses the study's.

`appLayoutRoute` renders the header and an `<AppFrame>` region; each area layout
renders its sidebar and `<main>` into that region. Because the area layout stays
mounted while navigating within its area, sidebar state (scroll position, the
mobile drawer, collapsed groups) persists across navigations within an area and
resets between areas, which is the correct behaviour in both cases.

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
- Study chip, when inside a study — a switcher over that team's studies,
  omitted entirely when the team has one study.
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
  ————————
  Study settings
```

The grouping encodes the study lifecycle rather than decorating the list; it is
the reason a sidebar beats a tab strip here, and the labels must be
translatable whole strings.

Destinations whose contents are countable carry their count — participants,
waves, sessions, versions, protocol assets. The counts come from `study.shell`
(§6.3) rather than from a request per destination, they are omitted rather than
shown as zero when the area is empty, and they are decoration for assistive
technology: the count is part of the link's accessible name ("Participants, 84")
so it is not announced as a stray number.

**Editor sidebar** is the protocol outline specified by #1272 — codebook,
ordered stages, assets, translations — with a "Back to study" affordance at the
top that returns to `/study/$studyId`.

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
  icons. The `AppFrame` contract in §9 is designed so a rail can be added later
  without rewriting the area layouts, should multi-study teams prove common.
- **Team-scoped study URLs** (`/team/$teamId/study/$studyId`). Rejected: the
  team is derivable from the study and the redundancy makes every study URL
  longer and every study link require two identifiers to construct.

## 6. Shell state and data

### 6.1 Router context

```ts
type ShellContext = {
  queryClient: QueryClient;
  session: SessionSnapshot | null;   // resolved once at boot, cached
  deployment: { mode: 'managed' | 'self-hosted'; billing: boolean };
};
```

Injected via `createRootRouteWithContext<ShellContext>()` and supplied to
`RouterProvider`. `beforeLoad` guards read the context rather than issuing
requests.

### 6.2 Session resolution

`probeSession()` currently calls `authClient.getSession()` inside
`beforeLoad` on every navigation into the authenticated tree. With one
destination that is a request per sign-in; with a shell and a dozen
destinations it is a request per click.

Replace with a session query resolved through
`queryClient.ensureQueryData(sessionQueryOptions)` — one network call at boot,
served from cache afterwards, invalidated explicitly on sign-in, sign-out and 401. The three-state result (`signedIn` / `signedOut` / `unreachable`) and its
503-means-no-database handling are preserved exactly; only the caching changes.

Set `defaultPreload: 'intent'` with `defaultPreloadStaleTime: 0` so TanStack
Query's own freshness rules govern preloaded route data rather than the router's
separate 30-second window.

### 6.3 Study resolution and team derivation

`studyLayoutRoute`'s loader calls one procedure that answers four questions at
once:

```ts
study.shell({ studyId }) -> {
  study: { id, name, state, waveSummary },
  team:  { id, name, role },
  permissions: string[],   // effective capabilities for this researcher
  studyCount: number,      // whether the study switcher renders at all
  counts: {                // sidebar counts; a key is absent when it is zero
    participants?: number, waves?: number, sessions?: number,
    versions?: number, assets?: number,
  },
}
```

This is the authorization check (a non-member gets `NOT_FOUND`, not
`FORBIDDEN` — no existence oracle, matching the team procedures' existing
posture), the header's team chip, the sidebar's permission gating and the
switcher's visibility. It is not an additional round trip: the route cannot
render without it.

Better Auth's active organization is reconciled to `team.id` as a side effect,
using the serialisation already established in `TeamWorkspace`'s team-switch
handling. Active team remains unused as an authorization input.

### 6.4 Landing destination

Signing in resolves rather than listing:

1. One team, one study → `/study/$studyId`.
2. One team, several studies → `/team/$teamId`.
3. Several teams → the most recently active team, resolved as above.
4. No team → the focused "you have no team yet" state, which offers team
   creation in the managed topology and explains the invitation path otherwise.

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

## 7. Accessibility

#1317 makes this an acceptance criterion; the shell is where most of it is
either won or lost, because it is the part every route inherits.

### 7.1 Landmarks and skip link

`AppFrame` renders exactly one `<header>`, one `<nav>` per navigation region
with a distinct accessible name ("Study", "Team", "Protocol outline"), and one
`<main id="main-content">`. The skip link already in `AppLayout` moves into
`AppFrame` so every shell gets it.

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
- The mobile drawer is a Base UI dialog: focus trapped while open, Escape
  closes, focus returns to the trigger, and the page behind is inert.
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

| Subpath                 | Responsibility                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `layout/AppFrame`       | Header / sidebar / main grid, skip link, landmarks, responsive collapse and drawer              |
| `navigation/NavList`    | A navigation region: labelled `<nav>`, optional groups                                          |
| `navigation/NavItem`    | One destination; link supplied by render prop (router-agnostic, as `SiteNavigation` already is) |
| `navigation/NavDrawer`  | The narrow-viewport presentation of a `NavList`                                                 |
| `navigation/RouteFocus` | `routeFocusTargetProps`, `focusRouteTarget`, and the announcer, moved from Architect            |

`AppFrame` takes an optional leading rail slot it does not currently use. That
is the seam that lets the rejected icon-rail alternative (§5.6) be adopted later
without touching any area layout.

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

### 10.2 Sign-up funnel

Account → team → plan → checkout → first study. The funnel's last step hands the
researcher an editor rather than an empty dashboard.

The invited-collaborator path skips team creation, plan and payment entirely:
`/invitations/$id` (shipped) accepts, then resolves to the study they were
invited to. The two paths share the focused shell and nothing else.

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

`STUDIO_DEPLOYMENT_MODE` (`managed` | `self-hosted`) joins the server env
catalogue, defaulted at the resolve layer rather than in the schema — the
`variables.ts` no-`.default()` rule exists so that a value cannot be compiled
into the production bundle.

The mode is exposed on the existing `status` procedure, read into `ShellContext`
at boot. The site and billing branches `throw notFound()` when the mode is
`self-hosted`, and the server independently refuses the corresponding
procedures. The SPA is not the boundary; it is the courtesy.

The failure this prevents is concrete: a university's self-hosted instance
serving a pricing page.

## 11. Verification

### 11.1 Route-tree tests

Using `createAppRouter(createMemoryHistory({ initialEntries: [...] }))`, as the
existing client tests already do:

- Each route renders the shell its branch declares, asserted by the presence and
  absence of chrome landmarks. A participant route renders no `<nav>`; a site
  route renders no app header.
- A route added under the app layout without a sidebar-owning area layout fails
  to compile — the area layouts, not the app layout, own the sidebar slot.
- Self-hosted mode 404s `/`, `/pricing` and `/team/$teamId/billing`, and serves
  the app routes unchanged.
- The landing destination resolves per §6.4 for each of the four cases.
- The migrated URLs resolve; the removed ones do not.

### 11.2 Accessibility tests

- Every app route exposes exactly one `data-route-focus-target` `h1`.
- A simulated navigation that drops focus to `<body>` lands focus on the new
  route's heading and announces its text; a navigation whose destination
  autofocuses a field does **not** move focus. Architect's existing
  `RouteFocus.test.tsx` cases move with the component and must keep passing
  against both routers.
- The drawer traps focus, closes on Escape and restores focus to its trigger.
- The current destination carries `aria-current="page"`.

### 11.3 Interaction tests

Storybook interaction tests for `AppFrame`, `NavList`, `NavItem` and
`NavDrawer`: collapse and expand, drawer open and close, keyboard traversal,
long-label and RTL rendering.

### 11.4 Permission tests

A researcher without a capability does not see its destination, **and** a direct
navigation to that URL renders the permission-denied state served by the server
rather than a blank area. Both halves are asserted; the first alone would let a
client-side-only check pass for the wrong reason.

### 11.5 End-to-end

One Playwright journey exercising the shell as a whole: sign in, land on the
study, move between three areas, open the editor, confirm the outline replaced
the sidebar and the team chip survived, return, switch team, sign out. Whether
Studio's suite joins the release-only E2E policy now or once more surfaces
exist remains open on #1244.

## 12. Impact on shipped code

| File                                           | Change                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `client/src/router.tsx`                        | Four shell branches, three area layouts, context, preload policy     |
| `client/src/routes/AppLayout.tsx`              | Becomes the app shell: header + `AppFrame`                           |
| `client/src/routes/Home.tsx`                   | Removed; replaced by the landing resolution                          |
| `client/src/routes/TeamWorkspace.tsx`          | Split into header switcher, `/team/$teamId`, `/team/$teamId/members` |
| `client/src/routes/Editor.tsx`                 | Re-parented; its outline becomes `editorLayoutRoute`'s sidebar       |
| `apps/architect/src/components/RouteFocus.tsx` | Replaced by the fresco-ui component; call sites converted            |
| `packages/studio-rpc/src/contract.ts`          | `study.shell`; `status` gains deployment mode                        |
| `server/src/env/variables.ts`                  | `STUDIO_DEPLOYMENT_MODE`                                             |

## 13. Delivery plan

Sequential PRs on `main`, each shippable. Slice 1 is the prerequisite for the
studies client work in #1262 and should land before it.

| #   | Slice                       | Contents                                                                                                                                                                                         |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Frame and route tree**    | fresco-ui `AppFrame`, `NavList`, `NavItem`, `NavDrawer`, `RouteFocus` with stories and tests; Architect converted to the shared `RouteFocus`; the four shell branches; session in router context |
| 2   | **App shell and migration** | Header with switchers; `/team/$teamId` and `/study/$studyId` area layouts; `TeamWorkspace` split; editor re-parented; landing resolution; `study.shell`                                          |
| 3   | **Deployment mode**         | `STUDIO_DEPLOYMENT_MODE`, status exposure, site/billing gating, server-side refusal, the 404 tests                                                                                               |
| 4   | **Site shell**              | `SiteNavigation`/`SiteFooter` adoption, marketing home, pricing, legal                                                                                                                           |
| 5   | **Sign-up funnel**          | Focused-shell funnel, team creation, first study, invited path                                                                                                                                   |

Slices 4 and 5 depend on marketing copy and a plan structure that do not exist
yet; they are specified here so the shell boundaries are right, and sequenced
last so they do not block the studies work.

Billing itself (#1253) is out of scope. This design reserves its routes and
requires the shell to render correctly without it.

## 14. Open questions

1. **Hosted checkout provider.** The design requires only that card handling
   stays outside Studio; the provider is a separate decision with self-host
   implications (a self-hosted instance has no checkout at all).
2. **Study switcher threshold.** The switcher is specified as omitted at one
   study. Whether it should appear at two or only at three is a question for
   pilot-partner observation, not a structural one.
3. **Sidebar collapse memory.** Whether a collapsed sidebar persists per
   researcher, per area, or not at all. Defaulting to per-researcher in local
   storage until there is a reason to sync it.
4. **E2E policy entry.** Whether Studio's suite joins the release-only E2E
   policy with this work or later (#1244's existing open question).
