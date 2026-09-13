# @codaco/studio-client

## 0.3.0

### Minor Changes

- Add sanitized Studio error reporting through the existing Network Canvas relay, with one runtime telemetry setting that defaults on for managed and self-hosted deployments. Setting it to false prevents browser and server SDK initialization and telemetry traffic. Error reports omit personal information and protocol content, and fatal reporting preserves the server's bounded shutdown behavior.
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

- Add configurable researcher activity alerts for participant contact access,
  integration credential activity, and repeated access denials. Alerts can be
  delivered in Studio or by the configured email transport, recheck current
  membership and preferences before delivery, and preserve interrupted email
  handoffs as visible uncertainty without automatically resending them.
- Studio's interface can now be shown in a language other than English. Every
  piece of copy in the researcher-facing application and the public pages is
  translated rather than built into the code, and British English is available
  alongside US English.

  The language is chosen for you on first visit from what your browser asks
  for, and you can set it yourself at Account → Language. Signed in, that
  choice is stored on your account and follows you to any device; signed out,
  it is remembered in the browser you set it in.

  Studio keeps its declared English and British English subset when other
  applications add Spanish to the shared ecosystem, so it never offers an
  unsupported account preference or incomplete translation.

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
- Add first-run setup for self-hosted Studio instances. An operator's single-use setup token creates the initial owner account and team, and completing setup remains permanent across restarts and account deletion. Further self-hosted account creation requires an invitation and a verified email through magic-link or OAuth sign-in.
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

### Patch Changes

- Merge `@codaco/protocol-builder`'s own message catalog into the one the Studio
  client serves. The stage editors Studio mounts come from that package and
  declare their own `protocolBuilder.*` ids; without this layer an en-GB reader
  saw every one of them fall through to the source string.
- The protocol editor now keeps up with everyone else editing the protocol. A
  screen a collaborator adds, renames, deletes or moves appears in the outline
  beside the editor as they do it, and the validation panel is checked against
  the protocol as it stands rather than as it was when the editor was opened.
- The protocol editor runs on the `@codaco/protocol-builder` host contract. The
  screen used to build its own editing session — a lease it renewed on a timer,
  a command queue, and a form of its own holding a screen name and a page
  heading — and to draw undo, redo and a pending-change count beside it. All of
  that belonged to a collaboration model the package no longer has: one editor
  holds a screen while it is open, so the package owns the form, submits the
  whole screen, and needs none of it.

  The screen now mounts the package's own editor for whichever interface the
  selected screen is, over one channel per open protocol. Studio keeps what is
  Studio's: the outline and its reordering, the section selector, the validation
  panel, and the save control — which is rendered through the editor's action
  slot and still asks before unsaved values are discarded.

  With the editing session gone, so are the RPC procedures only it called:
  `protocols.acquireSection`, `commitSection`, `renewSection` and
  `releaseSection`, their input and result schemas, and the command-patch wire
  format they carried. Sections are locked and written through `protocolBuilder`
  alone, which takes a whole section document rather than a list of commands, so
  there is no second way to write a draft and no second lock model to keep in
  step with the first. The audit properties those procedures carried — the event
  a write records, that a retried write records no second one, that no
  researcher value reaches the audit details, and that a failed audit insert
  rolls the write back with it — are asserted against `protocolBuilder.submit`
  instead of being dropped.

- Keep the protocol editor working across a dropped connection, and close its
  socket when the researcher signs out. The editor's WebSocket link never
  reconnected, so a single transient drop left every lock, save and live update
  going to a closed connection until the page was reloaded — and the server's
  grace period, which keeps the screen a researcher is editing theirs across a
  reconnect, could not be reached at all. The socket also outlived sign-out,
  which matters because the server reads the account once, when the socket is
  opened, and attributes every later message to it: signing in as somebody else
  in the same tab would have edited and been audited as the previous researcher.
  Ending a session now ends the tab's connection to the editor rather than only
  closing its socket, because the link reconnects on its own schedule: a
  reconnection already scheduled when the researcher signed out would otherwise
  open a replacement while their session was still valid, and a request left
  waiting for one would have travelled on the next account's socket. Every way
  out of a session does it, because it happens wherever the app learns that
  nobody is signed in — signing out, switching accounts from an invitation, and
  a session that expires or is ended in another tab, on a public page as much as
  inside the app.
- Take the protocol-authoring contract from `@codaco/protocol-builder-core`
  rather than `@codaco/protocol-builder`. The contract, its schemas and its typed
  errors are unchanged — they now live in a package with no React and no
  `@codaco/fresco-ui` in its dependency closure, so a change to the stage
  editors' UI no longer invalidates the server's build and test selection.
- Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. A section lock belongs to the browser tab that took it rather than to the socket that carried the call: the client mints an id once per page load and sends it as a header on every `/rpc` call, and the server reads the same id off a `/ws` upgrade URL, because a browser cannot put a header on a handshake. It is never persisted, because a browser copies `sessionStorage` into a duplicated tab and two documents naming one owner would both be granted the same section. So two tabs of one researcher are two owners and the second opens read-only behind the first, but a tab whose socket drops is the same tab when it reconnects and still holds the section it has open. A tab that never comes back gives its sections up, with the lock events that say so, once the reconnect grace is out. A write that has to change a section it holds no lock on is refused naming who holds it: a create while an editor has the stage index open, and a write promoting resources while one has the asset manifest open, since that editor's next whole-section submit would take the new pointer or the new manifest entry straight back out. A create takes a promotion of its own, for the reason a submit cannot cover — a stage being added can carry a file imported while it was composed, and there is no earlier revision of it to promote with — so the section, its pointer and the manifest entries land in one revision or not at all. A retried write is answered with what its first attempt committed rather than writing again, which for a create means the stage it already made rather than a second copy: every submit and every create carries an idempotency key of its own, and the receipt for it is written in the same transaction as the revision it describes, so the answer survives a restart — the client whose answer went missing is exactly the client reconnecting to a server that came back up. Staged resources belong to the edit that imported them rather than to the connection, because one researcher can have a codebook dialog open over a stage editor: neither one's cancel takes away the file the other is about to submit, and neither one's submit promotes what the other imported. Promoted bytes are committed under their content hash, so two imports of different files sharing a filename stay two assets, while the manifest still records the name the researcher gave them. Deleting a stage other stages depend on is refused naming where they name it, rather than silently rewriting a collaborator's skip logic as a side effect. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read — including the stage dependants a deletion is refused for, derived from the protocol schema's own stage-reference tags — and exports the per-section shape check they had each written for themselves.
- Every problem listed under Validation in the protocol editor now reads as a
  sentence in your own language. Problems about a screen's resources — an image
  or a participant data file the protocol no longer holds — are written by the
  editor rather than by the protocol format, and one of those could appear as
  unreadable machine text instead of the sentence it stands for.
- Run Studio as a combined service or separate web and worker processes. Web startup refuses a second replica, and shutdown stops new delivery claims while active requests and WebSockets drain. Runtime database roles can read schema readiness without changing migration evidence. Completed self-hosted setup now permanently returns not found and sends the new owner to sign-in.

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
