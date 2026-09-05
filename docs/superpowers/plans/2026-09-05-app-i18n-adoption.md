# Architect, Interviewer, and Fresco app localization execution plan

Status: implementation in progress. No PR is ready to merge yet.

## Contract and baseline

Implement [#1616](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1616), [#1617](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1617), and [#1618](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1618) in full against the accepted [app localization design](../specs/2026-09-04-studio-ui-localization-design.md) and the boundaries in the [protocol localization design](../specs/2026-08-27-protocol-localization-design.md). The user extends every target app's production locales to canonical `en`, `en-GB`, and complete neutral Spanish `es`. English source descriptors remain the runtime fallback; British English is a sparse reviewed override. Protocol content, answers, persisted identifiers, and participant runtime translation remain separate.

Initial live baseline: `origin/main` at `4c4789f59a9ff087630e821dad2ed3f50a70d9b3`, fetched 2026-09-05. All three issue bodies and comments were read (no issue comments). Related merged implementations: [#1648](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1648), [#1649](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1649), [#1650](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1650), [#1651](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1651). Their implementation and review findings inform the work; their old verification claims do not verify these branches.

Authorized: implementation, tests, user-attributed commits, normal feature pushes, PRs, explicit `@codex review` requests, replies and thread resolution. Merging, force pushes, releases, and production deployment require separate authorization.

## Ownership and delivery boundaries

| Workstream                                 | Owner                                                   | Branch / worktree                                               | PR base and scope                                                                                                     | Next executable action                                                                          |
| ------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared prerequisites                       | Lead                                                    | `feat/app-i18n-spanish-prerequisites`; original worktree        | `main`; ecosystem/shared Spanish catalogs, Studio subset protection, shared HTTP parser, necessary Next build support | Finish coherent CI corrections on PR #1702, push, and request another current-head Codex review |
| Architect #1616                            | Architect agent                                         | `feat/architect-app-i18n`; `/private/tmp/nc-i18n-architect`     | Shared prerequisite branch; Architect implementation and app changeset                                                | Finish source/copy audit, adapt affected unit expectations, and run full app verification       |
| Interviewer #1617                          | Interviewer agent                                       | `feat/interviewer-app-i18n`; `/private/tmp/nc-i18n-interviewer` | Shared prerequisite branch; Interviewer implementation and app changeset                                              | Shared integration awaits permission; prepare final app evidence and independent census review  |
| Fresco #1618                               | Fresco agent                                            | `feat/fresco-app-i18n`; `/private/tmp/nc-i18n-fresco`           | Shared prerequisite branch; Fresco implementation, additive user migration, app changeset                             | Finish failure-path and passkey corrections, final checks, and app PR preparation               |
| Independent Spanish and integration review | Separate reviewer after capacity frees; lead integrates | Inspect each app worktree and shared branch                     | Review evidence recorded here and in per-app inventories                                                              | Review final app catalog deltas and outside-JSX census; inspect app workflow evidence           |

The lead exclusively owns shared catalogs, shared packages, Studio compatibility edits, and root dependency configuration. After merging shared checkpoints, each app owner may update only its isolated app importer in the lockfile; the lead reviews the additive diff before integration. Agents own their app manifests, source, generated English catalog, Spanish/GB catalogs, app plan, and app changeset. Shared changes land once and merge normally into each dependent branch. No cherry-picked duplicates. Intended merge order: shared prerequisite, then the three independently reviewable app PRs. If CI remains base-filtered to `main`, select an evidence-backed supported run or clearly record that external gate; do not treat missing CI as passing.

## Acceptance and evidence matrix

Every row is outstanding until linked implementation and passing verification evidence are recorded. Per-app plans enumerate individual files and legitimate exceptions; catalog coverage alone cannot detect unextracted strings.

| Requirement                                                                                  | Owner / surfaces                                                                                                                         | Required evidence                                                                                                                  | Current status                                                                                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Existing APIs, namespaced explicit descriptors, English defaults and translator descriptions | All; app-owned `architect.*`, `interviewer.*`, `fresco.*`                                                                                | Source inventory; imports/call-site audit; duplicate/description/extraction guards                                                 | Shared guards pass; app source inventories and final deltas under review                                                    |
| Universal and component-owned copy translated once                                           | Shared and all app catalog manifests                                                                                                     | Common/shared/app catalog layering; no direct react-intl import in apps; review                                                    | Shared owning catalogs implemented and independently reviewed; app layering implemented                                     |
| Canonical `en`, `en-GB`, `es`; complete nonblank Spanish; sparse GB                          | All registries/catalogs                                                                                                                  | Full/subset checks, ICU syntax, token/rich-text/argument-kind parity                                                               | Shared guards pass; all app catalogs complete at current snapshots; final deltas pending                                    |
| Shared ecosystem completeness                                                                | app-i18n/common, fresco-ui; any other governed package                                                                                   | Every ecosystem consumer enumerated; all catalogs complete                                                                         | 405 shared entries independently reviewed across six owning catalogs; completeness guards pass                              |
| Studio remains its declared supported subset                                                 | Studio client registry and RPC/server contract                                                                                           | Client/server registry equality plus ecosystem subset tests                                                                        | Implemented; 8 subset tests and actual Studio build pass                                                                    |
| Whole ICU sentences, plurals/select/rich text and locale-aware formatting                    | Every app; outside-JSX labels, validation, errors, dates/counts                                                                          | Literal and formatting audit; representative translated outputs                                                                    | Shared review fixes verified; Architect final plural/fragment corrections in progress                                       |
| English fallback and provider-optional shared components                                     | Shared runtime and existing unlocalized consumers                                                                                        | Existing regressions; Spanish/provider-optional tests; builds                                                                      | Shared unit/Storybook and three canonical English visual suites pass; latest form fix rerun running                         |
| Pure shared Accept-Language helper                                                           | protocol-validation root export, Fresco request adapter                                                                                  | q ordering/ties/duplicates/invalids/wildcards/zero quality/canonicalization; Node tests                                            | Implemented root export; 25 tests pass, ordering mutation fails 17 assertions                                               |
| Browser best-fit, fallback, malformed/unsupported persisted preference                       | Architect and Interviewer providers                                                                                                      | Unit + browser tests with regional Spanish/GB preferences                                                                          | App implementations and focused tests pass; lead final evidence audit pending                                               |
| Immediate choice, reload persistence and automatic mode                                      | Architect and Interviewer language settings                                                                                              | LocaleSelect keyboard workflow; storage/reload/languagechange tests                                                                | App focused tests and Interviewer production offline workflow pass; final integrated runs pending                           |
| Correct root document language and direction                                                 | All app providers, initial Fresco document                                                                                               | First render and live transitions, RTL harness, no hydration warnings                                                              | App provider/boundary tests pass; final browser evidence review pending                                                     |
| Protocol-authored content and stable research identifiers preserved                          | Architect authoring/preview, Interviewer and Fresco interview routes                                                                     | Boundary tests; compare protocol/session data across admin locale changes                                                          | Boundary tests implemented; Interviewer participant layout correction under final visual review                             |
| Architect complete chrome                                                                    | Library/timeline, menus/settings, every editor/form/dialog, validation/resources, preview host, import/export, loading/errors/a11y names | App surface inventory + real representative workflows in all three locales                                                         | 1827-ID independently reviewed snapshot; queued-row-noun correction and final regressions ongoing                           |
| Interviewer complete administration                                                          | Protocol deck, onboarding/security/settings, sessions, imports/exports, install/update/offline/error states                              | App surface inventory + real workflows in all three locales                                                                        | Complete inventory and independent catalog review; latest submitted-error integration pending                               |
| Interviewer installed/offline locale availability                                            | Bundled catalogs and service worker                                                                                                      | Actual production PWA offline navigation and switch/reload in Spanish                                                              | Actual production offline Spanish switch/reload/import passed; final-head rerun pending                                     |
| Fresco complete researcher server/client surfaces                                            | Setup/auth, dashboard/protocols/interviews, exports, settings/security, actions/validation/errors/loading                                | App surface inventory; request formatter/cached-content audit; live all-locale workflows                                           | 839-ID review complete; failure-path corrections verified; generated passkey fallback correction underway                   |
| Fresco user persistence and migration                                                        | Existing Prisma user/auth model, nullable preference, authenticated write, settings UI                                                   | Additive migration and old-user behavior; strict valid tags/null; auth preservation                                                | Additive user/event migrations exercised on populated disposable PostgreSQL; lead schema/auth audit complete                |
| Fresco preference precedence and initialization                                              | Account > device mirror > Accept-Language > default                                                                                      | Server/client agreement, malformed values, automatic semantics, serializable initialization                                        | Server/browser matrix and lead resolution/provider audit pass; final corrected build pending                                |
| Fresco stale writes, caching and cross-user isolation                                        | Request formatter, auth transitions, preference mutations                                                                                | Two users/requests, race/reload tests; no shared mutable intl; no stale mirror override                                            | Two-user/eight-request and null mirror tests passed; lead cache/account-transition audit complete                           |
| Shared compilation supports Vite and Next source/npm dist                                    | app-i18n compiler and host builds                                                                                                        | Actual production builds, compiled ICU/Spanish behavior, parser exclusion if required                                              | Actual library/Vite/Next builds and packed runtime execution pass, including react-server and byte-exact migration Markdown |
| Catalog freshness and untranslated-copy safeguards                                           | All extraction scripts and guards, literal inventories                                                                                   | Fresh extraction, deliberately broken missing/blank/token/duplicate/literal guards fail then pass                                  | Shared guards pass; app extraction and deliberate mutation guards implemented                                               |
| Accessibility, expansion and directionality                                                  | LocaleSelect and all changed layouts                                                                                                     | Keyboard/screen-reader names, required/disabled/errors, long Spanish and RTL, inspected visuals                                    | Live fixes for narrow settings, error liveness and pagination naming; final app audit pending                               |
| Verification per PR                                                                          | Root/package scripts inspected before running                                                                                            | Formatting, lint, typecheck, Knip, relevant unit/Storybook/E2E, actual builds; no weakened assertions                              | Shared round 2: 25 workspace types, 2063 UI units, 1318 UI stories, 290 native cases, lint/format/Knip pass                 |
| Meaningful regression tests                                                                  | Changed behavior                                                                                                                         | Deliberate production mutation produces expected failure, restore produces pass                                                    | Locale freezing, refusal erasure, plural wording and HTTP ordering mutations fail as intended                               |
| Visual baselines                                                                             | All affected suites                                                                                                                      | Pinned workflow generation, image review and required approval, only explained changes                                             | Shared Docker: Interview165+6skips, Interviewer5, Architect2 pass with no PNG changes; app runs pending                     |
| Spanish independent review                                                                   | All common/shared/app entries                                                                                                            | Separate reviewer provenance, findings and corrections; distinguish AI review from human translation review                        | All shared405, Interviewer444, Fresco839 and Architect1827 reviewed; final corrections and picker/passkey deltas tracked    |
| Correct release lanes and complete PR docs                                                   | Prerequisite and each issue                                                                                                              | Changeset policy, clear issue links/scope/dependencies/evidence                                                                    | Shared PR #1702 open with correct lanes; separate app PR preparation in progress                                            |
| Codex PR review loop                                                                         | Every latest PR head                                                                                                                     | Explicit request, completed head-attributable clean verdict, submissions/inline/top-level audit; replies/resolved outdated threads | PR #1702 completed clean Codex review on 9f84828869; corrective head requires a new explicit round; app rounds pending      |
| Final integration and clean delivery                                                         | Combined shared/apps tree and separate branches                                                                                          | Current head checks, lead diff audit, no uncommitted changes, URLs/SHAs/merge order                                                | Shared main merge complete; latest checkpoint and final app integration pending                                             |

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

## Shared checkpoint 5: custom schemas and nested shared labels

Fresco's real SignInForm regression exposed a second route that erased submitted
field errors: a translated custom validation hint/schema changed the registered
validator's identity and caused field teardown. The registered validator now
reads its last committed configuration through a stable callback. Changing copy
preserves field registration, while the next validation uses the current custom
schema and language. The regression failed on the disappearing Spanish refusal
before the fix and now verifies its preservation, focus/value/error association,
and a subsequent client-schema rejection in Spanish without another submission.
Existing in-flight locale validation tests also pass.

Explicit `{ messageError: encodedMessage }` values, including list items, let a
whole error sentence reference separately owned shared labels. Raw strings are
never recursively interpreted, preserving researcher data even when it resembles
the transport prefix. A nested-label regression failed before support and passes
with English/Spanish labels, conjunctions and unchanged literal data.

App-i18n now passes 90 tests; Fresco UI passes all 2062 unit tests. Both packages
typecheck and build. Full Storybook passes 1318 tests. An earlier full browser
run had one EverythingBar combobox focus failure; its unchanged story passed all
30 focused cases and the complete rerun passed without any assertion or timeout
change. Scoped type-aware lint passes. Evidence:
`/private/tmp/nc-localized-schema-registration-red.log`,
`/private/tmp/nc-localized-schema-registration-green.log`,
`/private/tmp/nc-nested-message-errors-red.log`,
`/private/tmp/nc-live-validation-all-tests.log`,
`/private/tmp/nc-live-validation-types.log`,
`/private/tmp/nc-live-validation-builds.log`,
`/private/tmp/nc-shared-everythingbar-repro.log`, and
`/private/tmp/nc-shared-final-storybook-2.log`.

All 698 entries in Architect's final frozen translation delta have now received
independent AI review: the lead covered 0–119 and 450–697, and the Interviewer
agent covered 120–449. Findings on verb form, consistent bin/bucket and pedigree
terminology, singular counts, and remaining sentence assembly are assigned to
the owner; corrected/new deltas will be rechecked. The lead independently
accepted Interviewer's final eight changed pairs and 35 description improvements.

An automatic approval reviewer rejected Interviewer's local shared-branch
fast-forward as covered by the user's prohibition on merging. The lead has
asked for explicit permission for local prerequisite integrations; that operation
remains pending. Architect and Fresco's local integrations were accepted. All
unaffected work continues, including translation of the four shared migration
approval-note documents, which are in-scope researcher guidance.

## Shared checkpoint 6: migration guidance and packed runtime

Migration approval guidance is now exposed through the optional validation
message entry as `formatMigrationNotes(version, notes, intl)`. All 50 complete
bullets across schema versions 5–8 have Spanish translations, authored by the
Interviewer AI agent and independently reviewed against every English bullet by
the lead. Code identifiers and actual English defaults written into protocol
data remain literal. The `geojson` asset is described as GeoJSON geometry, in
agreement with the asset schema. This remains AI translation review, not human
translator certification. Shared catalogs now contain 405 Spanish entries,
including 93 in protocol-validation.

The initial whole-document design passed source tests but failed execution from
the packed Vite build: FormatJS normalized its whitespace and flattened the
Markdown list. Each descriptor now owns one complete bullet; structural list
separators preserve the exact original English document. Source regressions
cover every current note-bearing version, Spanish bullet counts, literal code
and generated-data defaults, and unknown-version fallback. A mutation returning
raw notes failed five Spanish assertions before restoration. The full validation
suite passes 1547 tests with two existing skips; the actual package build passes.

The packed-runtime probe installs the five changed published package tarballs
into a fresh temporary project, resolving those packages through their actual
dist export maps. External dependencies reuse the installed runtime. It verifies
Vite AST defaults/catalogs, React server rendering of encoded form errors,
Accept-Language parsing, migration notes, Next source/catalog compilation, and
server formatting under Node's `react-server` condition. The restored probe
passes; its original failure is retained as evidence rather than hidden.
Logs: `/private/tmp/nc-shared-packed-runtime.log`,
`/private/tmp/nc-shared-packed-runtime-3.log`,
`/private/tmp/nc-migration-bullets-tests.log`, and
`/private/tmp/nc-migration-bullets-build.log`.

The date-resolution workflow also established that `disjointBounds` repair
guidance must include input controls alongside ranges and comparisons. The
updated whole English/Spanish sentence has received independent AI review.
Latest shared verification passes all 25 workspace typecheck tasks, workspace
lint/format, and full Knip. Evidence: `/private/tmp/nc-shared-pr-types.log`,
`/private/tmp/nc-shared-pr-lint.log`, and `/private/tmp/nc-shared-pr-knip.log`.
Fresh `origin/main` remains `2928a402e`; no further integration is needed.

The final visual classifier still conservatively selects all three suites.
Checkpoint 4's canonical runs cover the shared build, dependency and rendering
changes, with no PNG changes. Subsequent edits preserve their captured English
output: a page-size accessible name, submitted-error/language-change lifecycle,
and optional migration guidance whose compiled English is byte-for-byte equal
to the original. No baseline adoption or unexplained pixel changes are claimed.
Current-head CI will verify the complete prerequisite branch again.

The lead reviewed all 97 new/changed pairs in Architect's 1799-entry catalog
delta; six grammar, count and bin/prompt meaning corrections are assigned to
its owner. Interviewer's common-message consolidation and Fresco's final TOTP
fallback have independent review. Fresco's real URL workflow found direct React
nodes were being passed to the shared toast-promise string-or-options API;
its three callers now use description objects, and the other app owners are
auditing the same seam. Root review of the two changed Interviewer settings
baseline composites found the requested language-navigation additions explained;
final-head canonical stability and the remaining phone capture are still due.

Next actions: commit and open the shared prerequisite PR, request explicit
current-head Codex review, and track CI while app owners finish their real
workflows and final source audits. Architect must consume the migration presenter
and complete its full regression suite. Fresco must finish its rebuilt real CSV
and URL workflows and send final evidence for lead review. Interviewer's local
prerequisite integration remains pending the explicit permission already
requested after automatic approval review rejected it; unrelated verification
and test help continue. No app PR or clean external review has been claimed.

## Shared checkpoint 7: external review and CI corrective round

The shared prerequisite is [PR #1702](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1702),
base `main`, reviewed head `9f84828869fcb3f3e85ff68fb27181a046b98f02`.
An explicit `@codex review` request completed cleanly on that head: the Codex
code and security runs completed, the clean verdict names `9f84828869`, and
inspection found zero inline review threads. This is a completed external
round, not an acknowledgement reaction. The following corrective changes require
another review on their eventual head.

CI run `33983175887` passed unit tests, quality support, lint, all three
canonical pixel jobs, Architect and Interviewer native E2E, and the preview
checks. No production jobs ran. Two failures were investigated from their
actual logs:

- Interview's cold Storybook optimizer discovered `react-intl/server` only
  after tests began, reloaded Vite, and aborted all 60 story files before
  running assertions. A local cold run reproduced the same failure. The
  existing full-owner-chain dependency includes in Interview, Architect, and
  Interviewer now also include that server entry. Fresh-cache full suites
  pass: Interview 244 tests (one configured file skip), Architect 15, and
  Interviewer 97. Logs: `nc-shared-interview-storybook-cold-red.log`,
  `nc-shared-interview-storybook-cold-green.log`,
  `nc-shared-architect-storybook-cold-green.log`, and
  `nc-shared-interviewer-storybook-cold-green.log` under `/private/tmp`.
- Interview's anonymisation maximum-length scenario still expected the old
  exclusive phrase "fewer than 20". The existing validator and its boundary
  unit test accept exactly 20; the localized message correctly says "at most
  20". The functional assertion now checks that guidance and the successful
  submission uses exactly 20 characters. No snapshot or failure assertion was
  removed. The complete rebuilt native matrix passes all 290 cases. The first
  boundary fixture accidentally contained 21 characters; constructing exactly
  20 fixes that fixture. A separate production mutation changes the maximum
  comparison from > to >= while leaving the displayed limit intact: the new
  boundary case fails at the success assertion, then passes after restoration
  and rebuilding. Logs: `nc-shared-round2-interview-native-2.log`,
  `nc-shared-boundary-mutation-red.log`, and
  `nc-shared-boundary-restored-green.log` under `/private/tmp`.

The independent shared audit also reproduced an existing-error locale race
across whole-form asynchronous validation. The field effect acknowledged the
new locale while the store refused field validation because the form owned the
snapshot; the old English result then remained visible. It now waits for
whole-form validation to settle before acknowledging and revalidating. The real
Form/Field regression is red with that guard removed and green restored, while
preserving the input value, invalid state, and refused submission. All six
field/form locale regressions pass, and the full UI unit suite passes 2,063
checks. Evidence: `/private/tmp/nc-shared-whole-form-final-red.log`,
`/private/tmp/nc-shared-whole-form-final-green.log`, and
`/private/tmp/nc-shared-round2-fui-unit.log`.

A repeated full-suite EverythingBar story failure was a separate assertion
race: the dialog is mounted before Base UI's microtask transfers initial focus.
Its semantics assertion now waits for actual focus, as its close-focus assertion
already did. Setting the real popup's `initialFocus` to false makes the assertion
fail in both browsers; restored code passes the full cold UI Storybook suite:
1,318 tests across 176 files. No production focus behavior or timeout changed.
Logs: `/private/tmp/nc-shared-everythingbar-focus-red.log` and
`/private/tmp/nc-shared-round2-fui-storybook-cold-2.log`.

The README's parser-free import now names `no-parser.js`, the actual installed
export (the extensionless documented path raises `ERR_PACKAGE_PATH_NOT_EXPORTED`).
Production compiler configuration already used the correct path. All 25
workspace typecheck tasks and the actual UI library build pass on these
corrections. Final workspace lint/format, full Knip, changeset lanes, and
`git diff --check` pass. Evidence: `/private/tmp/nc-shared-round2-lint.log`,
`/private/tmp/nc-shared-round2-knip.log`, and
`/private/tmp/nc-shared-round2-workspace-types.log`. Refreshed `origin/main`
remains `2928a402ecf8d0c328b1f20e82a267a2501ae8a0`.

The lead reviewed all twelve final Architect pairs at the 1,803-ID checkpoint.
The expanded census then found string-valued object properties the original
scan skipped; the owner is converting row nouns, required/duplicate errors,
resource metadata, library statistics, and demo subtitles. All app literal
rules now guard custom label/placeholder/title/itemLabel props, with deliberate
literal mutations proving the rules fail. The lead independently accepted
Interviewer's 444th translation and unreadable-file retry correction. Fresco's
operational import errors and synthetic constraint/refusal details were corrected
after lead review, with original-code red tests and independent review of all ten
new Spanish entries. A further independent Fresco census identified generated
English passkey fallbacks; the owner will use existing device metadata to render
new unknown-device labels reactively while preserving existing names as data.
The independent reviewer accepted all 32 final Architect pairs at 1,827 IDs;
a live queued-row-noun capture and adjacent Spanish removal grammar correction
are assigned to its owner. Fresco's independent census inspected 270 production
modules and 516 literal/property candidates, finding only the passkey fallback
flow. Its two proposed generic labels also passed independent AI review.
Interviewer's native export file-picker description is being localized with
its synchronous user-gesture contract preserved.

Local app integration remains pending the user's answer to the permission
question raised after automatic approval review rejected Interviewer's local
fast-forward. No alternate integration mechanism has been used. Unaffected
source audits, app-only corrections, tests, and PR preparation continue. Final
app builds, combined integration, and latest-head external reviews remain
required; no app is declared ready to merge.
