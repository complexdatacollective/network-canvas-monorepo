# @codaco/studio-client

## 0.3.0

### Minor Changes

- Studio's masthead becomes the application shell. Every authenticated screen sat
  under a wordmark and a sign-out button, and each route declared its own
  `<main id="main-content">` — three of them in the editor alone, so which element
  the skip link reached depended on which branch had rendered.

  The app branch now renders the shared `AppFrame`: one skip link, one header, and
  a region that each area layout renders its navigation region and its `<main>`
  into. The header carries a team switcher over the teams the researcher belongs
  to, and an account menu holding sign out. That sign-out now carries a token on
  the navigation it makes and checks for it before ending the session, so a sign-
  out the researcher cancelled at the editor's unsaved-work prompt cannot resume
  when they navigate somewhere else later. The team workspace and the activity
  screen sit under a team area layout with a sidebar, and the Activity destination
  moves into it from the workspace's own header, so it is offered in one place
  rather than two. The editor sits under an area of its own, which owns the
  landmark its three branches used to declare separately.

  The shell also stops subscribing to the session. `AppLayout` called
  `authClient.useSession()`, which fetched `/api/auth/get-session` a second time on
  every page load on top of the request the route guard had already made and
  cached. The guard is now the only reader, and it is also where a session that has
  ended clears the researcher's cached data and leaves for the sign-in page — past
  a dirty-form blocker, because there is no editor state left worth keeping.

- Studio's interface can now be shown in a language other than English. Every
  piece of copy in the researcher-facing application and the public pages is
  translated rather than built into the code, and British English is available
  alongside US English.

  The language is chosen for you on first visit from what your browser asks
  for, and you can set it yourself at Account → Language. Signed in, that
  choice is stored on your account and follows you to any device; signed out,
  it is remembered in the browser you set it in.

- Put real numbers on the study sidebar's countable destinations, so a researcher
  can see how much is in a study without opening each screen to find out.
  Versions, Participants, Waves and Sessions each carry the count the app-shell
  design gives them, read from the study's own rows through a new
  `studies.counts` procedure: one query, addressed by the study alone and
  refused for exactly the studies its reader could not open, so the four
  numbers are always describing the same study at the same moment.

  A count is a claim, and an unchecked one is worse than none. Until the answer
  arrives — and if it never does, because the read failed — the rows render
  exactly as they did before, with no number at all. A
  study with nothing in it is left unnumbered for the same reason: "Participants"
  reads better than "Participants 0", and neither is ever invented on the
  client's behalf.

  API tokens in the account area gets no count. Tokens are owned by a team and
  answerable to a custodian, so "how many are mine" is not a question the data
  model can answer, and a number that quietly meant "this team's tokens" would be
  the wrong answer rather than a missing one.

- Studio's database now carries its whole decided data model rather than only teams and protocols: studies with their waves, participants, interview sessions and links, the collected network (nodes, edges, snapshots and per-session rollups), study roles, consent, scheduling and messaging, team-owned API tokens, asset metadata, templates, webhooks, experiments, feedback, monitoring rollups, and the audit log's staged exports and alert outbox — 32 new tables, every one team-scoped under forced row-level security with the closed-study, finalized-session and participant-erasure rules enforced by database triggers. A fresh Studio instance now seeds itself with synthetic demo data across that model instead of an empty database: a handful of teams with members across every role, studies in every lifecycle state with realistic interview networks, and a fixed admin account (`admin@studio.test` / `studio-admin-not-for-production`) that owns every seeded team and holds a Manager grant on every seeded study. Email/password is now a full third sign-in method alongside magic-link and social — the sign-in screen offers a password form (toggling with magic-link when both are available), and the server accepts it through the real `/api/auth/sign-in/email` endpoint. `pnpm dev` resets and reseeds the database on every boot; the deploy-time `seed` command does the same against any target, refusing a non-local database unless `--force` makes that explicit, matching `db:reset` — and both refuse to give a non-local database the published admin password, taking `STUDIO_SEED_ADMIN_PASSWORD` instead.
- Give Studio every destination the application shell design specifies, so the
  product's shape is something a researcher can see and address rather than
  something only the design document knows about. The route tree gains the
  marketing, sign-up, first-run, no-team and participant screens on the branches
  that own their chrome, and the whole of the platform, team and study levels
  below the app shell: the account area, the gallery and template libraries, team
  administration, and the study — overview, participants, waves, sessions,
  schedule, recruitment, versions, export and settings, with the protocol editor
  as a sibling area whose outline replaces the study sidebar rather than nesting
  inside it.

  Each unbuilt screen names itself, says in a sentence what it will do, and names
  the issue that builds it. That is a different thing from a broken link, and a
  different thing again from a navigation edited down to whatever happens to work
  today: hiding an unbuilt destination misdescribes the product, and linking to
  nothing misleads about it.

  The navigation is complete for the first time. The header carries the wordmark,
  the team the researcher is acting in, the study they are acting in when they
  are inside one, the gallery and template libraries, and their account. The team,
  study, account and protocol-outline sidebars carry every destination their area
  has. The one row that is not a link is billing on a self-hosted instance, which
  is a destination that deployment genuinely does not have: it is shown, and it
  explains itself, rather than being quietly dropped from the list.

  `$studyId` addresses a protocol until the studies model lands (#1262), and `/`
  is still the team workspace rather than the marketing home until that workspace
  splits into the team area.

- Give Studio's routes the four shells the application shell design specifies, and stop asking the auth endpoint on every navigation. The route tree gains site, focused, participant and app layout branches below the root, so a route's chrome follows from where it sits: sign-in and invitation acceptance move to the focused branch, and the authenticated tree moves to the app branch. The session is now one query with `staleTime: Infinity`, which guards read with `fetchQuery`, so entering the authenticated tree a dozen times costs one request rather than a dozen. A procedure refusing with 401 invalidates that query and re-runs the guards, so an expired session is noticed without waiting for the next navigation. The 503 no-database answer still means signed out, and an unreachable server still reaches the error screen instead of the sign-in page.
- Studio's study picker now lists and creates real studies instead of protocols. `/team/$teamId` shows each study with its lifecycle state, its participation mode and its wave and participant counts, and creating one writes the study and its protocol line together in a single transaction — so every study has something to design, and the creator receives the study's first Manager grant. Who sees what follows the decided role model: a team Admin or Owner sees every study their team owns, and a team Member sees only the studies they hold a study role on; creating a study is an Admin or Owner action, and a refusal is recorded in the team's activity log alongside the creation itself. A `/study/…` link now opens the study it names from any starting point — the server works out which team owns it from the study identifier alone, rather than the browser having to know, so a bookmark or a shared link opens correctly on a first sign-in that has no team selected yet. The header's study chip names the study instead of showing its identifier and offers the team's other studies, and the protocol editor reaches its draft through the study's protocol rather than treating the study identifier as a protocol identifier.
- Let team owners and admins observe their team's immutable activity record: a permission-checked audit.list/audit.get RPC surface with sequence-cursor pagination and server-rendered event titles, and a team activity screen with category, action, actor, outcome, and date filters, Load more pagination, and an accessible per-event detail view. Members are denied with a committed, rate-limited audit.read_denied event, and events recorded by a newer Studio version render through a safe generic presentation.
- The header's two bespoke switchers are replaced by the shared
  `TeamAndStudySwitcher`, so the team and the study read as one path rather than
  as two controls that happen to sit beside each other.

  The team shown is the one the URL names, falling back to the active-team
  setting only where no route names a team, so the header cannot announce the
  team a researcher is leaving — and that fallback is resolved through the
  membership list, so a setting that outlived its membership names nothing
  rather than offering to administer a team the researcher has left. A team list
  that fails while an earlier one is still in hand goes on offering that one.
  Choosing the team already current does nothing. A researcher who belongs to no
  team gets no segment at all, and a loading list shows a skeleton rather than
  reflowing the header.

  Reporting a team list that could not be read at all belongs to the shell, not
  to the switcher, which shows what it was given and nothing about why.

  The study segment is absent, not empty, on routes that open no study.

  Everything it shows is real. Each study carries its lifecycle state and how
  much of it there is — "Live · 2 waves · 14 participants" — with a dot coloured
  by that state, and the state is in the trigger's accessible name too, so it
  never rests on colour alone. Each team carries the researcher's role in it.
  A study whose team cannot be resolved is named by its identifier and offered
  no siblings, which is what the shell honestly knows about it.

  `me` carries the caller's memberships now — every team they belong to, and
  their role in it — which is why `@codaco/studio-rpc` and
  `@codaco/studio-server` are versioned alongside the client. Better Auth's own
  team list joins the member table and then returns only the organization, so
  nothing else could tell the switcher what a researcher is in each of their
  teams. The role travels as a plain string rather than the role enum, because
  a legacy membership is stored as one comma-separated value and an enum would
  fail the whole response over it.

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Add a team workspace with a persistent active-team switcher, team-scoped protocols, member and invitation views, collaborator invitations, and owner/admin role management.

### Patch Changes

- Saving a screen now merges into the draft as it stands at that moment, rather
  than into the copy the form was opened with. A change that arrived while the
  screen was open — a save from another editor, or an acknowledgement of your
  own earlier one — is no longer overwritten by the save that follows it.
