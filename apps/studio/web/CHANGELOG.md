# @codaco/studio-web

## 0.4.0

### Minor Changes

- Studio reports unexpected failures to its telemetry destination, once each,
  while `STUDIO_TELEMETRY` is on. A defect in an RPC or HTTP handler is reported
  with its request id and team id, and a job that fails for good is reported
  with its queue and job id. An interrupted request and a typed refusal are never
  reported. Each report carries the error's type, its stack frames and the
  installation id, never the error's message. With no OpenTelemetry endpoint set
  the report is a PostHog Error Tracking event with no person profile, sent with
  Effect's HTTP client. With an endpoint set it is an error-level log record with
  `exception.*` attributes. With telemetry off the reporter is never built.

  The public `status` RPC now says whether telemetry is on. The researcher web
  app, and a participant page whose session says so, catch uncaught errors and
  unhandled rejections and send the error's type and its frames inside Studio's
  own bundle to a new same-origin `telemetry.report` RPC, without cookies. The
  API drops these reports while telemetry is off, refuses any frame that does not
  name a bundle file, and limits them to 30 a minute per client address
  (`error_report_address`). Nothing is written to cookies or local storage, and
  `posthog-js` is no longer part of the Studio bundle. A `studio-web` image
  built with the BuildKit secrets `posthog_personal_api_key` and
  `posthog_project_id`, and the build arg `SOURCE_MAPS_TARGET` naming the
  destination project, uploads the source maps of the bundle it ships to PostHog
  and deletes them before the image is assembled. Without them nothing is
  uploaded. The build fails if the build arg and the secrets are not supplied
  together.

  Exported spans and log records no longer carry an error message, even one that
  spans several lines, and span events no longer carry the `effect.cause` text.

- The researcher web app and participant pages now send operational logs to the
  same telemetry destination as the server, through the api, while
  `STUDIO_TELEMETRY` is on. The public `status` RPC reports the configured
  `STUDIO_LOG_LEVEL`, and `participant.session` reports it to an interview page
  (`null` while telemetry is off), so a page logs at that level and sends nothing
  while telemetry is off.

  The researcher app logs RPC requests that never reached the server, editor
  connections that dropped and came back, editing locks that were lost or
  refused, screens that failed to render, and update checks that failed.
  Participant pages log only entries from a fixed catalogue: a session that
  failed to load, an answer save that failed or succeeded only after retrying, a
  connection lost or restored, an asset that failed to load, and a stage that
  failed to render. Every entry has a constant message, and its attributes are
  limited to a stage index, an interface type, a fault code, an attempt count and
  a duration.

  The api receives these records at `/api/telemetry/researcher/logs` (signed-in
  researchers) and `/api/telemetry/participant/logs` (a valid participant
  session), same origin only, with a 64 KiB body bound and two new rate limits:
  `researcher_log` (60 a minute per researcher) and `participant_log` (30 a minute
  per participant session). It refuses a whole participant batch that holds any
  record outside the catalogue or any extra or free-text attribute, drops any
  researcher record that is not a catalogued entry, drops records below the
  configured level, and forwards the rest as `service.name = studio-web` with the
  installation id, the surface and, where it is known, the team.

### Patch Changes

- The api now forwards a participant page's usability events to PostHog only when every event in the batch is in the interview's analytics catalogue and every property decodes to its declared type, with no property the catalogue does not declare. A batch holding any other event, an extra property, free text where a code or number is expected, or a timestamp that is not an ISO 8601 UTC instant is refused whole and nothing in it is forwarded, as the participant log route refuses a batch.

  Of what decodes, the api forwards the event's catalogued codes, numbers and flags. It replaces each entity id with an id derived on the server from the installation, the session and the page's id. It stamps each event with the server's clock, keeping from the page's timestamps only the order and spacing of the batch's events, up to ten minutes apart. It reports an exception's type only when it is a standard JavaScript or DOM error name, and `Error` otherwise. It withholds the interview package version, the protocol digest, a stage crash's component stack, and the identifiers the page reports about itself, which the server sets. The participant contract now declares the `$exception_list` shape and the timestamp a participant page sends.

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

  Studio keeps its declared English and British English subset when other
  applications add Spanish to the shared ecosystem, so it never offers an
  unsupported account preference or incomplete translation.

- Studio now ships as two container images instead of one. `studio-api` carries
  the server, and its entrypoint chooses the process: `serve` for HTTP, RPC and
  the WebSocket endpoint, `worker` for background jobs, `migrate`, which creates
  and upgrades the schema — so a deployment no longer needs a repository checkout
  to provision one — and `maintenance on|off` and `rotate-secrets`. `studio-web` is nginx serving the built client,
  its hashed assets under a year-long immutable cache, and a static maintenance
  page for the seconds an upgrade replaces the API.

  The server no longer serves the client in any topology, and the Netlify entry
  point and its configuration are gone with it. The gate that used to refuse the
  other deployment's page paths at the HTTP layer is now the client's alone: a
  route belonging to one topology answers with a branded not-found screen on the
  other, and an address that matches no route at all gets the same screen instead
  of the router's default text. `CLIENT_DIST` is removed.

  `migrate` applies everything in one transaction, so a run that fails part-way
  leaves the database as it found it rather than in a state the next run would
  refuse. A process that will not boot against a database now prints remedies it
  can actually run: the image's commands in a container, the repository's scripts
  in a checkout.

  Both processes answer `GET /healthz` (liveness) and `GET /readyz`, which
  reports each dependency — the database, the schema fingerprint, the object
  store, and, on the worker, the job queue — and answers 503 naming the
  one that failed. The worker serves them on a loopback-only listener, on the new
  `WORKER_HEALTH_PORT` (default 3001), so a container healthcheck can ask a
  process that answers nothing else whether it is working.

  The protocol store now keeps an unreferenced section for three days rather than
  one, so the window always exceeds the daily backup interval.

- A freshly installed Studio instance can now be set up by the person who
  installed it. Until now a new deployment had no account to sign in with and no
  way to create one: `/setup` was a placeholder, and the only account any
  instance had came from the development seed.

  The command that creates the database now issues a **bootstrap token** and
  prints it once, in the output the operator is already reading, with the address
  to spend it at. `/setup` takes that token, the name this instance should be
  known by, and the first owner's account — and signs them in as it completes, so
  setting an instance up ends on their own screen rather than back at a sign-in
  form. Only a hash of the token is stored, so a lost one is recovered by running
  the database command again: an instance nobody owns issues a fresh token, and
  an instance somebody owns issues none and prints nothing. Once there is an
  owner, `/setup` is gone — it answers as a page that is not there, on every
  later deploy — so a repeated deploy command can never reopen the door to a live
  instance.

  The name given at setup is stored with the instance, and both status
  surfaces — the app's `status` procedure and `/api/v1/status` — report it in
  place of the product name. Whether first-run setup is still outstanding is
  reported beside it.

  In development nothing changes: the seed makes `admin@studio.test` the owner
  and names the instance `Studio (development)`, so every boot comes up already
  set up.

- The language Studio speaks to you moves out of the account area and into the
  header, reachable from every screen. It names the language in use, written in
  that language, and opens a list of every interface language, each written in
  itself. The first entry, Automatic, says which language the browser currently
  resolves to. In a narrow header the name gives way to a globe button.
  A search box at the top of the list finds a language by its name.

  Choosing an entry applies at once and closes the list. A choice that could not
  be saved to your account is reported in the list's footer, with a button to
  try again.

  The `/account/language` screen and its entries in the account sidebar, account
  menu, everything bar and the surface contract are gone; a researcher with no
  team still finds the switcher on the screen they are held on.

- Studio can now be upgraded without losing data. Every release carries its
  schema as numbered migrations, and `migrate` applies the ones a database has
  not recorded yet, all in one transaction: on a new database it creates the
  schema, on a current one it changes nothing, and on an older one it brings it
  forward. It refuses, and changes nothing, a database a newer Studio has
  migrated, one whose recorded migrations differ from the release's, or one with
  Studio's tables and no migration history, and says what to do in each case.

  An upgrade is one sequence of Docker commands, documented in the self-host
  guide's upgrade page, for every release whether or not it changes the schema:

  ```bash
  docker compose run --rm --no-deps api maintenance on
  # wait until /readyz names maintenance mode
  docker compose stop api worker
  # take your backup now
  docker compose pull
  docker compose up -d web api worker
  docker compose run --rm migrate
  docker compose run --rm --no-deps api maintenance off
  ```

  `maintenance on` closes the instance: every request except `/healthz` and
  `/readyz` gets the maintenance page with 503, and the worker claims no more
  jobs. An optional reason — `maintenance on Upgrading to 1.4` — is repeated by
  `/readyz`. Once `/readyz` names maintenance mode, the sequence stops `api` and
  `worker`, which finish the requests and jobs they are already running before
  they exit, so the backup is taken with nothing running that writes to the
  database and holds every write the instance accepted. Jobs created while the
  instance is closed wait and are worked once it reopens. `maintenance off`
  reopens it. Nothing in the app or its API can open or close an instance; only
  the command can.

  The API and the worker no longer refuse to start on a database whose schema is
  not theirs. They start closed — the maintenance page, no jobs — and open by
  themselves once `migrate` has made the schema current, so an upgrade can start
  the new images before it migrates. `/readyz` gains a `maintenance` check that
  names why the instance is closed: maintenance mode, a migration in progress, a
  schema from another release, a database with no Studio schema, or a server
  still starting. Before the first `migrate`, `/readyz` says the database has not
  been set up for Studio yet.

  Rolling an upgrade back is restoring the backup taken during it with the
  previous image digests. The backup page's restore procedure now starts `web`,
  `api` and `worker` from the digests `.env` names and ends with
  `maintenance off`, because a backup taken during an upgrade carries the
  maintenance flag.

  Studio now checks once a day for a newer release. A daily worker job fetches
  `https://releases.networkcanvas.com/studio/manifest.json` with a plain `GET`
  that carries nothing about the instance. When a newer version exists, the
  installation's owner is emailed once for that version, with a link to the
  upgrade guide, and sees a notice in the app with the release date and notes.
  The check is not configurable; an institution that must stop it blocks the
  host.

  The backup page's object-store copy now reads the Garage container's volume
  wherever Compose put it, rather than a volume name that only matched one
  project directory.

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

- Participant interviews now report anonymous usability analytics: which screens
  a participant reaches, how long they spend there, how they move between them,
  and errors the interview hits. Never their answers, their network, or anything
  that identifies them. The participant's browser sends these events only to the
  Studio instance, which forwards them to Codaco's PostHog project without
  building a person profile and stamps each one with the installation's id.
  Nothing is collected while `STUDIO_TELEMETRY` is off, and a researcher can turn
  participant analytics off for a study when creating it. Upgrading adds an
  `installation_id` to the installation, through the `0002_installation_id`
  migration.
- Participants can now take an interview in Studio. Opening an interview link
  starts or resumes the participant's session and runs the interview; answers
  and the stage reached are saved as the participant goes, with a last save sent
  as the page is closed. Reopening a participant's own link in the same browser
  returns to their session, and reloading the page keeps it. An anonymous link
  resumes only in the tab it was opened in, so the next person on a shared
  device starts their own interview. Finishing shows a notice that the interview
  is complete, and the same notice greets a participant who reopens a finished
  interview. A link that cannot be used says why: it was not recognised, has
  expired or been withdrawn, the study is not open, paused or closed, or the
  interview is open in another window; an interview whose link was opened again
  elsewhere asks the participant to open their link to continue. Participant
  pages send no cookies with their requests and never ask who is signed in.
- The protocol editor talks to Studio over Effect rpc. The editor's socket at
  `/ws` carries imported files as raw bytes, as it did before, and a unary
  fallback for clients that cannot open a WebSocket is served at
  `/rpc/protocol-builder`. Locks, presence and live updates behave as before; a
  tab whose connection drops keeps its locks for the same reconnect grace. The
  oRPC protocol-builder contract is no longer exported by the boundary package.
- Studio's own API now runs on Effect's RPC transport. The server serves the
  researcher-facing procedures at `/rpc`, and the web client calls them through a
  typed client built from the same contract, so the two halves can no longer
  disagree about what a procedure takes or returns: a mistake that used to
  surface as a runtime error in a browser is now a compile error.

  What a researcher notices is the error messages. Each procedure declares the
  refusals it can actually produce, and the client branches on those rather than
  on an HTTP status code, so a refusal arrives with its reason intact. The
  clearest case: inviting someone whose invitation is already being sent now says
  so, instead of reporting a conflict. A request whose shape is wrong is refused
  at the boundary rather than part-way through a handler, and a refusal the
  server issues before it reaches a procedure — a rate limit, a maintenance
  window, a request from the wrong origin — reaches the client as that refusal
  rather than as an empty response.

  The tab identity both transports use to own an editing lease now travels in a
  header on the fetch plane and is rewritten into the same header on the
  WebSocket upgrade, so one rule describes it everywhere. The protocol editor
  keeps its existing socket transport.

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
  their role in it — which is why `@codaco/studio-contract` and
  `@codaco/studio-api` are versioned alongside the client. Better Auth's own
  team list joins the member table and then returns only the organization, so
  nothing else could tell the switcher what a researcher is in each of their
  teams. The role travels as a plain string rather than the role enum, because
  a legacy membership is stored as one comma-separated value and an enum would
  fail the whole response over it.

- The Studio page is now served with a content security policy whose
  `connect-src` is `'self' https://api.mapbox.com`: the page and the participant
  interview can open connections only to the instance itself and to Mapbox, which
  a protocol's Geospatial stage and the editor's map preview load maps and place
  search from. Any other origin, including Mapbox's own usage-events host, is
  refused by the browser.
- Studio now tells researchers when it is down for maintenance. While the server
  answers `503`, a notice above every screen of the app says so, and the screens
  behind it keep asking again at the interval the server's `Retry-After` names,
  for as long as the window lasts, instead of giving up after three tries. A
  screen that could not load at all for the same reason says so rather than
  reporting a generic failure.

  A maintenance window no longer signs anyone out. The session check used to
  read every `503` from `/api/auth` as "this server has no sign-in", so a
  researcher whose tab revalidated during a window was sent to the sign-in page
  and their editor session was closed. Now only the server's own "not
  configured" answer signs them out. Any other `503` keeps them where they are,
  shows the notice (on the sign-in page too), and asks again after
  `Retry-After`. The API marks both answers with a problem `type`:
  `urn:networkcanvas:studio:problem:maintenance` for the maintenance gate and
  `urn:networkcanvas:studio:problem:auth-not-configured` when sign-in is not
  configured.

  A request the server refuses with `401` now signs the researcher out and
  returns them to sign-in, the same way an expired session already did. A read
  refused as forbidden, not found or signed out is no longer retried.

  An address that names a malformed study or team id, such as
  `/study/not-a-study/editor`, now shows the "Page not available" screen without
  asking the server anything, rather than failing inside the screen.

  The protocol editor now loads on its own route. The bundle loaded for every
  other screen is 803 kB gzipped, down from 1,977 kB, and only the British
  English protocol-editor messages Studio uses are bundled, not every language
  the editor ships.

  `/rpc` no longer provides the unused `ClientSessionMiddleware`, the client no
  longer sends `x-studio-client-session` on `/rpc` requests (the tab is still
  named on the editor's socket), and
  `@codaco/studio-contract` no longer exports `./middleware/client-session`.
  `StudioStreams` is no longer re-exported from `./rpc/studio`; import it from
  `./sync/protocol-builder`.

### Patch Changes

- Studio now honours the operating-system "reduce motion" setting.

  Motion is off by default in the animation library behind Studio's shared
  interface components, so movement in the shell, the protocol editor, dialogs
  and overlays played in full for everyone. It now settles into place without
  travelling for anyone who has asked their device for less movement, while
  gentle fades are kept.

- Text typed in angle brackets in the protocol editor now appears in the
  interview. A placeholder such as `<IRB OR ETHICS BOARD HERE>` in an
  introduction, prompt or label is saved escaped instead of as an HTML tag, which
  the interview left out. A label that starts with `>`, such as `> 5 years`,
  keeps its bracket too, and text such as `&copy;` appears as you typed it rather
  than as the symbol it names.
- Switching on roster search in a Name Generator for Roster Data stage now starts its search accuracy on "High accuracy", the setting the slider already showed. Before, the slider looked set but held no value, so the stage could not be saved until the slider was moved. A stage saved with another accuracy keeps it.
- Study state, audit outcome and member role chips use the shared `Badge`'s
  semantic tones. A succeeded audit event now reads in the success colour rather
  than the secondary brand colour.
- Merge `@codaco/protocol-builder`'s own message catalog into the one the Studio
  client serves. The stage editors Studio mounts come from that package and
  declare their own `protocolBuilder.*` ids; without this layer an en-GB reader
  saw every one of them fall through to the source string.
- Dialogs no longer close as if nothing happened while the work they started
  carries on:

  - The attribute window in the stage editor cannot be dismissed while it is
    adding a new attribute to the codebook.
  - The interview's finish confirmation cannot be cancelled once the interview
    has started finishing, because the finish completes regardless.

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
- Closes the items the Effect 4 migration (#1927) carried forward without an
  owning issue.

  - The general `/rpc` mount reads at most the contract's unary body bound,
    as `/rpc/protocol-builder` already did. A caller with no session could
    send an unbounded body before being refused.
  - A stopping server closes every open `/ws` socket with 1001 ("going away")
    rather than the 1000 that Effect 4 sends for a handler that merely
    returned; the editor reconnects on either.
  - A schedule row whose stored payload no longer decodes, or that names a
    queue this build does not declare, is logged and skipped on its tick,
    instead of ending the tick and rolling back every other due schedule with
    it (#1996). The row stays due, so the occurrence runs once boot repairs it.
  - The sign-in page's `invitationId` guard now holds: an id that is not a
    team invitation id is dropped before the magic link's return address is
    built, where before it reached the link verbatim.
  - The asset-key re-seal is pinned to the row's own team and protocol by a
    rotation test that shares one asset id across protocols and teams.
  - No `session.cookieCache` is adopted, by recorded decision: the session is
    read on every call so that revocation takes effect at once.

- Studio's packages take their final names. The server is `@codaco/studio-api`
  in `apps/studio/api`, the web app is `@codaco/studio-web` in
  `apps/studio/web`. The old internal RPC package is gone: the schemas the two
  halves shared through it now come from `@codaco/studio-contract`, which joins
  the Studio release lane in its place; the old package's changelog is not
  carried over. The image targets (`studio-api`, `studio-web`), the published
  image names and the compose service names are unchanged.

  The API no longer carries Hono or zod. A path no route serves is answered by
  the router's own 404 as problem JSON, which is what the machine surfaces
  (`/api`, `/rpc`, `/storage`) already answered; a path outside them, which the
  ingress never routes here, now gets the same problem JSON rather than a plain
  text 404. The audit event schemas and the invitation email check are Effect
  `Schema` declarations that accept exactly what the zod ones did.

- Studio's client no longer carries the shared packages' translations for
  languages it does not offer. Their catalogs now load on demand, so only British
  English is ever fetched, and only when it is the language in use.
- Every log line Studio writes is now one JSON record from the same logger, and
  a record written while a request is being handled carries that request's
  `request_id`, the `team_id` of the team it acted on, and the `trace_id` and
  `span_id` of the span it was written in. The request id is the one returned in
  the `x-request-id` header and stored with the request's audit events, so one
  id finds a request's response, its log lines, its trace and its audit trail.
  A record written outside a request carries none of the request keys.

  Log messages are fixed text. The values a message used to quote (queue names,
  job ids, counts, versions) are now separate fields on the record. The worker's
  start-up line, for example, reads `Network Canvas Studio worker started` with
  the version in its own `version` field.

  `STUDIO_LOG_LEVEL` sets the least severe level written (`Info` by default;
  Effect's level names, from `Trace` to `Fatal`, or `None`).

  Values that are not public — researcher emails and names, team, study and
  protocol names, protocol content, participant data, tokens, secrets, asset
  values and client addresses — are now held marked as private from the moment
  they are read, so they appear as `<redacted>` in any log line, trace or error
  built from them. Nothing changes on the wire.

  Logs no longer quote database or driver error text. A failed audit write and a
  failed periodic reading log the error's type and its Postgres error code; the
  full cause of a failed reading is logged at `Debug`. The job worker's
  maintenance warning names what closed the deployment (`maintenance`,
  `migration`, `schema` or `starting`) rather than quoting the maintenance
  reason. An unusable `TRUSTED_PROXIES` entry is reported as a count, not by
  quoting the addresses.

  The first-run setup token, and the sign-in and invitation links the
  development mail transport prints, are written to standard output only and
  never pass through the logger.

- Update third-party dependencies to their latest minor and patch releases, including better-auth 1.7.6, nodemailer 10.0.13 and TanStack Router 1.170.40.
- Studio gains the server foundations for participant interview sessions. No
  participant route uses them yet; the participant procedures and pages that do
  are still to come.

  An interview session can now hold its own credential: a session token stored
  only as the SHA-256 of its secret, unique within a team. The token travels in
  a dedicated `x-studio-participant-session` header, never a cookie, and a new
  `RequireSession` middleware looks it up inside the team it names, refusing an
  unknown, malformed or foreign token. A finished interview's token still
  resolves, so a reopened finished interview can be told apart from an invalid
  link. Request traces record the header as redacted.

  The session store records the newest write a participant's browser has had
  applied, so a replayed or out-of-order write changes nothing, and lets a
  second page take a session over, after which the first page's writes are
  refused.

  The participant procedures' contract now matches the interview runtime's
  payload, with every field declared except the protocol document, so a column
  added to the session later cannot reach a participant by accident.

  Audit events can now name a participant as their actor. Team activity labels
  such an actor "Participant", beside their participant code, or a short session
  reference in an anonymous study.

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
- Fixed a Sociogram, Narrative or Network Composer stage that could not be saved after choosing its node type when the background was set to Image. Choosing the node type resets the background to concentric circles, and the background type now shows that, so an image chosen afterwards no longer leaves a hidden circle count behind that blocked saving.
- The hint under a node or edge type's name field in the stage editors now suggests only names the field accepts. The edge example "Works With" contained a space, so a researcher who typed it in was told it was not a valid name; it is now "Colleagues", in English and British English.
- The "Skew circle sizes" switch now shows on for a Sociogram, Narrative or Network Composer stage whose background does not say whether its circles are skewed. Interviews draw those circles skewed, but the switch showed off, so it misstated what participants see. Opening and saving such a stage still leaves the setting unchanged.

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
