# Fresco researcher application localization (#1618)

## Ownership, dependencies, and delivery

Fresco implementation: `feat/fresco-app-i18n`, isolated worktree
`/private/tmp/nc-i18n-fresco`. Initial main: `4c4789f59`. Shared prerequisites
are owned by the orchestrator on `feat/app-i18n-spanish-prerequisites`; the
latest integrated checkpoint is `375b2ea73ccbcda586fef175bafc2ee009d3311b`.
The prerequisite PR is [#1702](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1702),
currently at `f3b4dc7b88441d0349d33af52203f6e30bc76c17`. The later shared
integration remains pending the orchestrator's user permission question; all
Fresco evidence below identifies the verified `375b2ea73` base.
Local integration preserves normal ancestry. Fresco owns `apps/fresco/**`, its
three-line lockfile importer addition, this plan, and the normal-lane minor
changeset `fresco-researcher-localization.md`.

The contract is issue #1618 (no issue comments), the accepted
[Studio application localization specification](../specs/2026-09-04-studio-ui-localization-design.md),
the [protocol localization specification](../specs/2026-08-27-protocol-localization-design.md),
and the user's production Spanish amendment. Related PRs #1648 and #1651,
Studio's adoption, shared package APIs, and root/app instructions were inspected.

The shared prerequisite PR must land before the separately reviewable Fresco
issue PR. Parent orchestration owns PR creation, current-head CI, explicit
`@codex review` rounds, findings, and dependency-base updates. The user has not
authorized merging PRs, force-pushing, production deployments, or releases.

## Acceptance and complete surface inventory

| Acceptance requirement / surface                                        | Implementation and verification                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit `en`, `en-GB`, `es`; owning-package catalogs; English fallback | `i18n/locales.ts` and `src/locales/catalogs.ts` layer common, Fresco UI, network-exporter, protocol-utilities, protocol-validation and Fresco catalogs. Registry-subset, namespace, coverage, token, description and extraction guards pass. English defaults retain provider-optional behavior.                                                                                                                 |
| Whole ICU messages, rich text, counts, lists, dates and numbers         | Source descriptors contain full messages. Counts use ICU plurals; current `intl` formats dates, relative times, progress, numbers and lists. Research identifiers and protocol content remain unchanged. Spanish singular/plural regression cases pass.                                                                                                                                                          |
| Account > mirror > browser > English; malformed/regional preferences    | `resolveFrescoLocale` uses shared negotiation. Authenticated `null` means Automatic and ignores a previous user's mirror; unsupported account values fall through. Resolution tests cover malformed, unsupported, regional best fit and fallback.                                                                                                                                                                |
| Per-user persistence and migration                                      | Nullable `User.locale`, additive SQL migration, existing session/user guard, authenticated action with expected-user identity, exact supported canonical tags and `null`. Action and SQL upgrade tests preserve users, password hashes and sessions.                                                                                                                                                             |
| Server initialization and request isolation                             | Request-scoped React cache reads the account, cookie and shared root-exported `parseAcceptLanguage`; `createAppIntl` uses the same catalogs and UTC timezone serialized to the provider. No shared Next locale cache. Actual raw SSR, hydration and eight concurrent requests from two users pass.                                                                                                               |
| Immediate changes, persistence and document ownership                   | Shared LocaleSelect with Automatic, optimistic updates, serialized writes, superseded-write guards, rollback to last acknowledged preference, refresh of server fragments, `lang`/`dir`, and browser-language events. Unit and standalone keyboard, reload, null/mirror and identity tests pass.                                                                                                                 |
| Sign-in, sign-up, onboarding and expiry                                 | All headings, actions, alternate authentication, recovery, passkey/TOTP, setup steps, storage selection, S3/UploadThing forms, sandbox guidance, documentation, loading and error copy converted. Actual Spanish setup imported a protocol and reached the dashboard.                                                                                                                                            |
| Dashboard shell and summary                                             | Desktop/mobile navigation, user actions, summary statistics, activity filters/table/export, empty states and loading copy converted. All five researcher routes inspected in all three locales; mobile focus and named-dialog regressions pass.                                                                                                                                                                  |
| Protocol administration                                                 | Import dropzone/popover, progress, size/archive/schema/migration validation, duplicate handling, metadata, sorting/filtering, download, anonymous recruitment URLs and deletion copy converted. Actual setup import, duplicate refusal, byte-identical original download, cancel and disposable-protocol deletion pass.                                                                                          |
| Participants                                                            | Add/edit and required/duplicate/server errors, CSV import/export and collisions, table counts/filtering/selection, generated URLs and deletion copy converted. Actual Spanish add/edit, duplicate error, stable CSV export, invalid/collision CSV import and cancellation pass. Generated URL, first activation, translated copy notification and single-record deletion/cancel checks pass.                     |
| Interviews                                                              | Progress, network summaries, dates/statuses, table filters/selection, incomplete URLs, CSV/GraphML export, batched progress/cancel/completion and deletion copy converted. Actual synthetic generation, two completed records, 12-file export ZIP and persisted export timestamps pass. Bulk deletion warns about unexported interviews; cancel preserves all records and confirmation persists the empty table. |
| Settings and security                                                   | Language, app/version/installation, users/password/passkeys/TOTP, storage/S3/UploadThing, interview controls, privacy, API tokens, synthetic data and reset copy converted. All controls expose localized accessible names; environment-owned and current-user controls retain disabled states. Actual account creation and TOTP invalid-code, verification, recovery step and disabling workflows pass.         |
| Current action/field errors survive a language change                   | Shared `createMessageError` transports descriptors and raw primitive/list values through existing string contracts. Shared form renderers and app `AppErrorMessage` format at render time. Real SignInForm field and form refusal tests pass without resubmission or field clearing; actual standalone credential-error switch passes.                                                                           |
| Long-running and queued UI stays reactive                               | AppMessage nodes for stored toast/wizard content; exporter stage identity uses owning-package descriptors; all three toast.promise callers use options objects containing reactive descriptions. Active export and participant URL notification tests pass without restarting their operations.                                                                                                                  |
| Researcher activity details                                             | All 33 production addEvent/addEvents sites emit stable kind and named values with original message and analytics properties preserved. Additive nullable `Events.localization`; 29 strict templates; unknown/invalid/historical metadata falls back to original prose. Real-column en/es switching, escaping, guard and SQL upgrade tests pass.                                                                  |
| Participant boundary                                                    | Actual `(interview)` layout nests English provider, `manageDocument=false`, explicit English lang/dir, and participant interview creation intentionally uses English. Real-layout unit proof and actual generated-link runtime pass: the Spanish host preserves English participant language, direction and portal ownership.                                                                                    |
| Accessibility, layout, required/disabled/error semantics                | Localized labels, tooltips, selectors, switches, dialogs and mobile menu; stable route keys retain focused navigation nodes. Empty required fields and rejected edits retain field ownership and current-language errors. Desktop and 390px Spanish screenshots inspected; no horizontal overflow.                                                                                                               |
| Verification, release notes and review                                  | Final format, lint, direct TypeScript, Knip, 630 app units and actual Next build pass locally. Normal-lane Fresco minor changeset authored. Independent Spanish AI review completed; external Codex PR review remains parent-owned.                                                                                                                                                                              |

## Catalog and copy audit

There are 840 generated English descriptors and 840 nonblank neutral Spanish
translations. British English contains four reviewed spelling overrides. The
app's extraction script uses the existing app-i18n/catalog-guards tooling; no
parallel parser, localization stack, react-intl imports, or extraction CLI was
introduced. Next compiles source descriptors and source JSON through the shared
app-i18n loader, including workspace dependencies; production uses the no-parser
runtime. The standalone production build exercises the React Server Component
facade and actual compiled catalogs.

A separate Interviewer agent reviewed all 831 entries in the frozen Spanish
snapshot, followed by the additional TOTP setup-failure entry. This is independent
AI translation review, not human review. Three findings were corrected: completed
interview singular agreement, generated-interview singular agreement, and
count-neutral missing-dependency guidance. EN uses matching ICU token types
while preserving its wording. Tests cover the corrected singular and plural
outputs. The additional TOTP entry received a separate clean review. A later 10-entry
failure-path delta and the final two passkey fallback names also received
independent clean AI reviews; four obsolete app descriptors were removed.
Snapshots: `/private/tmp/fresco-spanish-failure-delta.json` and
`/private/tmp/fresco-spanish-passkey-delta.json`.

The audit covered every researcher JSX source and non-JSX generated string,
including template interpolations, formatter values, custom validation,
`required`, `submittingText`, `fallback`, `description`, `errorTitle`, loading,
placeholders, title/alt/ARIA attributes and stored callback results. The wildcard
custom-component guard also includes `itemLabel`; a temporary custom literal
fails the rule. An independent property/callback census traced 270 production
TS/TSX files, found the passkey fallback addressed below, and reported no further
in-scope strings. Read-only inventories: `/private/tmp/fresco-copy-census-review.json`
and `/private/tmp/fresco-all-copy-census-review.json`. Universal
ownership was checked against commonMessages: 37 direct common references and
zero duplicate common defaults (including case and Retry/Loading variants).
Contextual Save Changes, Edit Participant, Sign In and Permanently Delete are
whole app-owned actions with distinct meaning.

Intentional stable data includes protocol/user names, locale autonyms,
identifiers, filenames, URLs, field/schema/database/API/export keys, package and
product names, technical diagnostics and masked examples. `semVer` and provider
invariant errors are developer diagnostics handled by localized boundaries.
Participant-authored/runtime content remains in #1313's scope. Historical audit
prose is preserved as an original record; newly generated events use structured
metadata and current-locale rendering.

## Refactor and failure-path disposition

- Every researcher schema consumer uses the shared message-error formatter;
  narrow schema factories retain explicit English defaults for existing schema
  tests/type APIs and the independent participant action. Default parser/type
  errors for undefined required inputs now use the same field-owned descriptors.
- Existing error strings remain strings at action/form boundaries. No app codec,
  parallel form adapter or store shape was introduced. Error lists retain raw
  values in transport and format with the current locale.
- Table factories receive the current formatter and memo dependencies include
  it; persisted sort/filter/search identifiers remain stable. Asynchronous export
  and import progress retains phase identity rather than a frozen translation.
- TOTP verification now displays returned refusals in its field, and unexpected
  QR/setup errors display a localized retry message instead of an endless loader.
  Participant edit now preserves the open form and entered values on refusal.
- Participant URL selection now keeps one Popover/trigger across activations;
  both the popup and selector have localized names. Every app-owned PopoverContent
  was audited: InfoTooltip already uses BasePopover.Title/Description; import
  and incomplete-URL surfaces now have explicit names.
- Shared toast.promise follows Base UI's string-or-options contract. React nodes
  belong inside the description option. Every Fresco promise call was converted,
  preserving the prior string presentation and enabling live translation.
- Synthetic generation preserves non-OK refusals and streams typed failure
  metadata. Constraint reasons come from protocol-utilities; affected type/attribute
  names remain data and locale-aware lists. Original diagnostics remain under a
  labeled collapsed disclosure. Fetch/read/parse failures and truncated streams
  give truthful retry guidance about possible partial creation. Deletion refusals
  preserve counts, rejected requests clear busy state, and a refresh failure does
  not claim that already saved interviews were lost. Real API and rendered-UI
  regressions cover the production producer and consumer.
- Protocol import uses the existing protocol-validation presenter for invalid
  archives and damaged/missing JSON or assets. Entry decompression failures are
  bounded to their archive reads. Lookup, upload and persistence failures after a
  valid file receives separate retry guidance; each actual hook path retries the
  same file successfully in tests. No parallel validation engine was introduced.
- All three passkey registration paths retain recognized authenticator names and
  store null for unknown names. The existing deviceType selects one of two
  localized names in the list, queued removal confirmation and four activity
  templates. Optional strict activity identity preserves historical metadata;
  original audit prose remains exportable English. Existing non-null names are
  preserved verbatim, including ambiguous old English fallback names: guessing
  whether a saved name was generated or authored would alter user data. No extra
  credential migration is needed. Repository-wide searches found no other
  production copies of these fallback names; all three authenticator-name
  consumers and four activity producers are converted.
- Normal route initialization never consults navigator on its first client
  render. The catastrophic global-error boundary cannot receive a failed root's
  request initialization: it uses deterministic English SSR, then mirror/browser
  recovery. Repeating a failed account/database read would defeat recovery. This
  is a bounded exception; ordinary route errors and initialization stay localized
  before hydration.

## Verification and fail-capable oracles

Commands run from the app unless noted: `SKIP_ENV_VALIDATION=true vitest run
--project=units`, direct `tsc --noEmit`, root `oxlint apps/fresco`, root
`knip --workspace apps/fresco`, `oxfmt apps/fresco`, and actual `next build`.
The final full result is **80 files / 630 passing tests**. Direct TypeScript,
app lint, Knip, formatting and changeset guards pass. The actual production
Next build compiles source/catalog ICU ASTs, completes its TypeScript check and
generates all 22 pages. Evidence: `/private/tmp/fresco-units-final.log`,
`/private/tmp/fresco-typecheck-final.log`, `/private/tmp/fresco-lint-final.log`,
`/private/tmp/fresco-knip-final.log`, `/private/tmp/fresco-format-check-final.log`,
`/private/tmp/fresco-changeset-final.log`, `/private/tmp/fresco-diff-check-final.log`,
and `/private/tmp/fresco-next-build-final.log`. Lint has warnings, with no errors;
the explicit counts synchronization effect reflects refreshed server data after
partially completed generation. No lint rule was disabled for it.
`InfoTooltip.stories.tsx` also passed all seven browser interaction tests.

The commit hook merged three duplicate imports and normalized two Tailwind
`break-words` classes to `wrap-break-word`. The committed source was inspected,
then the complete unit suite, types, lint, root workspace Knip, formatting,
production build, and final mobile/passkey/failure browser workflows were rerun.
The final inventory records the committed hashes after those normalizations.

Regression coverage prepared for commit includes registry/catalog freshness and ICU rules,
preference negotiation and writes, request initialization, stale identity and
write ordering, recovery, real participant layout, real activity table details,
active export, actual SignInForm errors, actual ParticipantModal refusal/required
errors, actual mobile menu focus, and actual participant URL copy/locale behavior.

Deliberate broken-behavior checks failed, then passed after restoration:

| Oracle                                                            | Evidence                                                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ignore authenticated-null Automatic rule                          | `/private/tmp/fresco-oracle-automatic-{red,green}.log`                                                                       |
| Remove expected-account write guard                               | `/private/tmp/fresco-oracle-identity-{red,green}.log`                                                                        |
| Freeze an active export notification                              | `/private/tmp/fresco-oracle-export-{red,green}.log`                                                                          |
| Render original prose in the actual activity column               | `/private/tmp/fresco-oracle-activity-{red,green}.log`                                                                        |
| Remove undefined-required-input localization                      | `/private/tmp/fresco-oracle-participant-empty-{red,green}.log`                                                               |
| Remove first-click Popover / selector name / promise option shape | `/private/tmp/fresco-oracle-participant-url-{disclosure,name,promise}-red.log` and `fresco-oracle-participant-url-green.log` |
| Visible submitted sign-in error retains old language              | `/private/tmp/fresco-submission-error-{red,green}.log` and final standalone replay                                           |

Additional deliberate mutations failed and restored tests pass:

- Synthetic generic-refusal, dropped API detail and incorrect refresh-error
  mutations: `/private/tmp/fresco-oracle-synthetic-{refusal,api,refresh}-red.log`.
  Original failure paths also failed the UI oracles; the first non-OK test's
  initial Suspense fixture issue was corrected and the dedicated refusal mutation
  above fails for the intended missing-specific-message assertion. Restored API
  and UI paths: `/private/tmp/fresco-oracle-failure-paths-green.log` (19 tests).
- Archive and operational import regressions:
  `/private/tmp/fresco-oracle-protocol-import-failures-red.log`; restored 5 hook
  tests are included in the failure-path log. Bounded entry decompression
  mutations fail both tests in `/private/tmp/fresco-oracle-protocol-entry-red.log`.
- Persisting a generated English passkey name, freezing generic names to English,
  or overwriting stored names each fails the corresponding regression:
  `/private/tmp/fresco-oracle-passkey-{storage,language,data}-red.log`; all 19
  restored tests pass in `/private/tmp/fresco-passkey-names-green.log`.
- `/private/tmp/fresco-oracle-custom-prop-red.log` records the rejected temporary
  custom component `itemLabel` literal; the probe was removed and lint passes.

Disposable local PostgreSQL 17 and S3-compatible object storage serve the real
standalone artifact. Locale SQL upgrade proof seeded an existing User/Key/Session,
preserved them, round-tripped Spanish and null, and rejected empty/oversized tags.
Activity upgrade proof preserved a historical record and round-tripped structured
metadata. Full Prisma migrate deploy passed. No production account or data was
used. Evidence: `/private/tmp/fresco-migration-proof.log`,
`/private/tmp/fresco-activity-migration-proof.log`, and migration-deploy logs.

Standalone browser evidence:

- `/private/tmp/fresco-locales-mobile-final.log`: en/en-GB/es account changes and
  reloads, all five fully rendered researcher routes and ARIA trees, 390px Spanish
  navigation and required-field error, no page/console errors.
- `/private/tmp/fresco-i18n-browser-final.log`: conflicting account/mirror/browser
  SSR agreement with only `es` observed during hydration, keyboard focus/Tab,
  explicit persistence, null clearing/ignoring stale mirrors, translated failed
  sign-in and backoff/retry, second account Automatic, eight isolated requests,
  and settings labels/disabled states. No browser errors.
- `/private/tmp/fresco-submission-error-final.log`: an already-visible credential
  refusal changes es to en without another submission.
- Participant add/edit/duplicate/export/cancel, synthetic generation, export ZIP,
  persisted timestamps, TOTP verification and disabling logs are retained under
  `/private/tmp/fresco-*.log`. Identifiers, accented labels and research export
  fields were checked directly. Test accounts finish password-only after TOTP QA.
- `/private/tmp/fresco-import-boundary-final.log`: invalid CSV, collision refusal,
  accented CSV import, stable generated participant link and English runtime in a
  Spanish host, duplicate protocol refusal preserving the original.
- `/private/tmp/fresco-delete-download-final.log` reached the final fixture import
  after the interview-delete, participant-delete and byte-identical-download
  assertions passed. Its name-only protocol fixture was correctly rejected as a
  duplicate. `/private/tmp/fresco-delete-protocol-final.log` passes the replacement
  fixture with a distinct stage label, including cancel, deletion and preservation
  of the original protocol.

- `/private/tmp/fresco-final-failures-browser.log` passes the final built artifact:
  real virtual-authenticator mode switching and additional registration, persisted
  generic names in English/Spanish, correctly named removal dialogs and cancel,
  an unforced mobile Remove click, reauthentication and restoration of the original
  password mode. The actual generation route supplies a 404 refusal that changes
  es to en without a second request. A real valid archive survives a simulated
  lookup connection failure and imports successfully on retry; its disposable
  protocol is then removed while the original remains. No page errors.
- `/private/tmp/fresco-data-preservation-final.log` passes fresh browser reads of
  the empty interview table, chosen participant deletion, preserved separate
  identifier/accented label, byte-identical original protocol download after
  disposable-protocol deletion, and restored password-only account with no keys.
- The actual mobile passkey click failed before the responsive row correction:
  `/private/tmp/fresco-passkey-mobile-click-red.log`. The before image
  `/private/tmp/fresco-passkey-es-mobile-before.png` visibly clips Remove. The
  revised `/private/tmp/fresco-passkey-es-mobile.png` wraps name/badge/dates and
  keeps the entire action inside the card; the final browser log proves the
  unforced click succeeds. The orchestrator independently inspected both images
  and accepted the visual change. No screenshot baseline was replaced.

Spanish desktop and mobile views were visually inspected at 1440px and 390px.
Long descriptions wrap; navigation/actions fit; the participant required error
remains directly associated with its input. The shared visual classifier selects
all three canonical E2E suites because the branch inherits shared prerequisites.
Those shared baselines are orchestrator-owned; Fresco-only source and its importer
addition do not affect them. No host-generated canonical PNG baseline is adopted.

## Delivery status and next executable action

The complete Fresco-owned implementation is locally verified on shared checkpoint
`375b2ea73`. The current source/test inventory and content hashes are recorded in
`/private/tmp/fresco-final-inventory.json`: 194 owned files, 19 new test files, one
test helper, eight adapted existing test files, and exactly three added lockfile
importer lines. The normal-lane minor changeset is ready. The draft PR description
is `/private/tmp/fresco-pr-body.md`. This is implementation QA, not a production
release approval or a completed external PR review.

1. Orchestrator: inspect the verified, user-attributed Fresco commit. Keep
   subsequent shared integration held pending the existing permission
   question; the shared review's reason-code correction remains shared-owned.
2. Orchestrator: create the separately reviewable Fresco PR based on
   `feat/app-i18n-spanish-prerequisites`, integrate the approved current shared
   head with normal ancestry, and rerun affected gates on that exact head.
3. Run current-head CI, request and complete explicit Codex review/corrective
   rounds, resolve discussions, and report ready-to-merge status. Do not merge or
   release without the user's authorization.
