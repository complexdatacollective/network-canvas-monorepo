# Interview interface localization audit

Status: source conversion, simultaneous-Shell corrections and focused
verification complete; prerequisite integration, final browser/visual checks and
current-head review gates remain in progress. This extends the
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

## Main integration and final delivery checkpoint

The user requested that the already reviewed prerequisite #1702 land as soon as
its main conflict is resolved. This newer runtime implementation is therefore
preserved on `feat/interview-interface-i18n` for a separate follow-up PR. The
three app PRs will consume that follow-up after the prerequisite lands. Merge
authorization covers these PRs once their verification and review gates pass.

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
