# fresco

## 4.2.0

### Minor Changes

- 4326572: Stop reporting the running Fresco version and process uptime from the unauthenticated `/api/health` endpoint. It still answers liveness probes with the service status, so container healthchecks and load balancers keep working, but an anonymous caller can no longer learn which release an instance runs. Signed-in researchers continue to see the version on the dashboard.
- 3c6cba3: Passkeys now have to verify who you are. Fresco asks every passkey to confirm your identity with a PIN, fingerprint, or face when it is registered and each time you sign in, and refuses a response in which the authenticator skipped that check. A passkey sign-in therefore always proves both that you hold the device and that you are its user, which is the assurance the Accounts & Security documentation describes.

  Previously Fresco requested this verification but accepted responses without it, so a hardware security key with no PIN could sign in on possession of the key alone.

  Deployments that set `REQUIRE_TWO_FACTOR` exempt passkey-mode accounts from that requirement because a passkey already replaces the password; that exemption relied on the passkey proving the user's identity, which was not previously guaranteed. It now is.

  A passkey registered on a security key that cannot verify you no longer signs in, and Fresco tells you what to check rather than reporting a generic failure or, when the browser closes the passkey prompt on its own, saying nothing at all. Sign in with another of your passkeys, or ask another administrator to use **Reset Auth** on your account. If you are already signed in, add a passkey that verifies you from **Settings → User Management** before you sign out. Registering a new passkey on such a key is refused with the same explanation.

- b51743b: Add a `REQUIRE_TWO_FACTOR` environment variable. When it is set to `true`, every account that signs in with a password must set up two-factor authentication immediately after signing in — or, for the first administrator of a new deployment, immediately after the setup wizard — before any dashboard page or signed-in request is served, and cannot turn it off afterwards. An administrator can still reset a locked-out colleague's authentication; that account sets two-factor authentication up again at its next sign-in. It is an environment variable rather than a dashboard setting because every Fresco account is an equal administrator, so anything switchable from the dashboard could be switched off by any of them; the User Management card reports whether it is in force. Accounts that sign in with a passkey are not affected.
- 0587866: Add English, British English, and Spanish throughout Fresco’s researcher interface, with an account language preference that applies immediately and persists across devices. Localize server-rendered pages, validation, dialogs, notifications, and structured activity details while preserving existing audit records and research data.

  The selected language also initializes built-in interview controls. Temporary interview-menu choices leave the account preference, protocol-authored text, and stored answers unchanged.

- 29b11be: Built-in interview controls, help, validation, dialogs and accessibility messages
  are available in English, British English and Spanish. The interview menu now
  includes an interface language chooser, with all messages available offline.

  Hosts can pass a preference or an already negotiated language through
  `Shell.requestedLocale`; the interview package finds the best match among its
  own supported languages. `onLocaleChange` lets hosts persist menu choices, and
  `InterviewI18nProvider` gives inline field previews the same negotiation and
  catalogs. Language changes preserve entered answers, open forms and the current
  interview position. Protocol-authored content and research values keep their
  existing language and meaning.

### Patch Changes

- afef196: The unexported-interview warning in the delete dialogs now stays on screen while the dialog animates away, instead of disappearing a moment before it. Dashboard tables no longer rebuild their action menus on every render.
- d6cb713: Session replay and heatmap capture are now off on every page, not only participant ones. Enabling either on the dashboard could send data neither optional analytics feature was meant to include: heatmaps key their captured data by the full page URL, and the participants and interviews tables put the researcher's search text there as a query parameter; session replay can capture whatever the current page renders, including the TOTP secret on the two-factor setup screen and recovery codes or freshly created API tokens on the settings screen, and the recorder's default masking does not cover plain text or images. Fresco reports only the usage events it emits explicitly.
- c6f88e9: Optional analytics no longer carry interview identifiers. Error reports from the interview sync and finish endpoints, and the "Interview Opened" usage event, previously included the interview id (and, for researchers, the username) in what was sent to the analytics relay. An interview id is the participant's access link, so those properties are replaced with non-identifying context, matching the redaction the browser-side analytics already applied. In the browser, PostHog autocapture, rageclick and dead-click capture are now switched off throughout Fresco, as they already were in Interviewer and Architect, and any element data (such as the text of a clicked button) reaching the send path is dropped: a clicked node's name is a participant's answer, and the dashboard's tables show participant identifiers and labels. Heatmap capture, which records element selectors rather than text, stays on for the dashboard and off on participant pages. Fresco reports only the usage events it emits explicitly. `$$heatmap` flushes — which carry element selectors, not text — are dropped only on participant pages, matching `capture_heatmaps` at init, so dashboard heatmaps still reach PostHog as intended. The security policy is also corrected: TOTP secrets are stored as-is because they must remain readable to verify codes; recovery codes and API tokens are the values stored hashed.
- 1dac91b: The interview runtime's optional analytics no longer use the interview session id as the per-event `distinct_id`. In Fresco that id is the participant's unauthenticated access link, so it must not leave the deployment. Events are now grouped under a random per-session pseudonym generated in the browser, held in memory for the life of the session alongside the existing entity-id pseudonyms. Analytics still group one session's events together; a page reload starts a new pseudonym. Errors the Name Generator raises for a malformed encrypted attribute no longer embed the node's id in their message, since error reports can be captured by analytics and a node id is a participant-network identifier the runtime otherwise pseudonymises. The same is true of a duplicate-relationship error the Family Pedigree interface throws, which no longer names the two node ids it connects.
- 23dcf99: Analytics now reports a session-scoped pseudonym for every entity id, rather
  than the interview's own `_uid`.

  The event taxonomy admits `node_id` and `edge_id` on the premise that they are
  random values minted at creation time, derived from nothing a participant
  supplied. Roster nodes break that premise: an external-data row is keyed as
  `${subjectType}_${hash({ node, index })}`, a deterministic, unkeyed digest of
  the row's own content, and the node is added to the network under exactly that
  key. Anyone holding the roster could recompute the digest and so recognise
  which roster row an event was about, and because the digest does not vary the
  same person carried the same identifier in every interview — so events from
  separate sessions about one person could be joined together.

  Each session now mints a random pseudonym per entity, held in memory and never
  persisted or transmitted. Events within a session still join on the entity,
  which is all these properties are for; nothing joins across sessions or back to
  a roster row. The substitution happens at the tracker, the single boundary every
  event passes through, so no emitter can reintroduce a raw identifier. When
  events fire, and which events fire, is unchanged.

- a13f261: Every module that runs a React hook now declares `'use client'`, so a Next App
  Router application can import this runtime from a Server Component.

  Seventy-four modules were missing the directive: the navigation, node list, node
  drawer and panel components, the canvas layers and their layout hooks, the
  protocol form, and the Anonymisation, CategoricalBin, DyadCensus, EgoForm,
  FamilyPedigree, Geospatial, NameGenerator, NameGeneratorRoster, Narrative,
  NarrativePedigree, NetworkComposer, OneToManyDyadCensus, OrdinalBin, SlidesForm
  and Sociogram interfaces. An unmarked module is treated as server code, so
  reaching one from a Server Component's import graph failed the build rather than
  rendering.

  The published bundles now carry the directive too. Bundling had been erasing it,
  so even the modules that already declared it arrived at npm consumers unmarked.
  `dist/index.js` and the lazily loaded Geospatial chunks are now marked;
  `dist/contract.js` and `dist/protocol-schema-version.js` are unmarked, as their
  server safety intends, and stay that way only for as long as no module carrying
  the directive is reachable from them.

  Architect, Interviewer and Fresco are released alongside because each bundles
  this runtime. Nothing about how an interview looks or behaves changes.

- c5758a4: Fix text in the Information interface being unselectable. It carried an `allow-text-selection` marker class meant to override the host app's global `user-select: none`, but the shared-theme migration dropped the CSS utility that implemented it (as an apparent "zero consumers" cleanup) without noticing this interface still relied on it, so the override silently stopped doing anything. Participants and researchers previewing an Information stage could not select or copy its text. Now uses Tailwind's built-in `select-text`, which restores the original behaviour by inheritance since nothing inside the interface sets its own `user-select`.
- a78b7c2: A video on an interview screen now announces itself with the description the
  researcher wrote for it, and falls back to the asset's file name only when
  nobody has written one. An image has always read that description as its alt
  text and an audio player as its own name; the video player was the one place
  that ignored it, so a participant listening to the screen heard a filename
  where every other medium said what the thing was.

  A description a researcher left blank now counts as no description at all, for
  pictures and audio as well as video. A protocol written by hand or brought in
  from elsewhere can carry a description of nothing but spaces, and every medium
  used to pass it straight through — so a participant using a screen reader was
  told a run of whitespace instead of what the file was called.

- f6565fe: Interview screens now settle in one step where they previously took two. Moving to the next pair in Dyad Census or Tie Strength Census, changing prompt in Categorical Bin, Sociogram or Geospatial, and opening a name generator's edit form no longer render a frame that still carries the previous item's state.

  Place search is more accurate about what it tells a screen reader: a status that has been superseded is no longer read back when a query starts matching again, and a search still in flight when the participant moves on can no longer repopulate the next person's suggestions.

  An encrypted name that could not be decrypted after the passphrase changed now shows the locked indicator instead of the name read earlier under the old passphrase.

- 553d580: Added `@codaco/fresco-ui/hooks/useHasHydrated`, the one implementation of "is this tree past hydration" for the handful of things only a browser can answer. It replaces eight hand-rolled copies across the design system and the apps.

  In Fresco, the anonymous recruitment URL and the passkey option on the sign-in and sign-up forms now appear as soon as the page is interactive, without the extra render pass they used to wait for.

- Updated dependencies ([486ad48](https://github.com/complexdatacollective/network-canvas-monorepo/commit/486ad489e5d6387d418f621a168b0f941021353e), [91a25de](https://github.com/complexdatacollective/network-canvas-monorepo/commit/91a25ded87f6348e9fc14b5d5b84303f658a0792), [5a19894](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5a19894e03e1aa5bd176b012a342d20c50398c86), [ca83424](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca8342421dda342d1722ad838bbbe58837212022), [e4dad7e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e4dad7ef5a96a1f09257483c4f99fccffc0dcaa5), [90b08cd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90b08cd133b8555408329acdfe1ea00e0a7fff37), [1376c6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1376c6a817e093ce220c9397492290a0f7d6a57f), [b0fa87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b0fa87ac6614959484cdb1e4d6457513e9898a56), [ab25ed6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab25ed6be06f2e4f983f2a5c5915e962caed5970), [15c8259](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15c825972e5097cd8d8559d47e5ba4584398edee), [484c9e0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/484c9e0efeac6e55506d56504a79c37e00f9f687), [1abd707](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1abd707d0894dfad3eaf0eb5a79e76ffc3e7932c), [154d2ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/154d2ab5ad89ce4a5d370d1fb818135ab7fbb62d), [c100092](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c100092b303b1b02afe2876d8dbbc84af06865b2), [65d2583](https://github.com/complexdatacollective/network-canvas-monorepo/commit/65d2583c12a2af634080b466f95793f3cc8032d4), [4749625](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4749625620599802f85560ec1ba54fc7873a2ecc), [57c74ae](https://github.com/complexdatacollective/network-canvas-monorepo/commit/57c74ae5a36b8e5c1d8efd3863cbfeaf412ba1b4), [c358132](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c3581329466d44b3733a09bb459d07a1787486ef), [df21eec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df21eece0b9a9e6393f694c07374e7d10d66dabc), [c563d9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c563d9f0815df12f618c06548e1281fec95bb656), [208fcea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/208fceaf736d8354d16046b6e9953b1d598f65a1), [3abf9e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3abf9e4442b6086c5c5937d16212a9bdc8425cab), [45a30fa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/45a30fae119ebf52d31738fa98e61b707d1d4c54), [1dac91b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1dac91b131db3740117aaf7977c9ff9bd697241e), [23dcf99](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23dcf99e80d3e95b9e71543afb2e40842d1527e1), [a13f261](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a13f2610b7834e2fe27ae4e1e8423612b990c304), [c5758a4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5758a447125e840b91d81e9b2e9ed6acdf1583e), [29b11be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/29b11be8da6cfb65b8c9cce5d6f1d8711889d4f1), [a78b7c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a78b7c20034648fffcee4202a143481178f8637b), [aa4693a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aa4693a1e221515381058229d7fbf61d7807dfe3), [bb8e755](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bb8e7550160683d76d359b0d0c7093e6d128b9e2), [693655f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/693655f3d388e7ef91cb0e2324a10bb201a5f96c), [5de44c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5de44c15c99bc4e778d08c1be23bfd590e877005), [ed91f97](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed91f9759c0d12bc6940d61800b816a2f482d4dc), [f6565fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f6565fe3f11ddfa004d1ea5d37a7b97401a53db4), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [a5626f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a5626f51040d092c56417694296bcde8d51faad9), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a), [3f54d21](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3f54d2102e9489ae65cb164466fe71de05901ddd), [553d580](https://github.com/complexdatacollective/network-canvas-monorepo/commit/553d580c548e86730faecd95a18b6bf29868807f))
  - @codaco/fresco-ui@6.5.0
  - @codaco/tailwind-config@1.5.0
  - @codaco/interview@9.1.0
  - @codaco/network-exporters@2.1.0
  - @codaco/protocol-validation@13.1.0
  - @codaco/shared-consts@6.1.0
  - @codaco/protocol-utilities@4.1.0

## 4.1.6

### Patch Changes

- 79cabf8: Fresco can be deployed to Vercel again. Since 4.1.0 every Vercel
  deployment failed during the build with
  `ENOENT: .next/next-server.js.nft.json`. Next.js 16.3 stopped writing that
  file-trace manifest when `output: 'standalone'` is set, and Vercel's build
  adapter needs it to package the app's serverless functions. Fresco sets
  `output: 'standalone'` only for its Docker image, so it is now switched off
  when building on Vercel. Container and Netlify deployments are unaffected.

  The consequence reached further than a failed build. Fresco applies its
  database migrations before the build runs, so an upgrade attempted on Vercel
  migrated the schema and then failed — leaving the previous deployment, still
  serving, reading a database whose shape it no longer understood. A Vercel
  deployment could therefore take itself offline by trying to upgrade, and
  could not be repaired by redeploying the older version.

  Fixed upstream in Next.js 16.4 (vercel/next.js#96646).

## 4.1.5

### Patch Changes

- 83c17e7: Fix "Must be unique" accepting a duplicate value for a number variable. A number typed into an interview form was compared as text against the numbers already stored on the other alters, so an Alter ID that another alter already held passed the check and the duplicate was added. The same mismatch let a "same as" or "different from" rule misjudge a number answered on an earlier stage. Number values are now compared as numbers wherever a rule reads what the network already holds.

## 4.1.4

### Patch Changes

- 019c1c0: Interview pages now send an origin-only `Referer`, so URL-restricted Mapbox tokens work with Fresco.

  Fresco set `Referrer-Policy: no-referrer` on `/interview/*` and `/onboard/*` so that the interview id in those URLs could never reach a third party. That also withheld the site's origin, and Mapbox evaluates a token's URL restrictions from the `Referer` header — so a Geospatial stage backed by a URL-restricted token failed with 403 on every map load, leaving researchers no choice but an unrestricted token. Those routes now use `strict-origin-when-cross-origin`, the policy every other Fresco route already carried: a cross-origin request carries only the scheme and host, an HTTPS→HTTP downgrade carries nothing, and the full URL, interview id included, is sent only to same-origin requests, which already know it. The protection the old policy provided is unchanged; Mapbox can now see the origin it needs.

  Existing deployments must upgrade to this version to benefit. A deployment on an earlier release still sends no `Referer`, so its Mapbox token has to stay unrestricted.

- Updated dependencies ([b387946](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b387946d706f5779779e11956af04e0e4904d474), [b4b21ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b4b21ed955b96bc3c59aeefd18f6f7d5bc3ea19a), [05ea832](https://github.com/complexdatacollective/network-canvas-monorepo/commit/05ea8325b4a5c93e2f8081309db45e3ecba948b2), [0666674](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0666674c95a4865227bddc103b131720926ab7c8))
  - @codaco/protocol-validation@13.0.1
  - @codaco/fresco-ui@6.4.0
  - @codaco/tailwind-config@1.4.0

## 4.1.3

### Patch Changes

- 77c3736: Replace the interview text-size choices with an accessible percentage input that supports plus and minus controls, arrow keys, and direct entry.
- Updated dependencies ([080d355](https://github.com/complexdatacollective/network-canvas-monorepo/commit/080d355e7bb30b7d9cf7c8653582a81103b6b8b5), [cead6fc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cead6fca6412f9322403896d09606bfcb1be1e58), [77c3736](https://github.com/complexdatacollective/network-canvas-monorepo/commit/77c37364a043f12fa38d97ec0004514c77636b88), [0584c69](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0584c69b1b210e533c1a18d7456a7808934989e7))
  - @codaco/fresco-ui@6.3.0
  - @codaco/interview@9.0.1

## 4.1.2

### Patch Changes

- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- 873f3bf: Deployments with analytics disabled no longer contact the Network Canvas analytics service.

  Analytics previously started as soon as a page loaded, before the deployment's own setting had been read. A deployment that set `DISABLE_ANALYTICS` or turned analytics off in its settings still requested configuration, supporting scripts, and feature flags on every page load, and could send one anonymous event before the setting took effect. Each new browser also created a new anonymous person record.

  Analytics is now loaded only once the server confirms it is enabled, so a deployment with it disabled makes no requests at all. If the setting cannot be read, nothing is sent. Errors reported from the server now honour the setting too.

  Turning analytics off part-way through a study now takes effect on the server straight away. A deployment that had analytics enabled kept sending server errors until it was restarted, because those reports came from a handler that was set up once and never consulted the setting again. Every server report is now checked against the setting as it is made, including reports of background failures that happen outside a request.

- e9a6522: Network Composer's Undo and Redo controls now retain keyboard focus at the end of the history during interviews hosted by Fresco.
- 79db1ca: Participant interview links no longer reach the analytics service.

  A participant's interview URL contains the identifier that grants access to that interview, and an onboarding link also carries the participant identifier a researcher assigned. Fresco already refuses to send those URLs as a referrer, but on deployments with analytics enabled they were still attached to analytics events as the current page address, including the link address of anything clicked.

  Those identifiers are now removed before any event is sent, on every route a participant sees. Session replay is also switched off for those pages, both when one is opened directly and when a researcher opens an interview from the dashboard — replay stores the page address in a form the removal cannot reach, and a recording of someone answering interview questions is research data rather than analytics.

- 06bc1e9: The quick add usage hint on name generator stages no longer promises that the box stays open when only one more item can be added during interviews hosted by Fresco.
- e9a6522: Fresco now handles recruitment links, activity reporting, hosted interview dialogs, and operational errors more reliably.

  - Recruitment links for missing protocols show an actionable invalid-link page instead of a generic application error.
  - Activity feed writes complete before a request finishes, and the corresponding analytics reports are flushed reliably. Uninstalling a protocol is now recorded as activity.
  - Analytics receives activity types and counts without researcher or participant descriptions, and server events are correlated with the originating browser session.
  - Interview confirmations restore focus to the control that opened them, while import and synchronization failures use concise messages without internal stack traces.

- 79db1ca: Fresco now reports the failures that stop it starting in a participant's browser.

  A browser that failed to start the application showed its error page but had no way to send the report. Deciding whether a deployment collects analytics needs a database read, so the answer was applied by a component inside the page — and when the page failed to start, that component failed with it. A deployment could be broken for every participant with nothing recorded anywhere.

  The answer now reaches the browser independently of the page rendering, so these failures are reported like any other. Deployments with analytics disabled still make no requests at all.

- e9a6522: Fresco normalizes older stored and synchronized sessions at its read boundaries, so interviews containing nullish entity attributes continue to hydrate and synchronize. Malformed synchronization JSON now returns a controlled bad-request response.
- 3f3e86b: An interview no longer loses its most recent answers when two saves are in flight at once. When a tab is hidden or closed, the browser sends the outstanding answers straight away rather than waiting behind a save already on its way to the server — so the two can overlap, and the server could finish them in either order. If the older one finished last it overwrote the newer answers with the state from a few seconds earlier. Each save now carries its position in the browser's own sequence, and the server keeps a save only when it is newer than the one the interview already holds; one that lost its race is discarded instead of rolling the participant's answers back.
- bd06a52: Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Answers now reach storage within a fraction of a second of being given rather than waiting out a shared timer, and anything still outstanding is written the moment the app is put into the background — before the device can suspend it.

  **Breaking for hosts of `@codaco/interview`.** The engine no longer batches writes on the host's behalf, and no longer holds a change back while an earlier write is unresolved. `onSync` is called for every change as it happens, because only the host knows what one write costs. Hosts wrap their handler in the new `createDebouncedSyncHandler`, which rate-limits ordinary changes to one write per interval carrying the newest state, and never runs two writes at once. A host writing its own handler must not run its writes concurrently: a slow earlier write landing after a newer one would persist stale answers.

  `SyncHandler` gains a third argument. `immediate` marks the writes that must not be deferred — the participant exiting or finishing — and a batching host must stop batching when it sees it. `unloading` additionally marks the ones the document may not survive: it is being hidden or unloaded and may never run script again, so the host should use a transport that outlives it and must not queue the write behind a request that will die with it. Handlers that ignore the argument keep type-checking, so hosts that write eagerly need no change.

  The Shell also now flushes on `visibilitychange` and `pagehide`. A hidden document is not promised any more script, so anything still outstanding goes out while there is still a page to write from — which is what makes an installed PWA safe to put to sleep seconds after an answer.

- c37a801: Applications now derive their protocol schema compatibility from the interview runtime they embed, instead of hard-coding a version number, and each application can upgrade stored protocols when a future schema version ships.

  - `@codaco/interview` exports its supported protocol schema version as `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from `@codaco/interview/protocol-schema-version`). Fresco and Interviewer read it for import limits, stored-data migration, and interview payloads; Architect derives its own compatibility from `@codaco/protocol-validation` directly.
  - Interviewer checks stored protocols at launch. A protocol saved under an older schema version is migrated, re-identified under its new content hash, and its interview sessions and media follow it in a single transaction, with a notification when this happens. A protocol that cannot be migrated is left untouched, with a message directing you to repair it in Architect.
  - Architect upgrades a library protocol automatically when you open it, with a notification, leaving the protocol untouched if the upgrade cannot complete. Protocols made with a newer version of Architect are refused with an explanation instead of opening incorrectly.
  - Fresco's deployment migration targets the runtime's supported version rather than a fixed number, and an interview can no longer start from a protocol stored under a version the runtime does not support — it reports the mismatch instead.

  Nothing changes for existing data today — every stored protocol is already at the current schema version. This machinery exists so a future schema version change cannot orphan interview sessions or mislabel stored protocols.

- 1a5adac: Render edge glyphs in interview network summaries with their configured dark edge colors.
- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [9a34469](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9a3446969d5fcc7a3640d8eb5597f807a4fee810), [e3e7b2c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e3e7b2c9cfbc1758754afc0c3959c50ae6518363), [eec63f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eec63f8c62bd6cfb030c88e396933c4aab384be9), [3e10128](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3e10128db1d1a1abc56f8293d66bf9f7dd75c722), [b51ef59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b51ef598343c67c95edd4e165c0bac91a7a82571), [43c7746](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43c774665b781cb5cc71acf8ed8c8ca48838ca64), [eb73319](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eb7331942683e879328530e997e554fb12fef52a), [e08ebbf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e08ebbf8547c2507f5f2a37f7cbab1169dd392cd), [88d7db0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88d7db04ea3ba323be2fb18f55f6b11d6274740f), [ae3c616](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ae3c616ed4edc55c294be9097e4ae724b249601e), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [23d0fab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23d0fab63d4de8da1ba3574cb151ac1c76580d9a), [59f131c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/59f131c2af206c8b1f668b90edf21fbcb3b0b7b7), [06bc1e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06bc1e991df40ab3e115da361cfe0ebfe391bbd8), [bd06a52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bd06a5256b64b82b2718c15b6d3bc825b4ba95c5), [7ca985f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7ca985fe57ca03dda02a96a6013c5dac55dc0123), [c78135c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c78135cd461d1e482ce248b1eb6337359bafc189), [dcbc7aa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dcbc7aad21ec995bf3a598eb5b208a681789eb4f), [4ea26a7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea26a74dfab5bc02495bc8fa03c31aa5f987dad), [c37a801](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c37a801a3a0a8e6cc82fce3cfe64d031003af207), [0f20ff5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0f20ff594e3fd9b38f393d3d71e9f7bdcc078955), [4a4a9f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4a4a9f49d4c449e09e07558a0032d6a3b8015743), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15), [71baa6c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/71baa6c3c376bc287958e5f06659daa1df617e08), [54650ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/54650ab4bb357d39db88a46f5c3ab8b82375f647), [469d404](https://github.com/complexdatacollective/network-canvas-monorepo/commit/469d4041bd1c86fbfc92eaf2a368f1689858bbd2), [a9825f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a9825f4067cc6cddd08b64a76e8d88a4b96ae998), [1391fa8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1391fa879011e988a1e8c250a4c80a96797d5d47), [f03b1e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f03b1e45f425cf3c97ba2137765073a462ee9c9f))
  - @codaco/interview@9.0.0
  - @codaco/protocol-utilities@4.0.0
  - @codaco/protocol-validation@13.0.0
  - @codaco/fresco-ui@6.1.0
  - @codaco/tailwind-config@1.3.0
  - @codaco/network-exporters@2.0.0
  - @codaco/shared-consts@6.0.0

## 4.1.1

### Patch Changes

- e349137: Update runtime dependencies to resolve security vulnerabilities in analytics sanitization, uploads, and form state handling.
- Updated dependencies [52a3fbb]
- Updated dependencies [fec9536]
- Updated dependencies [90e0178]
- Updated dependencies [90e0178]
- Updated dependencies [e349137]
- Updated dependencies [13e5e99]
- Updated dependencies [673d5f3]
- Updated dependencies [ea06b66]
  - @codaco/fresco-ui@6.0.0
  - @codaco/interview@8.0.0
  - @codaco/protocol-utilities@3.2.1
  - @codaco/protocol-validation@12.1.1

## 4.1.0

### Minor Changes

- e84f2d1: Participants can now adjust the interview's text size. The interview navigation
  carries a settings menu with a "Text size" control offering 90%–130% of the
  default size, scaling text, spacing, and touch targets together. The change
  previews live while the menu is open and lasts for the rest of the session. The
  control is fully keyboard operable and announces its state to screen readers.

  This release also picks up the latest Network Canvas interview and interface
  updates:

  - Tablets render the interview at its full text size again. Every viewport
    narrower than 1280px had been rendering below the intended base size, which
    also shrank spacing and touch targets. Editable fields never render below 16px
    now either, so focusing one no longer makes iOS Safari zoom the page.
  - Nodes stay fully visible when moved to the edge of the Sociogram, Narrative,
    and Network Composer canvases, instead of being partially cut off on wide
    displays.
  - A scrolled roster stays where it was after an item is dragged out of it,
    rather than jumping back to the top.
  - Exporting large interviews no longer stalls the progress display, and
    cancelling an export releases the partially built archive immediately.
  - Timestamps in the dashboard's tables render immediately instead of appearing a
    moment after the row, so selecting a row no longer makes them flicker.
  - Unchecked options in dropdown menus no longer show a check indicator.

### Patch Changes

- 215e2ef: Exported interview data now identifies each case by the participant's
  identifier rather than their label. A label is optional and need not be unique,
  so any study using labels was exporting cases under a name that could repeat
  between participants and did not match the identifier used by recruitment links
  and the participants table.

  Clearing a participant's label now removes it. The edit appeared to succeed
  while the old label was silently kept.

  Editing a participant's identifier now refreshes the interviews table, which
  previously kept showing the old identifier until something else changed.

- Updated dependencies [3c8fe35]
- Updated dependencies [fa88ae4]
- Updated dependencies [2325d34]
  - @codaco/protocol-utilities@3.2.0
  - @codaco/fresco-ui@5.1.0
  - @codaco/interview@7.1.1
  - @codaco/shared-consts@5.6.1
