# Architect, Interviewer, and Fresco app localization execution plan

Status: implementation in progress. No PR is ready to merge yet.

## Contract and baseline

Implement [#1616](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1616), [#1617](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1617), and [#1618](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1618) in full against the accepted [app localization design](../specs/2026-09-04-studio-ui-localization-design.md) and the boundaries in the [protocol localization design](../specs/2026-08-27-protocol-localization-design.md). The user extends every target app's production locales to canonical `en`, `en-GB`, and complete neutral Spanish `es`. English source descriptors remain the runtime fallback; British English is a sparse reviewed override. Protocol content, answers, persisted identifiers, and participant runtime translation remain separate.

Initial live baseline: `origin/main` at `4c4789f59a9ff087630e821dad2ed3f50a70d9b3`, fetched 2026-09-05. All three issue bodies and comments were read (no issue comments). Related merged implementations: [#1648](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1648), [#1649](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1649), [#1650](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1650), [#1651](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1651). Their implementation and review findings inform the work; their old verification claims do not verify these branches.

Authorized: implementation, tests, user-attributed commits, normal feature pushes, PRs, explicit `@codex review` requests, replies and thread resolution. Merging, force pushes, releases, and production deployment require separate authorization.

## Ownership and delivery boundaries

| Workstream                                 | Owner                                                   | Branch / worktree                                               | PR base and scope                                                                                                     | Next executable action                                                                    |
| ------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shared prerequisites                       | Lead                                                    | `feat/app-i18n-spanish-prerequisites`; original worktree        | `main`; ecosystem/shared Spanish catalogs, Studio subset protection, shared HTTP parser, necessary Next build support | Complete affected consumer builds/E2E and open prerequisite PR                            |
| Architect #1616                            | Architect agent                                         | `feat/architect-app-i18n`; `/private/tmp/nc-i18n-architect`     | Shared prerequisite branch; Architect implementation and app changeset                                                | Finish source/copy audit, adapt affected unit expectations, and run full app verification |
| Interviewer #1617                          | Interviewer agent                                       | `feat/interviewer-app-i18n`; `/private/tmp/nc-i18n-interviewer` | Shared prerequisite branch; Interviewer implementation and app changeset                                              | Merge error checkpoint, complete final native/PWA/visual checks and prepare PR            |
| Fresco #1618                               | Fresco agent                                            | `feat/fresco-app-i18n`; `/private/tmp/nc-i18n-fresco`           | Shared prerequisite branch; Fresco implementation, additive user migration, app changeset                             | Merge error checkpoint, rerun real researcher workflows and complete final verification   |
| Independent Spanish and integration review | Separate reviewer after capacity frees; lead integrates | Inspect each app worktree and shared branch                     | Review evidence recorded here and in per-app inventories                                                              | Review Architect final 698-entry delta and inspect final app diffs/workflow evidence      |

The lead exclusively owns shared catalogs, shared packages, Studio compatibility edits, and root dependency configuration. After merging shared checkpoints, each app owner may update only its isolated app importer in the lockfile; the lead reviews the additive diff before integration. Agents own their app manifests, source, generated English catalog, Spanish/GB catalogs, app plan, and app changeset. Shared changes land once and merge normally into each dependent branch. No cherry-picked duplicates. Intended merge order: shared prerequisite, then the three independently reviewable app PRs. If CI remains base-filtered to `main`, select an evidence-backed supported run or clearly record that external gate; do not treat missing CI as passing.

## Acceptance and evidence matrix

Every row is outstanding until linked implementation and passing verification evidence are recorded. Per-app plans enumerate individual files and legitimate exceptions; catalog coverage alone cannot detect unextracted strings.

| Requirement                                                                                  | Owner / surfaces                                                                                                                         | Required evidence                                                                                                                  | Current status                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Existing APIs, namespaced explicit descriptors, English defaults and translator descriptions | All; app-owned `architect.*`, `interviewer.*`, `fresco.*`                                                                                | Source inventory; imports/call-site audit; duplicate/description/extraction guards                                                 | Shared guards pass; app source inventories and final deltas under review                                   |
| Universal and component-owned copy translated once                                           | Shared and all app catalog manifests                                                                                                     | Common/shared/app catalog layering; no direct react-intl import in apps; review                                                    | Shared owning catalogs implemented and independently reviewed; app layering implemented                    |
| Canonical `en`, `en-GB`, `es`; complete nonblank Spanish; sparse GB                          | All registries/catalogs                                                                                                                  | Full/subset checks, ICU syntax, token/rich-text/argument-kind parity                                                               | Shared guards pass; all app catalogs complete at current snapshots; final deltas pending                   |
| Shared ecosystem completeness                                                                | app-i18n/common, fresco-ui; any other governed package                                                                                   | Every ecosystem consumer enumerated; all catalogs complete                                                                         | 355 shared entries reviewed across six owning catalogs; completeness guards pass                           |
| Studio remains its declared supported subset                                                 | Studio client registry and RPC/server contract                                                                                           | Client/server registry equality plus ecosystem subset tests                                                                        | Implemented; 8 subset tests and actual Studio build pass                                                   |
| Whole ICU sentences, plurals/select/rich text and locale-aware formatting                    | Every app; outside-JSX labels, validation, errors, dates/counts                                                                          | Literal and formatting audit; representative translated outputs                                                                    | Shared review fixes verified; Architect final plural/fragment corrections in progress                      |
| English fallback and provider-optional shared components                                     | Shared runtime and existing unlocalized consumers                                                                                        | Existing regressions; Spanish/provider-optional tests; builds                                                                      | Shared unit/Storybook and three canonical English visual suites pass; latest form fix rerun running        |
| Pure shared Accept-Language helper                                                           | protocol-validation root export, Fresco request adapter                                                                                  | q ordering/ties/duplicates/invalids/wildcards/zero quality/canonicalization; Node tests                                            | Implemented root export; 25 tests pass, ordering mutation fails 17 assertions                              |
| Browser best-fit, fallback, malformed/unsupported persisted preference                       | Architect and Interviewer providers                                                                                                      | Unit + browser tests with regional Spanish/GB preferences                                                                          | App implementations and focused tests pass; lead final evidence audit pending                              |
| Immediate choice, reload persistence and automatic mode                                      | Architect and Interviewer language settings                                                                                              | LocaleSelect keyboard workflow; storage/reload/languagechange tests                                                                | App focused tests and Interviewer production offline workflow pass; final integrated runs pending          |
| Correct root document language and direction                                                 | All app providers, initial Fresco document                                                                                               | First render and live transitions, RTL harness, no hydration warnings                                                              | App provider/boundary tests pass; final browser evidence review pending                                    |
| Protocol-authored content and stable research identifiers preserved                          | Architect authoring/preview, Interviewer and Fresco interview routes                                                                     | Boundary tests; compare protocol/session data across admin locale changes                                                          | Boundary tests implemented; Interviewer participant layout correction under final visual review            |
| Architect complete chrome                                                                    | Library/timeline, menus/settings, every editor/form/dialog, validation/resources, preview host, import/export, loading/errors/a11y names | App surface inventory + real representative workflows in all three locales                                                         | 1793-ID snapshot; final source audit, copy corrections and existing-unit adaptation ongoing                |
| Interviewer complete administration                                                          | Protocol deck, onboarding/security/settings, sessions, imports/exports, install/update/offline/error states                              | App surface inventory + real workflows in all three locales                                                                        | Complete inventory and independent catalog review; latest submitted-error integration pending              |
| Interviewer installed/offline locale availability                                            | Bundled catalogs and service worker                                                                                                      | Actual production PWA offline navigation and switch/reload in Spanish                                                              | Actual production offline Spanish switch/reload/import passed; final-head rerun pending                    |
| Fresco complete researcher server/client surfaces                                            | Setup/auth, dashboard/protocols/interviews, exports, settings/security, actions/validation/errors/loading                                | App surface inventory; request formatter/cached-content audit; live all-locale workflows                                           | 831-ID review complete; activity details and live submission failures corrected; rerun pending             |
| Fresco user persistence and migration                                                        | Existing Prisma user/auth model, nullable preference, authenticated write, settings UI                                                   | Additive migration and old-user behavior; strict valid tags/null; auth preservation                                                | Additive user/event migrations exercised on populated disposable PostgreSQL; lead audit pending            |
| Fresco preference precedence and initialization                                              | Account > device mirror > Accept-Language > default                                                                                      | Server/client agreement, malformed values, automatic semantics, serializable initialization                                        | Server/browser matrix passed; final combined build and lead audit pending                                  |
| Fresco stale writes, caching and cross-user isolation                                        | Request formatter, auth transitions, preference mutations                                                                                | Two users/requests, race/reload tests; no shared mutable intl; no stale mirror override                                            | Two-user/eight-request and null mirror tests passed; lead audit pending                                    |
| Shared compilation supports Vite and Next source/npm dist                                    | app-i18n compiler and host builds                                                                                                        | Actual production builds, compiled ICU/Spanish behavior, parser exclusion if required                                              | Actual library/Vite/Next builds pass; packed exports checked, final execution probe pending                |
| Catalog freshness and untranslated-copy safeguards                                           | All extraction scripts and guards, literal inventories                                                                                   | Fresh extraction, deliberately broken missing/blank/token/duplicate/literal guards fail then pass                                  | Shared guards pass; app extraction and deliberate mutation guards implemented                              |
| Accessibility, expansion and directionality                                                  | LocaleSelect and all changed layouts                                                                                                     | Keyboard/screen-reader names, required/disabled/errors, long Spanish and RTL, inspected visuals                                    | Live fixes for narrow settings, error liveness and pagination naming; final app audit pending              |
| Verification per PR                                                                          | Root/package scripts inspected before running                                                                                            | Formatting, lint, typecheck, Knip, relevant unit/Storybook/E2E, actual builds; no weakened assertions                              | Shared broad checks pass at checkpoint 3; latest error seam rerun running; app final checks pending        |
| Meaningful regression tests                                                                  | Changed behavior                                                                                                                         | Deliberate production mutation produces expected failure, restore produces pass                                                    | Locale freezing, refusal erasure, plural wording and HTTP ordering mutations fail as intended              |
| Visual baselines                                                                             | All affected suites                                                                                                                      | Pinned workflow generation, image review and required approval, only explained changes                                             | Shared Docker: Interview165+6skips, Interviewer5, Architect2 pass with no PNG changes; app runs pending    |
| Spanish independent review                                                                   | All common/shared/app entries                                                                                                            | Separate reviewer provenance, findings and corrections; distinguish AI review from human translation review                        | All shared355, Interviewer444, Fresco831 reviewed; Architect initial1417 reviewed, 698-entry delta pending |
| Correct release lanes and complete PR docs                                                   | Prerequisite and each issue                                                                                                              | Changeset policy, clear issue links/scope/dependencies/evidence                                                                    | Shared existing/new lane-correct changesets authored; PR creation pending                                  |
| Codex PR review loop                                                                         | Every latest PR head                                                                                                                     | Explicit request, completed head-attributable clean verdict, submissions/inline/top-level audit; replies/resolved outdated threads | Pending PR creation; no external review completion claimed                                                 |
| Final integration and clean delivery                                                         | Combined shared/apps tree and separate branches                                                                                          | Current head checks, lead diff audit, no uncommitted changes, URLs/SHAs/merge order                                                | Shared main merge complete; latest checkpoint and final app integration pending                            |

## Findings and decisions

1. Studio currently derives its production registry from all of `ecosystemLocales`; adding Spanish without narrowing the registry would advertise an unsupported locale and disagree with its server contract. Preserve `SUPPORTED_STUDIO_LOCALES` as the authority for Studio's subset.
2. `parseAcceptLanguage` is absent on the fetched main. The protocol design assigns focused files under `protocol-validation/src/localization/` and explicit exports from its existing root. Implement only the HTTP preference parser, with no schema-9 activation or Fresco-local duplicate.
3. Catalog-bearing ecosystem packages on this baseline are `app-i18n` and `fresco-ui`. Studio is app-owned and keeps English/GB. Website and site navigation catalogs have their own existing localization contracts and are outside the ecosystem registry.
4. Shared infrastructure currently exposes Vite compilation but no Next build adapter. Fresco must format the same source and catalogs across server/client and source/npm-dist builds; the lead is investigating the smallest reusable build integration.
5. Previous review threads exposed labels generated outside JSX, stale preference acknowledgments, and writes surviving account transitions. These are explicit audit targets here.
6. Some prior PRs show historical external Codex review quota failures. That is not a current blocker until a review on this work's current head reports it. Internal review cannot substitute for the requested external round.

## Verification and review log

- 2026-09-05: fetched main; clean starting checkout; configured commit identity is the user's; created four feature branches and three isolated app worktrees. All three substantial app workstreams dispatched with specifications, Spanish amendment, ownership and evidence requirements.
- Shared integration checkpoint: ecosystem `es`, complete common/Fresco UI Spanish, Studio subset protection, HTTP parser, common Vite/Next catalog compiler, optional exporter-stage messages/catalogs, and localized interface-name catalog implemented. Shared Toast region and TimeAgo now follow the provider; Toast titles accept ReactNode for live formatted content.
- Checkpoint verification: app-i18n 77 tests passed; protocol-validation HTTP parser 25 passed; Studio subset 8 passed (two failed before the subset fix); protocol-builder names/catalogs 10 passed; network-exporters messages/catalogs 8 passed; Fresco UI TimeAgo/Toast/catalogs 19 passed. The full Fresco UI unit run passed 2053 tests with one new test failing because its fixture omitted commonCatalogs; correcting the fixture to merge the public common catalog made the targeted run pass. Full rerun follows final shared changes.
- app-i18n, fresco-ui, protocol-builder, protocol-validation and network-exporters typechecks passed. Actual app-i18n, protocol-validation and network-exporters builds passed. Network-exporter JSON include omission was found by typecheck and fixed. Shared scoped Knip and descriptor lint passed (existing warnings remain). Formats applied. Fresco actual Next integration and publish-artifact verification remain pending.
- Shared work still required: translated archive/migration guidance and synthetic validation repair guidance, StageTypeImage/StageNameSection display copy, compiler documentation, independent Spanish review, final broad checks and visual impact review. This checkpoint unblocks app builds; it is not a completed prerequisite PR.
- App agent evidence pending lead verification: Interviewer production/offline language workflow passed and 611 unit tests passed with two shared-registry expectations awaiting this checkpoint; participant layout regression found and fix in progress. Fresco locale tests passed and a complete first-pass Spanish catalog exists; real Next build awaits this checkpoint. Architect source audit continues and Spanish translation is underway.
- No PR, external Codex review, final translation review or completion claimed yet.

## Completion gate

All matrix entries and per-app surface rows need implementation and verification evidence. Every PR needs its correct changesets, latest-head green required checks, completed clean Codex review round, and zero unresolved actionable discussions (including outdated threads). Combined integration and all shared dependencies must be verified. Report each issue PR URL, final head SHA, tests/builds/checks, review rounds and merge order. Final state is **ready to merge**, never **merged**, because merge authorization has not been given.

## Shared checkpoint 2 evidence (2026-09-05)

- Commits `847d42ce1`, `02d02c7d2`, and `0521ad8c8` are user-attributed shared checkpoints. App branches merge these normally. The AppMessage queued-node regression fails when forced to the default English formatter (`/private/tmp/nc-appmessage-mutation.log`), then passes after restoration.
- Fresco's actual production Next build failed during server page evaluation because the original facade called `defineMessages` from react-intl's client entry. The supported `react-intl/server` entry fixes this while retaining rich-node semantics. App-i18n now has 80 passing tests, including Node with `--conditions=react-server`, and a passing actual library build. The Fresco agent reports the full Next build passed compilation, typechecking, page data and 22/22 static generation after `0521ad8c8`; lead final integration remains pending.
- Localized optional UI subpaths now exist in protocol-validation and protocol-utilities. The root validation/CLI entry remains framework-free and self-contained in its dist entry/chunks. `describeProtocolFileErrorMessage` shares classification with legacy English guidance. `formatValidationContradiction` provides whole actionable summaries and `formatValidationRule` labels known rules. Synthetic generation emits stable reasonCode metadata; `formatConstraintConflictReason` renders actionable guidance. Original detailed `reason`/`message` remains diagnostic evidence, displayed only under an explicitly labelled technical-details disclosure with `lang=en`/`dir=ltr` when needed. No localized text is used as a persisted identifier or generation input.
- Shared-seam audit: all generateNetwork refusal construction paths (feasibility, draw exhaustion, composer date controls, pedigree materialization) now carry reason metadata. SyntheticInterview is a separate programmatic builder with no in-scope app call site; its original diagnostics remain unchanged, and legacy caller-created ConstraintConflict objects receive a translated general rules explanation from the optional UI presenter.
- Protocol-validation full tests: 1540 passed, 2 pre-existing skips. Protocol-utilities full tests: 1086 passed after extending one exact-object expectation with the new `drawExhausted` metadata. Both typecheck and actual builds pass; the validation declaration build initially exposed missing JSON inclusion and was fixed, with a clean rebuild.
- Protocol-builder interface names, stage screenshot alt text and default StageNameSection copy now use its own catalog. The legacy INTERFACE_NAMES auto-naming defaults remain English so locale switching cannot modify protocol data. 17 focused tests passed, including translated image names and decorative empty alt preservation. Full protocol-builder suite passed 478 tests.
- Queued DialogProvider/Toast copy props now accept ReactNode consistently. Confirm error guidance can use `describeError(error)` while the dialog remains open for retry. Six focused dialog/Toast tests passed, covering changing defaults/actions/error content while open and focus return. Full Fresco UI unit suite passed 2055 tests.
- Scoped Knip passed for all touched shared packages. Descriptor lint passed except one obsolete callback dependency found after reactive defaults; removed and targeted lint passes. Shared catalog extraction and parity guards passed. Packed export verification passed app-i18n, protocol-validation and protocol-utilities; network-exporters initially lacked its advertised locales.d.ts path, so its types export now points to the actual dist/locales/catalogs.d.ts artifact; recheck passed.
- Visual classifier conservatively selects all three suites because shared code and the lockfile changed. Shared English render invariants are retained; TimeAgo machine datetime and stage image alt changes affect semantics rather than pixels. The added locale settings and participant boundary wrappers in app branches require their own pinned visual verification. No baseline adoption has been claimed by the lead.
- Read linked server PR #1650 and its review discussions: account null remains meaningful, authorization is per user, input must not bypass the dedicated writer, and Studio's supported subset remains exact. Its historical review-limit responses are not evidence of a current review blocker.
- Next shared actions: finish broad unit runs and local package export verification; add compiler/API docs and correct lane changesets; independently review Spanish; inspect shared affected-host E2E and Storybook evidence; open prerequisite PR and request current-head Codex review. Next app actions: complete remaining copy audits, consume the shared guidance/ReactNode APIs, run full integrated checks and inspect workflows in all locales.

## Shared checkpoint 3: independent Spanish review and delivery checks

A separate AI reviewer (the Interviewer workstream agent, not the shared catalog
author) reviewed all 355 shared Spanish entries against their English descriptors:
12 common, 244 Fresco UI, 24 protocol builder, 4 exporters, 43 validation, and
28 utilities. This is an independent AI language review, not a qualified human
translator review. All three findings were fixed: network-edge icon terminology
is now `Vínculos`; text-length hints/errors use complete ICU plurals; the maximum
length error now says “at most” / “como máximo”, agreeing with the actual inclusive
validator. Restoring the old messages makes three regression assertions fail on
the incorrect boundary wording and singular grammar. The restored implementation
passes 234 focused validation/catalog tests, shared UI typechecking, and the actual
Fresco UI library build.

The full Fresco UI Storybook suite passed 1,318 tests across Chromium and Firefox
(176 files). It logged resize-observer/textarea warnings without failing
the test verdict; no assertions or browser error handling were weakened. Full
network-exporter tests passed 99 tests in 17 files. Reversing Accept-Language
quality ordering makes 17 parser assertions fail; restoring it passes all 25.
Workspace lint/format checks and full Knip pass. Logs: `/private/tmp/nc-length-review-mutation.log`,
`/private/tmp/nc-length-review-green.log`, `/private/tmp/nc-shared-fresco-ui-storybook.log`,
`/private/tmp/nc-shared-fresco-ui-build.log`, `/private/tmp/nc-shared-exporters-tests.log`,
`/private/tmp/nc-accept-language-mutation.log`, `/private/tmp/nc-accept-language-green.log`,
`/private/tmp/nc-shared-lint.log`, and `/private/tmp/nc-shared-knip.log`.

Release notes extend the existing pending Fresco UI and Studio localization
changesets, with a separate normal-lane changeset for the new optional validation,
generation, and export APIs. A successful fresh tag fetch found no app-i18n release
tag; its exact first-publication version remains 0.1.0, matching the approved
manifest entry. The new package README documents Vite and Next source/published
build integration, reactive queued messages, host boundaries, and optional engine
presentation entry points.

Independent app translation review is in progress. The lead reviewed every
Interviewer message (444 IDs / 416 unique pairs) and requested corrections to
codebook/edge terminology, singular selection grammar, total-number formatting,
and progress plurals; the owner applied these and added behavior assertions.
Architect's first-pass review found inconsistent formality against the shared/app
voice and fragmented resource-count sentences; those are being corrected while
the semantic review continues. Fresco's real production browser run exposed
English generated activity details; new entries will carry structured localization
metadata and render in the active language while historical free text remains
unchanged. These app workstreams are not yet ready to merge.

## Shared checkpoint 4: submitted errors and final host checks

The normal merge from freshly fetched `origin/main` at `2928a402e` produced
shared head `4cdd831f9d3677fb2a77fe01802377313d211e66`; all app branches merged it.
All 25 workspace typecheck tasks passed, and Studio's actual Vite production
build passed while its declared supported locales remain English and British
English. Canonical Docker visual generation passed Interview (165 passed,
6 configured skips), Interviewer (5 passed), and Architect (2 passed). None
changed a PNG baseline. Logs are `/private/tmp/nc-shared-all-types.log`,
`/private/tmp/nc-shared-studio-build.log`, and
`/private/tmp/nc-shared-{interview,interviewer,architect}-visual-1.log`.

A real Fresco failed-sign-in workflow demonstrated that translated strings
stored in form state remain stale after changing language. The shared
`createMessageError` / `formatMessageError` facade transports a descriptor and
named primitive/list values through existing string result contracts;
`AppErrorMessage` formats them at render time. Source and precompiled ICU
defaults both retain English fallback. FieldErrors, FormErrors and
DialogProvider render this transport, and useField preserves submitted
refusals instead of erasing them during local revalidation on a locale change.
Ordinary technical strings retain their existing behavior.

Two production mutations demonstrate distinct regressions: freezing the field
renderer in English fails the Spanish error assertion, and removing the
submitted-error preservation guard fails because the server refusal disappears.
Both mutations were restored. The existing client-boundary guard also caught
a missing `use client` directive on FormErrors, which was fixed without changing
the guard. Live Fresco table inspection found an unnamed page-size control;
it now receives the same localized label as its visible caption. New tests
for both synchronous/asynchronous dialog failures and the pagination
accessible name failed before their fixes. Final reruns passed: app-i18n 89 tests, Fresco UI 2062 tests, all 25 workspace typecheck tasks, actual app-i18n/Fresco UI builds, workspace lint/format and full Knip. Logs: `/private/tmp/nc-message-errors-fresco-ui-green.log`, `/private/tmp/nc-message-errors-all-green.log`, `/private/tmp/nc-shared-final-all-types.log`, `/private/tmp/nc-message-errors-lint-final.log`, `/private/tmp/nc-message-errors-knip-green.log`, `/private/tmp/nc-message-errors-builds-green.log` and `/private/tmp/nc-message-errors-fresco-ui-build.log`.
Evidence: `/private/tmp/nc-submission-frozen-mutation.log`,
`/private/tmp/nc-submission-erased-mutation.log`,
`/private/tmp/nc-shared-refusal-pagination-red.log`.

Independent AI review of all first-pass Architect pairs is complete; the
owner is correcting pluralization, inclusive bounds and fragmented rich
messages. Its final catalog contains 1793 IDs, with a 698-entry changed/new
delta still awaiting independent review. Interviewer's independent review
of all 831 Fresco entries found three plural/count wording corrections, now
assigned to the owner. These are AI reviews, not human translator sign-off.

Next shared action: commit the verified error checkpoint for app integration, then complete packed-artifact execution
and final Storybook checks and open the prerequisite PR. App owners finish
source/browser audits and latest-head verification before their PRs. No
external Codex review or completion is claimed yet.
