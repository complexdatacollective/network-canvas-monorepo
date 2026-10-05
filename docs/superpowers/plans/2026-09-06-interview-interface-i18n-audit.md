# Interview interface localization audit

Status: production implementation, canonical image review and integrated CI
complete at `3c0fd5014`; a bounded test-efficiency follow-up and final merge-queue
checks remain in progress. This extends the
[app localization execution plan](2026-09-05-app-i18n-adoption.md) following the
user's September 6 clarification.

## Package boundary

`Shell.requestedLocale` accepts a string, an ordered list, or null. The package
uses its own `en`/`en-GB`/`es` registry and best-fit negotiation; unsupported and
malformed requests fall back to English. It owns static common, Fresco UI and
interview catalogs, and reads no storage or browser preference. The host owns
those decisions and any persistence through `onLocaleChange`.

The menu's temporary selection is separate from the host request. An echo of a
selection from a persisting host acknowledges that selection; a different
request takes over. Automatic clears the menu selection. Hosts can mirror their
saved selection with optional `localePreference` (string = explicit override,
null = follow the request, undefined = local menu state), paired with
`onLocaleChange`. This keeps Automatic directly selectable after restoring an
explicit preference on reload. A malformed or unsupported controlled preference
falls through to the host's requested list before the English default; the same
shared negotiation runs once over the complete chain. Neither transition
keys or remounts the interview. `InterviewI18nProvider` exposes the same boundary
for inline `ProtocolField` previews. Shell sets its own region's `lang`/`dir`,
and its portal container remains inside that region. The host document is
unchanged. Body-mounted drag announcements now carry their own language.

## Source census and message ownership

The audit combined a TypeScript AST string/JSX inventory, explicit property and
helper searches, source diffs, and an enabled FormatJS untranslated-JSX guard.
The guard includes labels, placeholders, titles, accessible descriptions and
image alternatives; stories, test fixtures and diagnostic glyphs have narrow
documented exclusions. Generated `src/locales/en.json` is the reviewable message
inventory, with explicit IDs and translator context. Its freshness and Spanish
ICU argument/rich-tag parity are tested against source extraction.

| Source owner                    | Messages | Covered surfaces                                                                                                                                                                                                          |
| ------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell/navigation/shared runtime |       64 | Settings and locale selection, text scaling, previous/next/exit, stage list, media/offline/error recovery, decryption, trays and drag controls, queued node limits, submission errors, notifications and roster fallbacks |
| Other interfaces                |      113 | Anonymisation, categorical/ordinal bins, dyad and tie-strength controls, ego/slides forms, finish, map search and native controls, name generators/roster, narrative controls, network composer and sociogram             |
| Family Pedigree                 |      234 | Framing, initial and relative wizards, biological-sex choices, person entry, partnership questions, checklist, validation, context menu, edit/delete/reset/finalize, generated relationship labels and announcements      |
| Narrative Pedigree              |       35 | Condition selection, inherited-status labels, legends, focal-person controls, zoom, snapshot headings and recovery messages                                                                                               |
| Total                           |      446 | Complete Spanish; 10 sparse British English overrides                                                                                                                                                                     |

Universal actions reuse `common.*` where applicable. Shared field, dialog, menu,
validation and accessibility copy comes from `frescoUi.*`. Numeric counts use
ICU formatting and plurals. Lists of literal names use `intl.formatList`, so
Spanish uses the appropriate conjunction, including “Ana e Irene”. Three
dynamic person-name questions use ICU rich tags, and person radio labels use
React nodes. Existing protocol string labels still use Markdown.

### Intentional literal/data boundaries

- Protocol titles, labels, prompts, introductions, options, assets and condition
  names are authored content. The locale feature never rewrites them or the
  protocol hash, node/edge IDs, variable IDs, stored selections or answers.
- `computeRelationshipsToEgo` continues writing canonical English research
  values. Translated display labels are computed separately. Existing
  `metadata.nodes[].label` output remains stable; live displays derive labels
  from graph identity and the current formatter.
- Sex choices retain their exact values and order, including unknown and
  declined answers. Biological/gamete terminology changes display text only.
  Narrative Pedigree's existing fixed gamete framing remains unchanged.
- Study-defined sorting, stable identity ordering and color/layout hashes do
  not acquire a locale-dependent research-data meaning. Displayed built-in
  numbers and generated labels use the current formatter.
- The appended `FinishSession` sentinel's internal label remains an English
  structural value. Stage navigation reads authored stages only; the actual
  finish screen and dialog use localized descriptors.
- Developer invariants, console messages, diagnostic clipboard payloads,
  transport enums and seeded/Storybook research fixtures remain literal.
  Participant error headings and recovery instructions are localized.
- Percent, required, question-mark and passphrase status glyphs are symbols,
  with narrow lint exemptions. Their accessible explanation is localized.

## Independent translation review

This was an independent **AI** review, not a human or clinical translation
certification. A separate app owner reviewed all 64 original runtime pairs and
both British overrides. The lead reviewed all 113 other-interface pairs and
both British overrides, all 269 pedigree pairs and 5 British overrides, and
the subsequent six-message pedigree delta.

Corrections preserved the offline-map reconnection requirement without
promising automatic recovery; aligned passphrase, tray and navigation terms;
removed participant-facing technical jargon from accessible names; retained
current/former partnership meaning; and used locale-aware name lists. Rich-tag
changes preserve complete questions and literal names. The obsolete runtime
pair descriptor was removed, leaving 63 runtime messages. The later finish-rejection
message adds one independently reviewed runtime pair plus its British spelling
override, for 64 runtime messages in the final catalog. The second reviewer
checked the corrected runtime delta. Catalog guards independently check token
parity, missing/blank entries, sparse overrides and extraction freshness.

## Focused evidence and remaining gates

- Shell tests exercise independent host/package registries, regional and
  malformed requests, menu/host changes, host acknowledgment and Automatic,
  unchanged store/input identity, queued exit guidance and simultaneous Shells.
  Deliberately ignoring requests, remounting by locale, and changing the host
  document each failed positive assertions; restored controls passed.
- Other-interface focused proof passed 57 tests in 10 suites, including matrix
  contracts. Four deliberate mutations failed five localization assertions.
- Pedigree focused proof passed 29 tests. Three in-memory mutations failed
  expected English-freeze and literal-name assertions; restored controls
  passed. A superseded source-mutation attempt is excluded from evidence.
- Real form-error rendering preserves a submitted error and answer while its
  language changes, then allows a successful retry. Literal pair-name tests
  cover the Spanish conjunction and unchanged input data.
- Shared embedded-control tests cover body live-region language, identity and
  cleanup, and deferred one-time autofocus. Interviewer phone verification
  independently exercised all setup/confirmation/unlock digits, real PIN
  enrollment, wrong-PIN refusal, language changes and corrected retry.
- The restored aggregate run passed 1,697 tests across 199 files, with two
  existing todos, before the final controlled-preference, notification and
  finish-rejection additions. All 12 current Shell locale tests and 15 resolver
  tests pass. Unsupported controlled preferences originally failed two explicit
  host-fallback assertions; the corrected single-chain negotiation passes them.
  Interview and Fresco UI typechecks, root Knip, scoped lint, extraction guards
  and the production host build pass at their recorded checkpoints.
- Notifications now use one manager per Shell. Actual Shell tests cover two
  languages, independent focus/close behavior, unchanged answers on language
  changes, and a persistent notification's blur dismissal. Twenty-one focused
  tests pass across the notification, locale, flush and render-gating suites.
  In-memory mutations that share the manager, write on locale changes or close
  through the global manager each fail the corresponding behavior assertion.
- NameGenerator resolves its node-bin portal through its existing element's
  ancestors instead of a document-wide stage lookup. Actual two-Shell keyboard
  tests verify one bin per language region, retained portal identity across a
  language change, and deletion only from the owning store even when both stores
  contain the same node ID. Twenty-four final focused tests pass; restoring the
  document-wide lookup in memory fails the second Shell's own-bin assertion.
- Finish rejection keeps the existing flush/finish transport order and renders
  actionable package-owned guidance. Three real-provider tests cover flush
  failure, host failure, live language changes in the same open dialog, retry
  and cancellation. The two failure cases fail against the old implementation;
  cancellation remains a passing control. Raw diagnostic text is not displayed.
- Fresco UI's affected field unit tests pass 408 cases across 31 suites, and
  real browser field/radio/PIN stories pass 66 cases across six browser files.
- The compiled production host passes the new locale workflow in Chromium,
  Firefox and WebKit. It checks a real required-field error through a host
  language change, an offline menu change, retained input identity, unchanged
  protocol/network data, successful answer storage, and independent document
  language. Full browser matrix, canonical Linux pixels, dependent app
  integration and current-head CI/review remain the final gates.

## Main integration history

The user requested that the already reviewed prerequisite #1702 land as soon as
its main conflict is resolved. This newer runtime implementation is therefore
preserved on `feat/interview-interface-i18n` for a separate follow-up PR. The
three app PRs will consume that follow-up after the prerequisite lands. Merge
authorization covers these PRs once their verification and review gates pass.

The runtime source checkpoint is `3ffccd752d119f9b63103d07f5284a6ddc8d605a`,
including the resolved prerequisite merge `389869b72275815405de64cfd59a3bab850fbfd2`.
The prerequisite's isolated conflict verification passes 14 field/localization
tests plus Fresco UI types. Its new Codex review explicitly names that head and
reports no findings; all review threads are resolved.

Refreshed main is `eae76922d4cd340b0ebb8765c288fd6e91462b53`. Its validator
closure correction overlaps this branch's committed-configuration validator;
retain both behaviors and run their regressions after a normal local merge.
The newly updated shipping skill requires canonical PNG generation in GitHub
Actions, including for Apple Silicon hosts. No local PNG baseline was generated.

The pre-main production matrix passed 290 cases during accessibility snapshot
regeneration and the remaining three cases passed after their obsolete unnamed
focal-person exceptions were removed. The focal person is now explicitly named
“You”; the captured date inputs and field groups also retain accessible names.
This is preparation evidence, not the final post-integration browser verdict.
Final no-write verification will use the normal committed Playwright settings.

An independent AI accessibility-tree review checked all 578 initially changed
files, grouped into 57 semantic changes. Six serialization-only changes were
restored, leaving 572 reviewed baseline updates. No common accessible node was
reordered, no authored value was lost, and no unnamed control was added. The
corpus guard passes 36 tests, including three checks that remove only the newly
named focal-person button's name in memory and require the public audit to fail.

Post-main verification now passes all 293 native browser scenarios using normal
committed settings without updating snapshots. All 1,710 unit tests across 201
files pass, with two existing todos. Interview types, root Knip, the production
host build and the library/declaration build also pass. The first complete
Storybook run passed 243 cases and exposed one stale initial-focus assertion:
the new language chooser correctly precedes text size. The corrected test
requires initial focus on Language, then Tab to the number field before proving
keyboard scaling; all seven Navigation stories pass. No production behavior was
changed to satisfy that assertion. Canonical PNGs, app integration gates and the
runtime follow-up's current-head CI/review remain outstanding.

## Current runtime delivery checkpoint

Prerequisite [#1702](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1702)
merged at `39f59598be90c8413a49710364db477c7a3c2711` after its resolved head
received a clean explicit Codex review, green required CI and green merge-group
checks. Both the reviewed head and merge commit are ancestors of freshly fetched
main. Runtime [#1719](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1719)
is ready for review on main at source checkpoint
`5128f4942c67dee5e8690fd43852887b23a24593`. The app PRs temporarily target the
runtime branch to keep their reviews focused; they must target main after this
prerequisite lands and pass fresh automatic CI.

The complete cold Interview Storybook run passes 244 cases. First PR CI also
passed units, lint, quality support, all 293 native runtime cases and the
Architect and Interviewer pixel jobs. Two consumer test failures were diagnosed:

- Interviewer's Storybook optimizer discovered `intl-localematcher` only when
  opening a lazy Shell path, reloaded the browser and invalidated imports. Its
  eager dependency list now includes that same transitive entry already used
  by the Interviewer app PR. A cold rerun then exposed a separate carousel
  readiness race: pagination renders before ResizeObserver mounts the actual
  import card. Keyboard activation now waits for that real card. The final
  cold Interviewer run passes all 97 existing cases across 36 files without
  an optimizer reload. No production behavior or assertions were weakened.
- Interviewer's native sociogram test still requested the old application
  name, “Sociogram Canvas.” Its three exact name references now use the
  reviewed built-in “Placement area” name. A fresh production host and the
  original keyboard-placement scenario pass without changing any expected
  stored data or navigation behavior.

The first runtime pixel job uses the pre-adoption images; its result is not the
final pixel gate. Canonical captures were generated solely by the dedicated
GitHub workflow on the pushed source, then reviewed before adoption. Normal CI
on the next committed head must verify the adopted images without updates.

### Canonical image review

Independent CI captures [34053232920](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34053232920)
and [34053362247](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34053362247)
both succeeded on the same `5128f49` source. Of 438 PNGs, 384 intentionally
change and 54 stay byte-identical to their committed baseline. There are no
missing images or dimension changes. The first run supplies all adopted bytes.

All 384 before/after images were reviewed through 105 exact changed-region
groups: 134 Chromium images (38 groups), 125 Firefox images (33 groups) and
125 WebKit images (34 groups). The lead reviewed Firefox; separate app owners
reviewed Chromium and WebKit, with the lead additionally inspecting the unstable
Chromium crops. Per-image SHA-256 checks and independent RGBA scans establish
that each member has the reviewed change signature and every pixel outside its
reported bounds is unchanged. The new Settings button, corresponding navigation
space and whole-message unplaced-count label account for the changes. Shallow
roster views retain all names and values while the new navigation minimum gives
the card body slightly more visible space. No missing assets, loading states,
font fallback or authored-data changes were found. Geospatial captures also
include the intended shared navigation change and were byte-stable between runs.

433 of 438 captures are byte-identical across the independent runs. Five small
repeat variants remain: one Chromium circle edge, two Chromium roster
text/scrollbar edges, one WebKit convex-hull edge and one WebKit pedigree legend.
Each pair passes the real Playwright buffer image matcher with the repository's
unchanged color threshold and `maxDiffPixels: 250`, with snapshot writes disabled.
All three Chromium pairs even have zero pixels above the normal color threshold.
The reviewed variants preserve text, values, order and topology; no threshold or
assertion was relaxed. These captures were adopted only after this review, and
the next normal PR CI run must verify the committed baseline set.

### Current-head accessibility review correction

Codex's first runtime review found that a successful person-edit event remained
in state. Changing `intl` could announce that old save again. The submission is
now consumed after announcing; saving the same person again still creates a new
event. The sibling audit found the build-stage add/remove/completion message
was also retained indefinitely and retranslated through `AppMessage`. It now
uses the existing finite accessibility live-region hook; existing count and
checklist transition refs ensure that only a new action emits another message.
Current visible condition, focus and checklist summaries remain reactive.

Both new tests first failed against the old implementation for the reported
mechanism. The edit test uses the real dialog, fields, store and locale/live-region
providers; the build test uses the real stage/store/provider and event detection,
with child controls and host selectors replaced to drive the count/checklist
transitions. The restored run passes 15 tests across three files, covering
English, Spanish and British English, repeated identical saves, later add/remove
actions, repeated completion and preservation of literal authored values.

The real production browser check exposed exactly three final Chromium ARIA
expectations that pinned the obsolete persistent “Family member added” text
inside main. Only those three text lines were removed after explicit diff
review. The finite body live region remains tested through the real hook; no
control, heading, role or accessible name was removed from a snapshot. The
existing 36-case accessible-name corpus guard also passes without modification.

After adopting those exact ARIA changes, all 17 affected FamilyPedigree native
scenarios pass across Chromium, Firefox and WebKit against a fresh production
host, using the normal assertions with snapshot writes disabled. The root
configured Knip check passes; Interviewer consumer typecheck and scoped lint
also pass. Production source and canonical PNG hashes stayed fixed throughout
this focused verification.

The final full Interview package typecheck passes all three TypeScript programs.
The new regression fixture initially needed the existing branded attribute
reference helper and a string guard for its literal label; that test-only
correction passes the full typecheck and the restored 15-case regression run.
Scoped type-aware lint and formatting pass, with existing repository warnings
and the deliberate event-consumption effect's additional-render warning retained.

### Completed production CI and test-efficiency follow-up

[CI run 34055801970](https://github.com/complexdatacollective/network-canvas-monorepo/actions/runs/34055801970)
passed all required checks on `3c0fd5014da5e01af9ce46369afb78492b917f2c`,
including all six Architect/Interview/Interviewer native and pixel jobs,
Storybook, workspace units, lint and quality support. The explicit
[Codex verdict](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1719#issuecomment-5561738773)
is clean on that exact head, with zero unresolved threads.

A slower independent Fresco dispatch exposed one 20-second timeout in the new
two-Shell isolation test; all 1,709 other runtime tests and all 672 Fresco tests
passed. The same first test passed in 14.793 seconds in one earlier dispatch and
8.915 seconds in the latest Interviewer dispatch; the respective whole runtime
suites took 913, 686 and 455 seconds. This supports load-sensitive test timing,
not an observed production failure. The current runtime CI passed independently.

The bounded follow-up changes only two long input sequences in that test to
real focused clipboard input, with Enter still separately submitting the real
form. Every assertion, mock and timeout is unchanged, including both store
identity/ownership checks, unchanged draft/data checks, and positive exact-value
write/sync control. Three paired local probes consistently measured one input
event instead of sixteen per sequence; median input-phase times fell from
76.5 to 18.4 ms and 96.3 to 70.5 ms. The initial uninstrumented whole-test pair
was 512 versus 511 ms, so these measurements establish less input work without
claiming an overall timing guarantee. All four uninstrumented tests pass;
deliberate shared-manager and locale-write mutations each still fail the
intended assertion while the three other tests remain passing controls. Full
package types and scoped lint/format pass. No production source, catalog,
canonical image, timeout or substantive assertion changes in this follow-up.
