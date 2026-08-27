# Protocol Localization Implementation Plan

## Overview

Implement protocol-authored localization as schema version 9, using
`@formatjs/intl-localematcher` for deterministic best-fit locale matching.
The implementation adds a strict-but-incomplete `LocalizedString` contract,
separate warning analysis, universal locale utilities, React resolution
context, Architect authoring and coverage UX, Vite and Next.js host adapters,
session persistence, and exported interview locale metadata.

The design authority is
`docs/superpowers/specs/2026-08-27-protocol-localization-design.md`. The schema
8 corrections and migration invariants in
`docs/superpowers/specs/2026-08-25-schema-8-corrections-design.md` remain in
force. The accepted Dynamic Rosters design and epic (#1449, #1457) own schema
9; localization extends the tree and v8-to-v9 migration created by schema
issue #1451 before that shared version is published.

This is a coordinated cross-workspace change. Keep it on one feature branch
and make milestone-sized commits, but do not publish or release a state in
which `CURRENT_SCHEMA_VERSION` is 9 while a modern host still assumes
schema-8 strings. The shared schema-9 activation is deliberately late.

## Planning context

### Decisions

| Decision                                      | Reason                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema 9 is the shared pending version        | Participant-facing fields change from strings to locale-keyed objects; all incomplete schema work, including Dynamic Rosters and localization, lands in the same unreleased version. |
| Keep helpers in `@codaco/protocol-validation` | The functions operate on protocol-owned types; every modern host already depends on the package; this avoids a new public package and dependency cycle.                              |
| Keep React integration in `@codaco/interview` | Protocol-validation remains framework-free and works in Node, Vite, Next server code, workers, and the CLI.                                                                          |
| Use FormatJS `best fit` explicitly            | It implements the ECMA-402 locale matching behavior the browser does not expose as a public arbitrary-resource matcher.                                                              |
| Persist one selected locale                   | It makes resume deterministic and avoids retaining the user's full browser/header preference list.                                                                                   |
| Missing translations are warnings             | Partially translated protocols remain valid and runnable; extra locale keys, empty maps, and violations of the owning field's existing content constraint remain errors.             |
| Fallback follows declared locale order        | Object key insertion order is not an authoring contract; `localization.locales` becomes the explicit final fallback priority.                                                        |
| Migrate unknown-language text to `und`        | Automatic migration cannot truthfully infer that arbitrary schema-8 content is English.                                                                                              |
| Add codebook `label` beside `name`            | Participant copy becomes localizable without making export column/type names locale-dependent.                                                                                       |
| Store locale in session and export metadata   | The language used is part of the conditions under which interview data was collected.                                                                                                |
| Do not deep-resolve the whole protocol        | That would erase the source locale of fallback text and prevent accurate DOM `lang`/`dir`.                                                                                           |

### Constraints

- No `any`, no type assertions used to bypass the schema transition, and no
  new barrel files.
- Relative imports added under protocol-validation use explicit `.ts`
  extensions because Node loads that source through Architect's Vite config
  chain.
- Modern apps consume workspace package source directly; final activation
  must typecheck the entire affected closure.
- Protocol migrations do not add/remove/reorder stages or change collected
  answer-value shapes.
- Localization extends the complete Dynamic Rosters schema-9 tree and the
  single registered v8-to-v9 migration in place while both are unreleased. It
  preserves the `dynamicnetwork` asset contract and never creates a second
  schema-9 tree, a second migration edge, or a schema-10 follow-up.
- Classic apps keep their external legacy protocol-validation dependencies.
- Locale-derived display labels and direction never become protocol data or
  protocol hash inputs.
- Browser and request APIs remain at host boundaries.

### Delivery shape

Prefer one coordinated implementation pull request because switching
`CurrentProtocol` to the combined schema 9 changes public field types across
Architect, Interview, builders, hosts, Studio's protocol store, and tests.
The implementation may stack on #1451 or rebase after its schema-9 base lands,
but no schema-9 package/app release may occur until all pending schema-9 work
is complete. Fresco may use a staged hosted rollout, but
the activation image itself must safely handle installations that skip an
intermediate release; it never rewrites stored protocols before the new
server starts. If review size requires other stacked pull requests, only the
framework-free matcher utilities may land before schema 9; do not export or
activate schema 9 until the consumer stack is ready.

## Milestone 0: Establish the implementation baseline

**Files to inspect, not initially edit:**

- `packages/protocol-validation/src/schemas/9/**`
- `packages/protocol-validation/src/schemas/index.ts`
- `packages/protocol-validation/src/migration/**`
- `packages/protocol-validation/src/utils/collectEntityAttributeReferences.ts`
- `packages/interview/src/contract/types.ts`
- `packages/interview/src/Shell.tsx`
- `apps/architect/src/selectors/issues.ts`
- `apps/interviewer/src/lib/db/**`
- `apps/fresco/lib/db/schema.prisma`
- `apps/fresco/scripts/migrate-protocols.ts`
- `apps/studio/server/src/protocol/{sectionize,assemble,validate,migrate}.ts`
- `packages/network-exporters/src/input.ts`

**Work:**

1. Confirm #1451 has landed (or the implementation is explicitly stacked on
   it) and the working schema-9 tree contains the accepted Dynamic Rosters
   contract. If not, continue only the framework-free Milestone 1 work; do not
   create a competing versioned tree or migration.
2. Confirm the feature branch is not `main`, record `git status`, and preserve
   unrelated changes.
3. Run dependency installation only if the workspace is not ready.
4. Run the current focused baseline suites:
   `@codaco/protocol-validation` tests/typecheck, `@codaco/interview`
   tests/typecheck, Architect unit tests/typecheck, Interviewer unit
   tests/typecheck, Fresco unit tests/typecheck, Studio server unit
   tests/typecheck, and network-exporters tests.
5. Inventory every participant render of the fields listed in the design.
   Use schema searches plus TypeScript call sites; do not rely only on a text
   search for `label`.
6. Record the known failing baseline before changing code.

**Acceptance criteria:**

- Workspace state and baseline are documented in the PR description or an
  implementation log.
- Every current plain schema string has been classified as participant-facing,
  researcher-facing, semantic, or machine data.

## Milestone 1: Universal locale primitives and FormatJS matcher

**Files:**

- `pnpm-workspace.yaml`
- `apps/networkcanvas.com/package.json`
- `packages/protocol-validation/package.json`
- `packages/protocol-validation/src/index.ts`
- `packages/protocol-validation/src/localization/localeTag.ts` (new)
- `packages/protocol-validation/src/localization/localePreferences.ts` (new)
- `packages/protocol-validation/src/localization/resolveLocalizedString.ts` (new)
- `packages/protocol-validation/src/localization/localeMetadata.ts` (new)
- `packages/protocol-validation/src/localization/__tests__/localeTag.test.ts` (new)
- `packages/protocol-validation/src/localization/__tests__/localePreferences.test.ts` (new)
- `packages/protocol-validation/src/localization/__tests__/resolveLocalizedString.test.ts` (new)
- `packages/protocol-validation/src/localization/__tests__/localeMetadata.test.ts` (new)

**Work:**

1. Add `@formatjs/intl-localematcher` at the already locked `0.8.9` line to the
   workspace catalog. Change networkcanvas.com's direct range to `catalog:`.
2. Add FormatJS to protocol-validation according to the package's existing
   fully bundled runtime-dependency policy. Confirm the packed bundle contains
   the matcher and its declaration surface does not require consumers to
   resolve FormatJS types.
3. Implement `canonicalizeLocale` with `Intl.getCanonicalLocales`. Return
   `undefined` for malformed input and preserve no unvalidated value.
4. Implement `normalizeLocalePreferences`: canonicalize, remove invalid
   entries, de-duplicate without changing priority, and ignore `*`.
5. Implement `parseAcceptLanguage` for protocol hosts and cover it
   independently. Keep the website edge parser local: importing the complete
   protocol-validation entry solely to share this small parser would couple an
   unrelated routing edge function to the protocol bundle. The two consumers
   still use the same cataloged matcher version and matching algorithm.
6. Implement `selectProtocolLocale` and `resolveLocalizedString` using
   `match(..., { algorithm: 'best fit' })` exactly as specified. Build field
   availability from protocol locale order, not object key order.
7. Implement `getLocaleMetadata` using `Intl.DisplayNames` and feature-detected
   `Intl.Locale` text-info support. Add a deterministic RTL-script fallback
   and a tag fallback for display names.
8. Export named types and functions explicitly from the package root. Do not
   add `src/localization/index.ts`.
9. Add a build/pack smoke test or extend existing package checks so the helpers
   import under Node ESM and bundle under Vite.

**Tests:**

- Canonical tags: `en-US`, `es`, `zh-Hant-TW`, `und`, aliases, invalid
  underscores, private-use tags, duplicates, and casing.
- Preference parsing: q-values, stable ties, q=0, duplicates, whitespace,
  wildcard, empty/malformed header.
- Matcher: exact match, browser/header `es-MX` to `es`, an explicit `es-MX`
  passed alone to declared `es`, and a malformed or unmatched explicit value
  to protocol default without consulting lower-priority preferences; requested
  miss to default, missing default to first declared available, reordered
  fallback, invalid selected locale, and one-locale protocol.
- Metadata: autonym/fallback label, LTR, Arabic/Hebrew RTL, feature-absent
  fallbacks.
- Prove no helper reads browser globals by importing and running it in the
  Node test project.

**Acceptance criteria:**

- One pure matcher produces the same result in Node and browser tests.
- A source import and a packed protocol-validation import both work.
- No application behavior changes yet.

## Milestone 2: Add schema 9 and LocalizedString metadata

**Files:**

- `packages/protocol-validation/src/schemas/9/**` (the shared unreleased tree from #1451)
- `packages/protocol-validation/src/schemas/9/localized-string.ts` (new)
- `packages/protocol-validation/src/utils/collectLocalizedStrings.ts` (new)
- `packages/protocol-validation/src/localization/analyzeProtocolLocalization.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/localized-string.test.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/localization-coverage.test.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/localized-disease-labels.test.ts` (new)
- `packages/protocol-validation/src/schemas/index.ts`
- `packages/protocol-validation/src/index.ts`

**Work:**

1. Extend the complete Dynamic Rosters `schemas/9` tree created by #1451 in
   place. Preserve its version isolation from frozen `schemas/8`, plus
   `dynamicnetwork`, asset/reference refinements, and every other pending
   schema-9 correction. Do not copy it to schema 10 or register a parallel
   schema-9 definition.
2. Define `LocaleTagSchema`, `ProtocolLocalizationSchema`, and a localized
   string schema factory. The base localized schema validates at least one key;
   the factory preserves each owning field's existing content constraint (for
   example, `min(1)` for required prompt text) and attaches a stable Zod
   metadata descriptor.
3. Add the required root `localization` declaration to protocol schema 9.
4. Convert the full participant-facing field inventory from the design: stage
   labels, codebook labels, variable labels/options, prompts, forms, panels,
   Information, Anonymisation, Family Pedigree, Network Composer, Roster,
   Narrative, and Narrative Pedigree. Network Composer includes its
   stage-level Visual Analog Scale `parameters.minLabel` and `maxLabel`
   overrides, not only codebook scalar parameters.
5. Replace the schema-9 Network Composer field's untyped Visual Analog Scale
   parameter path with a component-aware branch that gives `minLabel` and
   `maxLabel` localized, metadata-tagged schemas while retaining compatibility
   for other unknown parameter keys. The current loose record plus runtime
   `typeof` checks is not discoverable by the compiler or metadata walker.
6. Split shared text/asset item shapes where necessary so asset ids remain
   strings while rendered text becomes localized.
7. Keep protocol author metadata, `interviewScript`, and semantic values as
   plain strings. Stage `label` is localized because active Interview render
   paths expose it to participants.
8. Implement a schema-metadata walker modeled on
   `collectEntityAttributeReferences.ts`. It must traverse objects, arrays,
   records, optionals, transforms, discriminated unions, and reused schemas,
   returning exact value paths without executing arbitrary transforms.
9. If extracting a generic Zod metadata-walk seam to avoid duplicating the
   existing collector, invoke the `finishing-a-refactor` skill and enumerate
   both collectors' call sites before adopting it. A focused independent
   collector is preferable if generic extraction would obscure behavior.
10. In the schema-9 root refinement, collect every localized string and reject
    keys not declared by the root localization config. Emit the issue at the
    offending key path.
11. Implement `analyzeProtocolLocalization` over the same collected hits. For
    each missing-locale warning, call the runtime resolver with that warning's
    declared locale as `selectedLocale` and report the resolver's source locale
    as `fallbackLocale`. Keep this structured warning analysis separate from
    `validateProtocol`.
12. Change interface-owned option validation to pin values/order/semantic
    flags while permitting localized labels.
13. Move Narrative Pedigree label uniqueness to the protocol-level schema-9
    refinement. Resolve labels for every declared locale before normalizing
    and comparing them.
14. Extend the `ProtocolSchemaV9` versioned schema union entry and export
    `Protocol<9>`. Keep schema-9 publication gated until the activation
    milestone even if the stacked #1451 branch already sets the current
    source constant to 9.

**Tests:**

- One positive and negative test for every localizable field family.
- Network Composer Visual Analog Scale override endpoints validate and appear
  in coverage independently of codebook scalar endpoint labels; prove the
  collector would fail if they regress to an opaque record path.
- Extra declared-valid-but-protocol-undeclared keys fail at their exact paths.
- Missing default and nondefault translations validate successfully and
  generate warnings whose fallback locale matches runtime resolution for the
  missing declared locale.
- Empty objects, empty values on fields whose existing contract is nonempty,
  invalid tags, and noncanonical tags fail. Fields whose schema-8 contract
  deliberately allowed an empty value retain that behavior.
- Schema-8 protocols remain parsed only by frozen schema 8; localized maps are
  accepted only by the combined schema 9.
- Collector conformance test enumerates expected metadata hits from a complete
  fixture, so a future schema field cannot disappear silently.
- Disease collisions caused by fallback fail for the affected locale; distinct
  resolved labels pass.

**Acceptance criteria:**

- Schema 8 remains behaviorally frozen; schema 9 retains the complete
  `dynamicnetwork` contract while adding localization.
- Schema 9 validates complete and incomplete localized fixtures as designed.
- Warning analysis and blocking validation are separate APIs.

## Milestone 3: Implement v8-to-v9 migration and version plumbing

**Files:**

- `packages/protocol-validation/src/schemas/9/migration.ts` (created by #1451, then extended)
- `packages/protocol-validation/src/schemas/9/__tests__/migration.test.ts`
- `packages/protocol-validation/src/schemas/9/__tests__/migration-fuzz.test.ts`
- `packages/protocol-validation/src/migration/index.ts`
- `packages/protocol-validation/src/migration/migrate-protocol.ts`
- `packages/protocol-validation/src/utils/hashProtocol.ts`
- `packages/protocol-validation/src/utils/__tests__/hashProtocol.test.ts`

**Work:**

1. Extend the one `migrationV8toV9` and `ProtocolTypeMap` entry created by
   #1451. The same transform applies the accepted Dynamic Rosters rules and
   localization; do not register a second v8-to-v9 edge.
2. Implement typed, explicit mapping helpers from each v8 schema family. Do not
   recursively wrap every property named `label`, `title`, or `text`; that
   would localize researcher metadata and machine fields accidentally.
3. Add `{ defaultLocale: 'und', locales: ['und'] }` and wrap known
   participant strings in `{ und: value }`.
4. Add node, edge, and variable localized labels from stable names. Explicitly
   wrap both codebook scalar endpoint labels and Network Composer
   VisualAnalogScale override `parameters.minLabel`/`maxLabel`; do not rely on
   recursive property-name matching inside the loose stage parameter record.
5. Omit an optional localized field if its old optional string is empty and
   the target editor treats that as absence. Wrap an empty value when the field
   is required or its schema-8 contract treats empty as data; do not invent
   replacement text.
6. Preserve stage array length/order, ids, references, option values, codebook
   keys, and all fields that determine collected answer shape. Retain every
   Dynamic Rosters migration rule from #1451, including the `existing`
   sentinel exemption and unresolvable-panel behavior.
7. Add a migration note that the source language could not be inferred and
   should be identified in Architect.
8. Replace current-only post-validation in `migrateProtocol` with a map of
   target validators for schema 7, 8, and 9. Preserve the default return as
   `CurrentProtocol`; add typed overloads/generics only where they remain
   honest for supported target schemas.
9. Change `ProtocolMigrator` caching to include the effective target version
   in its internal identity. Preserve caller-facing `cacheKey` behavior and
   make `clearCache(cacheKey)` clear all target variants for that caller key.
10. Update `hashProtocol` to hash
    `{ localization, codebook, stages }` for schema 9. A
    version-discriminated helper retains `{ codebook, stages }` for schema 8
    and older, so stored legacy rows and migrated current documents each have
    an honest identity.
11. Add structural invariant tests comparing before/after stage ids/order and
    option values. Use the existing migration fuzz approach for copy purity
    and deterministic output.

**Tests:**

- Every field family wraps exactly once.
- Network Composer Visual Analog Scale override endpoints wrap exactly once
  without wrapping other loose parameter strings.
- Researcher-facing and semantic strings remain strings.
- Existing input is not mutated.
- Optional empty content is omitted and required content is preserved.
- Migration warnings include the `und` instruction.
- A schema-8 fixture exercises the Dynamic Rosters and localization migration
  rules in one v8-to-v9 transform. A complete schema-9 Dynamic Rosters fixture
  validates and survives canonical-source localization conversion with every
  `dynamicnetwork` field/reference unchanged.
- Migration to target 9 post-validates the complete schema 9; retain the
  target-8 regression as well.
- The same caller cache key used first for target 8 and then target 9 returns
  the correct distinct schema versions; repeated calls at one target share the
  cached result; clearing the key removes both variants.
- Hash changes for a translation, default locale, or locale order; name,
  description, and derived locale metadata do not affect it.

**Acceptance criteria:**

- Any valid schema-8 protocol migrates deterministically through the single
  registered edge to the complete schema-9 contract.
- Migration invariants have executable tests.
- Intermediate-target migration no longer relies on the current schema.

## Milestone 4: Prepare canonical protocols, fixtures, and builders

**Files:**

- `packages/protocols/**`
- `packages/development-protocol/**`
- `packages/sample-protocol/**`
- `packages/protocol-utilities/src/SyntheticInterview.ts`
- `packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts`
- `packages/protocol-utilities/src/types.ts`
- Architect, Interview, Interviewer, and Fresco test fixtures containing inline protocols
- Documentation protocol downloads under `packages/protocols/documentation/protocols/`
- `packages/protocols/migration-fixtures/documentation-legacy/**` (new immutable copies plus manifest)
- `packages/protocol-validation/src/__tests__/documentation-corpus-migration.test.ts`

**Work:**

1. Before converting downloads, copy every existing documentation `.netcanvas`
   archive byte-for-byte to the dedicated legacy fixture directory. Commit a
   manifest with filename, SHA-256 digest, and source schema version, then
   repoint `documentation-corpus-migration.test.ts` to these copies. The
   conversion script excludes this directory and the test fails on any digest
   drift; never regenerate the legacy corpus from converted output.
2. Build a one-use typed conversion script or use the v8-to-v9 migrator as a
   starting point, then explicitly relabel known English first-party content
   from `und` to `en-US`.
3. Convert canonical protocol sources and active documentation downloads, not
   generated compatibility copies;
   regenerate/synchronize compatibility packages through their existing
   workflow. When a canonical source is already a schema-9 Dynamic Rosters
   fixture, modify only its localized participant copy and declaration; assert
   that request, header, placeholder, sample source/hash, asset reference, and
   validation data are byte-equivalent.
4. Update `SyntheticInterview` so its default protocol localization is
   `en-US`, every generated participant string uses localized helpers, and a
   fluent locale configuration API can add translations for tests.
5. Prefer builder methods such as `localized('text', { es: 'texto' })` or a
   centralized `LocalizedString` factory over repeated casts. Do not hide
   incomplete translation warnings in test builders.
6. Update protocol fixture factories to accept localization overrides while
   keeping terse defaults for unrelated tests.
7. Add one canonical intentionally incomplete multilingual fixture used across
   schema, runtime, host, and E2E tests.
8. Validate that generated compatibility packages and active protocol archives carry
   schema 9 and the correct localization declaration.

**Acceptance criteria:**

- All first-party English protocols declare `en-US`, not `und`.
- Builders can generate complete, incomplete, regional-variant, and RTL
  protocol fixtures without unsafe assertions.
- The protocol corpus validates under schema 9 and retains valid
  `dynamicnetwork` fixtures from schema 9.
- The immutable documentation migration corpus still contains its original
  schema-1-through-7 files, and every manifest digest matches after active
  downloads are converted.

## Milestone 5: Add Interview runtime localization context

**Required skills when implementation reaches this milestone:**

- Invoke `developing-network-canvas-ui` immediately before the first UI edit.
- Use `verifying-an-interface-change` for the existing interface matrix.
- Use `writing-an-oracle-that-can-fail` for new assertions.

**Files:**

- `packages/interview/src/contract/types.ts`
- `packages/interview/src/store/modules/session.ts`
- `packages/interview/src/store/middleware/syncMiddleware.ts`
- `packages/interview/src/store/middleware/localeMiddleware.ts` (new, or an equivalent explicit effect owner)
- `packages/interview/src/localization/ProtocolLocalizationProvider.tsx` (new)
- `packages/interview/src/localization/useLocalizedString.ts` (new)
- `packages/interview/src/localization/LocalizedText.tsx` (new, only if a wrapper materially reduces repeated accessible markup)
- `packages/interview/src/Shell.tsx`
- `packages/interview/src/components/Navigation/**`
- `packages/interview/src/components/ContentItem.tsx`
- `packages/interview/src/components/StagesMenu.tsx`
- `packages/interview/src/interfaces/NameGeneratorRoster/useItems.ts`
- `packages/interview/src/interfaces/NameGeneratorRoster/DataCard.tsx`
- `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Participant interface, prompt, form, panel, content, and codebook label renderers identified in Milestone 0
- `packages/fresco-ui/src/form/Field/types.ts`
- `packages/fresco-ui/src/form/Field/BaseField.tsx`
- `packages/fresco-ui/src/form/Hint.tsx`
- Fresco UI field components used by Interview for option and endpoint labels
- `packages/interview/src/index.ts`
- Focused unit, Storybook, and interface-matrix tests

**Work:**

1. Add required `locale` and ordered `localeOptions: readonly LocaleMetadata[]`
   to `SessionPayload`, with only locale persisted in session state. Hosts
   derive the complete option array before launch; validate that its locales
   exactly match `payload.protocol.localization.locales` during store creation.
2. Wrap the interview-rendering subtree in `ProtocolLocalizationProvider`.
   It receives protocol config, session locale, and the serialized option
   metadata, and exposes the pure resolver.
3. Add a session action and a public `LocaleChangeHandler` to change locale.
   The action updates rendering immediately and invokes the dedicated handler
   exactly once. Exclude locale and `localeOptions` from ordinary session-sync
   change detection: presence in a complete `SessionPayload` is not
   locale-change intent. The action must not reset stage, prompt, metadata, or
   network.
4. Add a language control to Navigation's existing settings menu when there is
   a meaningful choice. Render the host-supplied autonyms/directions rather
   than independently calling `Intl.DisplayNames`; make the current selection
   and fallback behavior accessible.
5. Convert every participant-facing render call site from schema strings to
   `useLocalizedString` or the pure resolver. Use actual source locale on the
   nearest text container.
6. Add a protocol-neutral `PresentationalText` union to Fresco UI and extend
   every Interview-used field label, hint, option-label, and endpoint-label API
   to accept it alongside plain strings. Components unwrap the primitive text
   for filtering/ARIA/Markdown behavior but apply `lang` and `dir` to the
   nearest visible leaf or native option. Invoke `finishing-a-refactor` for
   this shared seam and convert or justify every affected call site.
7. Update form adapters so prompt, hint, option labels, scalar endpoint labels,
   and Network Composer Visual Analog Scale endpoint overrides resolve to
   `PresentationalText` before reaching Fresco UI. Replace the current
   string-only runtime checks with the typed component branch; preserve error
   associations, accessible names, variable ids, and values.
8. Replace Name Generator Roster's label-keyed details record with an ordered
   `{ id, label, value }` collection. Use the stable card-property/variable
   schema path (including array index) plus resolved variable/column identity
   for React keys, retain the full resolved label metadata, and allow duplicate
   translated labels or repeated column references without overwriting values.
9. Update node/edge/variable display fallbacks to use localized `label`, while
   export and semantic code continues to use stable `name` and keys.
10. Resolve stage `label` in the participant Stages menu and Narrative Pedigree
    snapshot title. Researcher/editor surfaces choose an explicit editor locale
    or the protocol default rather than treating the map as a string.
11. Resolve asset-item `description` before rendering image, audio, and video
    accessibility labels. Never fall back to `assetMeta.name`; use an
    application-owned generic media label when the optional description is
    absent, leaving its translation to the separate UI-message catalog.
12. Remove label-based runtime comparisons discovered by the type transition;
    compare stable values or ids.
13. Apply selected direction to protocol content regions and actual fallback
    direction to leaf content. Audit physical spacing/alignment, arrows, and
    drag behavior under RTL without mirroring graph coordinates.
14. Keep hardcoded runtime-owned English copy out of LocalizedString and note
    it in tests/documentation as the separate application-catalog boundary.
15. Ensure analytics records only the selected declared locale if approved;
    never send raw browser preference lists or participant text.

**Tests:**

- Exact, variant, default, and locale-order fallback in representative prompt,
  form, option, panel, and canvas label renderers.
- Codebook and Network Composer override scalar endpoint labels resolve
  independently, including when only one of them has a selected-locale value.
- Stage-menu items and Narrative Pedigree snapshot titles resolve selected and
  fallback stage labels.
- Information and Family Pedigree image/audio/video accessibility names use
  resolved descriptions and never use asset metadata names.
- Fresco UI labels, hints, options, and endpoint labels preserve actual source
  `lang`/`dir` through their rendered DOM, including Markdown and native
  control paths.
- Two roster properties that both resolve to `Edad` remain distinct rows with
  their own stable ids, values, and source-locale attributes.
- `lang`/`dir` on selected and mixed-fallback strings.
- Changing locale preserves all session/network state, triggers one locale
  persistence callback, and does not trigger ordinary session sync.
- Resume uses stored locale.
- Navigation selector keyboard/screen-reader behavior.
- Interface matrix covers incomplete Spanish and RTL in Chromium, Firefox,
  and WebKit.
- Mutation tests demonstrate assertions fail if a call site uses a raw map or
  semantic code switches on a translated label.

**Acceptance criteria:**

- TypeScript leaves no participant-facing LocalizedString passed as a raw
  React child or string prop.
- Locale changes are state-preserving and persisted.
- Fallback language is exposed correctly to assistive technology.

## Milestone 6: Implement Architect authoring, warnings, and preview

**Required skills when implementation reaches this milestone:**

- Continue under the already-invoked `developing-network-canvas-ui` guidance.
- Use `running-architect-e2e-tests` for final Architect verification.
- Use `writing-an-oracle-that-can-fail` for unit and E2E assertions.

**Files:**

- `apps/architect/src/components/Routes.tsx`
- `apps/architect/src/components/pages/index.ts`
- `apps/architect/src/components/pages/LocalizationPage.tsx` (new)
- `apps/architect/src/components/Localization/**` (new)
- `apps/architect/src/components/ProjectNav/ProjectNav.tsx`
- `apps/architect/src/selectors/issues.ts`
- `apps/architect/src/selectors/protocol.ts`
- `apps/architect/src/ducks/modules/activeProtocol.ts`
- `apps/architect/src/ducks/modules/protocol/**`
- Every existing field/editor for a schema-9 LocalizedString
- `apps/architect/src/components/PreviewHost/messages.ts`
- `apps/architect/src/components/PreviewHost/launchPreview.ts`
- `apps/architect/src/components/PreviewHost/PreviewHost.tsx`
- `apps/architect/src/components/StageEditor/StageEditor.tsx`
- Architect component and E2E tests

**Work:**

1. Add localization state mutations with typed, whole-protocol operations:
   add locale, reorder, change default, remove locale, and relabel `und`.
2. Implement an atomic traversal over schema-tagged localized paths for locale
   removal/relabel. Reuse the protocol-validation collector output rather than
   recursively rewriting arbitrary objects. Relabeling the current default
   updates `defaultLocale` in the same transaction; relabeling any other locale
   leaves it unchanged. If the affected tag is the selected preview locale,
   relabel it to the new tag or reset it to the surviving default on removal in
   the same undoable operation.
3. Reject locale relabel collisions. Confirm before destructive removal, show
   affected translation count, and prevent operations that leave an empty
   localized string.
4. Add `LocalizedStringField` as a protocol-specific Architect component.
   Integrate it into every participant-copy editor without moving validation
   ownership away from the actual field. This includes the stage-label editor;
   Architect's timeline and editor headers resolve it using explicit editor
   locale/default fallback.
   Convert the Network Composer scalar-parameter editor too, so its
   stage-specific Visual Analog Scale endpoint overrides are authorable in
   every declared locale.
5. Add `/protocol/localization`, export its page, and add a project-nav tab with
   a warning indicator driven by localization coverage.
6. Add memoized selectors over `analyzeProtocolLocalization`, grouped by
   locale, path/area, missing default, and total coverage. Extend the existing
   issues selector contract rather than inventing a second global warning
   system.
7. Implement coverage UI, missing-only filtering, exact-path navigation where
   an editor exists, and clear fallback text.
8. Add the `und` callout and one-step relabel workflow. The operation must be a
   single undoable protocol edit.
9. Update new-protocol creation: a blank protocol asks for or deliberately
   chooses an initial locale; known English templates use `en-US`.
10. Add preview locale to editor preview state and `PreviewPayload`. PreviewHost
    hydrates `SessionPayload.locale` from that value and never detects browser
    language independently. Locale mutation failure/undo restores the preview
    preference with the protocol state.
11. Ensure downloads remain allowed with warnings and blocked only by schema
    errors.
12. Update printable summary/codebook rendering to make its locale choice
    explicit. Default to the protocol default and label the choice; do not
    silently concatenate translations into export names.

**Tests:**

- Field edits preserve translations in nonactive locales.
- Missing translations save and warn; extra keys/empty maps fail.
- Locale add/reorder/default/remove/relabel are undoable and atomic. Relabeling
  the default updates the declaration, `defaultLocale`, and every localized
  key together; relabel/removal retargets or resets the selected preview
  locale; an injected failure rolls all of them back.
- Destructive confirmation includes accurate counts and cancel is a no-op.
- A removal that would empty a field is refused.
- Coverage counts match collected schema hits.
- Preview receives the selected locale and displays the same fallback as the
  coverage warning.
- Read-only protocol views expose localization coverage without edit controls.
- E2E: migrate/open v8, identify `und`, add Spanish, observe warnings, translate
  one field, preview Spanish with fallback, download valid schema 9.

**Acceptance criteria:**

- Incomplete translation work is visible but never masquerades as a validation
  failure.
- Every localized schema field is authorable.
- Preview and production use the same resolution helper.

## Milestone 7: Persist locale in Interviewer

**Files:**

- `apps/interviewer/src/lib/db/types.ts`
- `apps/interviewer/src/lib/db/db.ts`
- `apps/interviewer/src/lib/db/sessions.ts`
- `apps/interviewer/src/lib/db/recordCrypto.ts`
- `apps/interviewer/src/lib/db/migrateStoredProtocols.ts`
- `apps/interviewer/src/components/NewSessionForm.tsx`
- `apps/interviewer/src/routes/Interview.tsx`
- `apps/interviewer/src/lib/synthetic/generate.ts`
- Related DB, crypto, migration, form, route, and E2E tests

**Work:**

1. Add a Dexie version with a `sessionLocales` table keyed by session id. Its
   record contains required canonical locale, a monotonically incremented
   revision, and update timestamp. This is encryption-independent research
   metadata that will also be exported. Do not put the canonical value in the
   legacy-replaceable `sessions` row: a schema-8 tab must be unable to erase it
   or restore an earlier `und` value with a full-row write.
2. Keep required `locale` on the application-facing `StoredSession` and
   hydrated `SessionPayload`, but assemble it by joining `sessions` with
   `sessionLocales`. Split the raw Dexie session-row type from the hydrated
   type. Every get/query/hydration/export path treats the locale record as
   authoritative; `localeOptions` remains transient presentation data.
3. Extend protocol migration so pre-localization schema-8 sessions repointed
   to a schema-9 hash receive `und` locale records in the same transaction.
   Preserve any existing record and preserve rollback on any failure.
4. Keep the current commit-time `updateSession` race guard for the freshest
   `protocolHash`, but remove locale from that patch API entirely. Add
   `setSessionLocale(id, locale)` as the only locale mutation. In one Dexie
   transaction it reads the latest session and protocol, validates the
   requested locale against the latest schema-9 declaration, increments the
   locale-record revision, and commits. Per-session sequencing preserves
   same-tab user intent; concurrent explicit changes in separate tabs are
   last-committed-wins. Type the general patch as
   `Partial<Omit<StoredSession, 'locale'>>` (or an equivalent explicit patch
   interface) so ordinary network/step sync cannot write locale accidentally.
5. Extend the durable launch healer to follow protocol-hash migration records
   and ensure every live session has one locale record. For an automatically
   migrated schema-8 protocol use `und`; otherwise use the protocol default.
   Never replace an existing record. Remove locale records whose session was
   deleted by an unaware legacy tab, and make current session deletion remove
   both records atomically.
6. Extend `createSession` with required locale and atomically write both the
   session and locale records. In NewSessionForm, compute the
   initial locale from `navigator.languages` at render/interaction time and
   expose an Interview Language select for multiple locales.
7. Explicit selection passes as the only requested locale. Do not store the
   browser preference list.
8. Update synthetic sessions to default to protocol default or an explicit
   builder locale.
9. Hydrate the joined locale in InterviewRoute. Pass a dedicated
   `LocaleChangeHandler` that calls `setSessionLocale`; keep `handleSync`
   restricted to network, current step, and stage metadata even though its
   compatibility signature receives a complete `SessionPayload`. Review mode
   reads the recorded locale and supplies a no-op locale handler independently
   of the general no-op sync handler.
10. Listen to browser `languagechange` only to refresh the default for future
    new-session forms. Never change a running session automatically.

**Tests:**

- Create, encrypt/decrypt, update, hydrate, and query old/new session rows and
  their joined locale records.
- Browser exact/variant/default selection and explicit override.
- Migration transaction changes protocol hash and locale together; injected
  failure rolls back both.
- Interleave current-bundle encryption with migration and prove the commit
  guard preserves the freshest hash for an unrelated patch. Prove an ordinary
  `en`→`es` dedicated locale change persists, a complete unrelated sync cannot
  mutate locale, and a locale request concurrent with migration is checked
  against the latest declaration. Then simulate schema-8 full-row writes both
  without locale and with a stale `und` value and prove neither can change the
  independent locale record. Cover missing-record backfill, current deletion,
  legacy deletion plus orphan cleanup, and unchanged network/progress/step.
- Running locale change survives lock-screen route remount and app restart.
- Existing session data and current step remain unchanged.

**Acceptance criteria:**

- Every schema-9 Interviewer session has a declared locale.
- No pre-localization session becomes orphaned or resumes in a different state.

## Milestone 8: Persist locale in Fresco and preserve SSR parity

**Files:**

- `apps/fresco/lib/db/schema.prisma`
- `apps/fresco/lib/db/migrations/<timestamp>_add_protocol_localization_and_interview_locale/migration.sql` (new)
- `apps/fresco/lib/db/migrations/<timestamp>_add_protocol_canonical_hash_alias/migration.sql` (new, or folded into the preceding unreleased migration)
- `apps/fresco/lib/db/index.ts`
- `apps/fresco/schemas/interviews.ts`
- `apps/fresco/actions/protocols.ts`
- `apps/fresco/actions/interviews.ts`
- Fresco protocol queries/result-extension code that reconstructs a protocol
- `apps/fresco/app/(interview)/onboard/[protocolId]/route.ts`
- `apps/fresco/app/(interview)/interview/[interviewId]/page.tsx`
- `apps/fresco/app/(interview)/interview/[interviewId]/mapInterviewPayload.ts`
- `apps/fresco/app/(interview)/interview/[interviewId]/InterviewClient.tsx`
- `apps/fresco/app/(interview)/interview/[interviewId]/sync/route.ts`
- `apps/fresco/app/(interview)/interview/[interviewId]/locale/route.ts` (new, or an equivalent dedicated action)
- `apps/fresco/scripts/migrate-protocols.ts`
- Related Prisma, action, route, mapper, sync, and migration tests

**Work:**

1. Add required JSON `localization` storage to `Protocol` and a non-null
   `locale` column to `Interview`. Backfill protocol rows with the migrated
   `und` declaration and existing interviews with `und` in coordination with
   schema-9 migration. Use additive columns with database defaults so a
   still-live schema-8 server can continue inserting rows during the
   build. SQL defaults are deployment safety nets, not the selection algorithm
   for new rows.
2. Persist `protocol.localization` during import and include it in every
   protocol select/reconstruction path, current-schema result extension,
   export, and interview payload mapping. A stored schema-9 protocol must
   round-trip `{ localization, stages, codebook }` without projection.
3. Extend onboarding GET and POST parsing to accept an optional `locale` or
   choose one canonical parameter name (`locale` preferred in the typed API;
   optionally accept `lang` as a URL alias).
4. In `createInterview`, fetch the protocol localization declaration with the
   schema version. Validate an explicit choice; otherwise parse the request
   `Accept-Language`. Select and persist the locale in the same create call.
5. Avoid hidden request-global coupling in reusable actions. Pass the ordered
   requested locales or explicit locale from the route to a typed action
   boundary unless Next's request APIs are already the established action
   pattern.
6. Treat an explicit query value as the sole preference whenever the parameter
   is present. A canonical regional variant may best-fit to a declared locale;
   a malformed value or one with no declared best-fit match selects the
   protocol default without consulting `Accept-Language`. Do not turn a
   malformed locale query into an interview-creation failure or persist the
   raw value.
7. Include stored locale and the complete server-derived `localeOptions` array
   in `GetInterviewByIdQuery`, `mapInterviewPayload`, and `SessionPayload`
   before server render. InterviewClient does not inspect
   `navigator.languages` or call `Intl.DisplayNames` for the initial selector;
   it uses the exact serialized autonyms/directions during prerender and
   hydration.
8. Persist new-client locale changes through a dedicated locale route/action
   implementing `LocaleChangeHandler`. Validate the supplied value against the
   interview's protocol declaration and reject an undeclared value with the
   existing generic 400 response. Keep the ordinary sync request restricted
   to network, step, and metadata even though the in-memory payload also has a
   locale. A pre-localization tab's locale-less sync must continue saving those
   fields while preserving the database's backfilled locale.
9. Decouple `migrateProtocolsToCompatibleVersion` from Interview's runtime
   compatibility constant and prevent `setup-database.ts` from advancing stored
   protocol bodies or hashes to schema 9. This applies to both Netlify's
   pre-build path and the GHCR container's pre-start path; correctness must not
   depend on an installation having run an intermediate image.
10. Add one permanent versioned read adapter for stored schemas 7, 8, and 9.
    Use the registered chain to produce schema 9 in memory and derive `und`
    localization, then compute the migrated schema-9 hash for runtime payloads
    and exports while leaving storage untouched. Strict result extensions,
    `createInterview`, `mapInterviewPayload`, exports, and every reconstruction
    path use the adapter. New imports write schema 9 only.
11. Add an indexed canonical-hash alias for every protocol without changing
    its stored legacy hash. Model the alias as a unique canonical hash mapped
    to its owning protocol row. Duplicate import first checks both exact and
    alias hashes; before inserting, lazily adapt unaliased old rows with the
    assets required for validation, compute their schema-9 hashes, and
    register aliases. Create a schema-9 row and its unique alias
    transactionally; concurrent equivalent imports must converge on the
    existing protocol. If pre-existing duplicate legacy rows collide while
    aliases are registered, retain both addressable rows but designate one
    canonical duplicate-lookup owner and report the collision for maintenance.
    Define the alias relation with a database-level `ON DELETE CASCADE` foreign
    key; do not depend on action-level cleanup, because a rolling older server
    may execute its asset-first `protocol.deleteMany` path without knowing the
    alias table exists.
12. Treat mixed stored versions as supported. Persistent convergence may occur
    only through an authenticated re-import or a separately invoked maintenance
    command after a schema-9 server is healthy, with backup and rollback
    consequences made explicit. It is optional, never runs at build/startup,
    and is not required to conduct interviews.
13. Keep the dual-read adapter and database defaults through the rollback
    window. A hosted rollout may stage a compatibility release, but direct
    self-hosted upgrades that skip it remain safe.
14. Include locale in relevant administrative summaries only where it provides
    useful research context; do not localize protocol names in dashboard
    filters.

**Tests:**

- `Accept-Language` quality ordering, no header, malformed entries, regional
  match, and protocol-default fallback.
- Explicit URL locale outranks the header; `es-MX` best-fits to declared `es`,
  while malformed or unmatched explicit values select the protocol default
  without consulting the header.
- POST participant identifier and locale parsing preserves current security
  behavior.
- Protocol import/read/current-schema reconstruction preserves localization;
  Prisma creation/backfill and deploy migration rollback cover both protocol
  localization and interview locale.
- Setup leaves existing schema-7/schema-8 protocol bodies and hashes unchanged,
  while the schema-9 server starts/resumes interviews from mixed storage and
  writes only schema 9 for new imports.
- Upgrade directly from a pre-compatibility GHCR image to the schema-9 image,
  then force build/start failure. Stored protocol rows remain unchanged and the
  older installation can still run; retrying the schema-9 image starts,
  resumes, and syncs every supported stored version.
- Re-import the schema-9 equivalent of stored schema-7 and schema-8 rows.
  Adapted-hash lookup returns the original protocol instead of inserting a
  runtime-equivalent duplicate; concurrent imports are covered at the alias
  uniqueness boundary, while an exact schema-9 re-import still follows the
  normal fast path.
- Delete protocols through both the current action and a simulated legacy
  direct `protocol.deleteMany` after alias creation. The database cascade
  removes aliases and the existing asset-first flow still reaches protocol
  deletion successfully.
- Payload server/client equality and no hydration warning, including a test
  that gives server and browser `Intl.DisplayNames` different spellings and
  proves the serialized server metadata controls both initial renders.
- The dedicated locale boundary accepts a declared locale, rejects an
  arbitrary locale, and preserves freeze behavior for completed interviews.
  A subsequent ordinary sync cannot overwrite that selection. A legacy
  locale-less sync after database migration saves network/current-step changes
  and leaves stored `und` intact.

**Acceptance criteria:**

- Fresco selects locale before first client render.
- Existing interviews remain resumable after schema/database migration.
- No schema-9 protocol row can lose its root localization declaration.
- Re-importing content equivalent to any supported legacy stored version does
  not create another runtime-equivalent protocol row.
- Current and legacy protocol deletion paths cannot be blocked by alias rows.
- No raw preference list is stored.
- No automatic pre-build or pre-start process rewrites a protocol row to schema
  9, even when an installation skips releases.

## Milestone 9: Export selected locale without localizing analysis schema

**Files:**

- `packages/shared-consts/src/**` for the stable session-locale export property
- `packages/network-exporters/src/input.ts`
- `packages/network-exporters/src/formatters/formatExportableSessions.ts`
- `packages/network-exporters/src/formatters/csv/egoList.ts`
- `packages/network-exporters/src/formatters/graphml/helpers.ts`
- Exporter tests and fixtures
- `apps/interviewer/src/lib/export/exportSessions.ts`
- `apps/fresco/queries/interviews.ts`
- `apps/fresco/lib/export/InterviewRepository.ts`

**Work:**

1. Define one stable session property for interview locale in shared consts.
   Follow existing `sessionProperty`/`protocolName` conventions.
2. Add required locale to `InterviewExportInput` and `SessionVariables`.
3. Emit it as graph/session-level `nc:interviewLocale` in GraphML. For CSV,
   keep session metadata separate from the ego attribute record rather than
   adding the raw locale property to `TOP_LEVEL_KEYS`. Allocate the preferred
   `networkCanvasInterviewLocale` printed header after codebook headers are
   known; if occupied, use `networkCanvasInterviewLocale__session` and then a
   numeric suffix. Never rename or replace the colliding ego response.
4. Map Interviewer's joined `StoredSession.locale` and Fresco
   `Interview.locale` into
   export inputs.
5. Keep CSV attribute headers, GraphML key names, node/edge type names, and
   option values based on stable codebook names/values. Do not use localized
   labels for analysis identifiers.
6. Document `und` in exported legacy-migrated sessions.

**Tests:**

- Spanish, region-specific, RTL, and `und` values round-trip to CSV/GraphML.
- Switching interview locale does not change codebook-derived headers or keys.
- Multi-session exports retain each session's own locale.
- Regression fixtures with ego variables named `interviewLocale`,
  `INTERVIEW_LOCALE`, and `networkCanvasInterviewLocale` emit both the
  collected response and session locale in distinct columns. Assert header and
  value placement, not merely presence of either string.

**Acceptance criteria:**

- Researchers can determine the selected language for every exported session.
- Existing analysis field identity is locale-independent.
- No valid legacy ego variable can cause the locale column to replace a
  response or disappear.

## Milestone 10: Activate schema 9 across modern consumers

**Files:**

- `packages/protocol-validation/src/schemas/index.ts`
- `packages/protocol-validation/src/index.ts`
- `packages/interview/src/protocolSchemaVersion.ts`
- Architect schema-version constants and protocol source-authoring plugin
- Interviewer and Fresco compatibility uses already derived from Interview
- `apps/studio/server/src/protocol/sectionize.ts`
- `apps/studio/server/src/protocol/assemble.ts`
- `apps/studio/server/src/protocol/validate.ts`
- `apps/studio/server/src/protocol/migrate.ts`
- `apps/studio/server/scripts/protocol-demo.ts`
- Studio protocol round-trip, diff, validation, migration, and publish tests
- Any residual schema-version fixtures or documentation

**Work:**

1. Add `localization` to Studio's settings section and strict schema, and prove
   sectionize/assemble/diff/migrate/publish preserves it. Older stored section
   manifests for schema 8 assemble unchanged before the canonical v8-to-v9
   migration adds `und`.
2. Update `protocol-demo.ts` to select and edit one entry in a localized prompt
   map and resolve localized stage labels for its diff display. Remove
   string-only prompt filtering, concatenation assumptions, and label casts;
   the executable demo must exercise the actual schema-9 representation.
3. Set or retain `CURRENT_SCHEMA_VERSION = 9` and
   `CurrentProtocolSchema = ProtocolSchemaV9` only on the combined schema-9
   implementation branch. Do not publish or release it until the implementation
   from Milestones 1-9, including Studio compatibility work, compiles
   successfully.
4. Update current-version exports of interface-owned constants to schema 9.
   Keep explicit schema-version imports where migration code needs old values.
5. Confirm Interview's compatibility constant, Architect's typed constant,
   Interviewer, Fresco, and Studio all derive 9 without new numeric literals.
   Fresco's stored-row migration cap is the explicit exception: it is not
   derived from that runtime constant and must never make setup rewrite rows to 9.
6. Run a literal-version search over active code, tests, scripts, fixture
   manifests, protocol archives, and documentation. Classify every remaining
   `8` or `9` as historical/versioned/Dynamic-Rosters-owned or fix it.
7. Run publish-export verification after a full build so the new helper and
   schema types are present in packed artifacts.
8. Prove the activation build includes Fresco's mixed-version read adapter and
   does not enable a schema-9 bulk rewrite in either setup path.

**Acceptance criteria:**

- All modern hosts report schema 9 from their single source of truth.
- Studio round-trips the complete schema-9 settings section without dropping
  localization.
- `pnpm --filter @codaco/studio-server protocol-demo` completes its localized
  edit, diff, validation, and publish sequence.
- No current host constructs or accepts a schema-8-shaped `CurrentProtocol`;
  Fresco's storage boundary explicitly adapts versioned older rows instead.
- Classic version boundaries remain unchanged.

## Milestone 11: Cross-surface verification and visual review

**Required skills:**

- `verifying-an-interface-change`
- `running-architect-e2e-tests`
- `preparing-e2e-visual-baselines` if pixels can change
- `adopting-a-test-baseline` before accepting any changed baseline
- `writing-an-oracle-that-can-fail` for all new regression assertions

**Focused verification:**

```bash
pnpm --filter @codaco/protocol-validation test
pnpm --filter @codaco/protocol-validation typecheck
pnpm --filter @codaco/protocol-utilities test
pnpm --filter @codaco/protocol-utilities typecheck
pnpm --filter @codaco/interview test
pnpm --filter @codaco/interview typecheck
pnpm --filter @codaco/network-exporters test
pnpm --filter @codaco/network-exporters typecheck
pnpm --filter @codaco/architect test
pnpm --filter @codaco/architect typecheck
pnpm --filter @codaco/interviewer test
pnpm --filter @codaco/interviewer typecheck
pnpm --filter fresco test
pnpm --filter fresco typecheck
pnpm --filter @codaco/studio-server test
pnpm --filter @codaco/studio-server typecheck
```

Use the actual package scripts if a filter name or test script differs at
implementation time.

**Repository gates:**

```bash
pnpm lint:fix
pnpm typecheck
pnpm knip
pnpm build
```

Run affected Architect, Interview, and Interviewer E2E lanes under their
documented workflows. Run Storybook/Chromatic coverage for every affected UI
package. Generate visual baselines only for affected suites, inspect every
image diff, and do not adopt a broad baseline rewrite.

**Manual scenarios:**

1. English-only protocol, browser Spanish: protocol default English.
2. English/Spanish complete protocol, browser `es-MX`: Spanish best-fit.
3. Incomplete Spanish form: Spanish prompt plus English fallback hint/option/
   endpoint labels, each with the actual source `lang`/`dir` through Fresco UI,
   and the expected warning.
4. Missing default translation: first declared available translation and
   explicit author warning.
5. Arabic selected: correct derived direction, keyboard/focus order, graph
   behavior, and mixed English fallback.
6. Change locale mid-stage with entered form data: data and position remain.
7. Resume after app/device language changed: stored locale remains.
8. v8 protocol with unknown source language: `und`, warning, relabel, preview,
   and export.
9. Fresco direct recruitment URL with explicit locale and conflicting header:
   explicit locale wins.
10. Studio sectionizes, assembles, migrates, validates, and publishes a
    multilingual protocol without dropping localization, and the
    `protocol-demo` command edits a localized prompt and renders its stage diff.
11. Classic app attempts schema 9: clear incompatibility, no partial import.
12. Fresco schema-9 image is installed directly over a pre-compatibility
    image. Setup leaves schema-7/schema-8 rows unchanged; force startup
    failure, verify the old image can still run, then retry and conduct new,
    resumed, and synced interviews through the mixed-version adapter.
13. Re-import schema-9 content equivalent to stored schema-7 and schema-8 rows;
    canonical adapted-hash lookup returns the existing protocol, including
    when equivalent imports race.
14. Delete an aliased protocol through current and legacy Fresco paths after
    asset cleanup; the database cascade removes the alias and never blocks the
    protocol delete.
15. Prerender Fresco with server autonym spellings that differ from the mocked
    browser `Intl.DisplayNames`; serialized locale options hydrate unchanged.
16. Two Roster card properties translate to the same visible label; both rows,
    values, stable keys, and source-locale attributes remain present.
17. Export a protocol with ego variables named `interviewLocale`,
    `INTERVIEW_LOCALE`, and `networkCanvasInterviewLocale`; every response and
    the selected session locale appear in separate deterministic columns.
18. A schema-8 protocol migrates once to the combined schema 9; the Dynamic
    Rosters migration rules and localized copy both apply. A canonical
    schema-9 dynamic roster retains its endpoint request/sample/reference
    contract while its participant copy resolves.

**Acceptance criteria:**

- All required unit, type, lint, knip, build, E2E, and visual gates pass.
- New tests have been demonstrated to fail against the behavior they guard.
- No unexplained baseline changes remain.

## Milestone 12: Documentation, changesets, and delivery

**Required skills:**

- `creating-a-changeset`
- `shipping-a-pull-request` after implementation and verification

**Files:**

- `.changeset/*.md`
- Protocol/schema authoring documentation
- Migration/release notes
- Package READMEs or API docs for protocol-validation and Interview contract
- This specification and implementation plan

**Work:**

1. Use the changeset skill to classify the breaking public schema/type changes
   and coordinated package/app releases. The normal-lane changeset must include
   the converted published protocol artifacts in
   `@codaco/development-protocol` and `@codaco/sample-protocol`, alongside the
   affected libraries and apps, including `@codaco/fresco-ui` for its new
   public `PresentationalText` field APIs and `@codaco/shared-consts` for the
   public session-locale export consumed by the externally bundled network
   exporter. This ensures external Interview consumers cannot combine the new
   runtime with an old Fresco UI contract, and npm plus the
   latest-development-protocol delivery path actually receive schema 9 without
   an exporter/runtime version skew.
   Add a separate Studio-lane changeset for affected Studio packages. Do not
   mix Studio, Documentation, or Website with the normal lane or with one
   another.
2. Explain in release notes:
   - the combined schema 9 and `LocalizedString`, including that Dynamic
     Rosters, localization, and other pending features share one v8→v9 release;
   - missing translation warnings versus validation errors;
   - exact fallback order;
   - `und` migration and Architect relabel workflow;
   - session/export locale;
   - Classic incompatibility; and
   - built-in Interview UI copy remaining outside protocol localization.
3. Include before/after protocol JSON and helper API examples.
4. Commit with the user's configured identity only. Never add assistant
   attribution.
5. Open the PR using repository conventions, monitor all required CI and
   affected E2E/Chromatic jobs, resolve review feedback, and leave merge as a
   separately confirmed outward action unless the user authorizes it.

**Acceptance criteria:**

- The PR is reviewable by schema, runtime, Architect, host, and export owners.
- Release communication makes partial-translation behavior and compatibility
  boundaries unambiguous.

## Risk register

| Risk                                                                | Mitigation                                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pending features fork the shared schema 9                           | Stack on or rebase after #1451, modify its same tree and migration, and prohibit schema-9 publication until the combined contract passes.             |
| A participant-facing string is omitted from schema 9                | Complete the schema/render inventory before activation; metadata conformance fixture and compiler errors guard future drift.                          |
| Best-fit behavior differs between environments                      | Use the same FormatJS ponyfill everywhere and explicit `best fit`; run Node and browser contract tests.                                               |
| Browser/server hydration differs in selection or autonym spelling   | Fresco serializes the selected locale and complete server-derived option metadata; the client neither redetects nor re-derives initial labels.        |
| Missing translation becomes a production blocker                    | Keep coverage outside `validateProtocol`; assert incomplete fixtures import/run/download.                                                             |
| Fallback produces duplicate disease labels                          | Resolve and compare disease labels for every declared locale during schema-9 validation.                                                              |
| Duplicate translated roster labels overwrite detail values          | Carry an ordered detail collection keyed by stable property identity; labels retain resolution metadata and may repeat.                               |
| Fresco UI strips fallback locale metadata from control copy         | Add a protocol-neutral presentational-text value and attributed rendering paths for fields, hints, options, endpoints, Markdown, and native controls. |
| Locale removal corrupts localized maps                              | Use schema-tagged paths, atomic update, collision/empty checks, confirmation, and undo tests.                                                         |
| Translation changes or metadata collisions alter export schema      | Keep stable codebook names/values and allocate a distinct locale metadata header after codebook headers; test adversarial ego variable names.         |
| Locale preference leaks identifying data                            | Persist/export only the selected declared locale, never the raw ordered preference list.                                                              |
| RTL mirrors graph data or breaks interaction                        | Scope direction to presentation, audit physical CSS/icons, and run matrix/visual/manual RTL checks.                                                   |
| New schema strands in-progress sessions                             | Preserve migration invariants; update hash, protocol, session locale, and references transactionally in each host.                                    |
| A legacy app tab erases or stale autosync overwrites locale         | Store Interviewer locale in a separate durable register and persist intentional changes through a dedicated handler/route in every host.              |
| Fresco rewrites rows before a compatible server is active           | Never advance protocol rows in build/start setup; keep a permanent 7/8/9 read adapter so skipped self-hosted releases are safe.                       |
| A legacy Fresco hash bypasses duplicate detection after adaptation  | Store a unique canonical schema-9 hash alias, lazily populate aliases for old rows, and test sequential and concurrent mixed-version re-imports.      |
| Canonical aliases block deletion by an older Fresco server          | Put `ON DELETE CASCADE` on the alias foreign key and test the existing asset-first direct deletion path.                                              |
| Converting documentation downloads erases legacy migration coverage | Preserve byte-identical schema-1-through-7 fixtures plus a source-version/hash manifest before converting active archives.                            |
| `und` is mistaken for English                                       | Dedicated warning and explicit relabel action; known first-party English sources are converted to `en-US`.                                            |
| Shared package bundle becomes unusable in CLI/worker                | Keep helpers framework-free, bundle FormatJS, and test source and packed ESM imports.                                                                 |
| Built-in English UI gives a false impression of full localization   | State the boundary in Architect and docs; do not set document language globally for untranslated host chrome.                                         |

## Definition of done

- Schema 9 represents every protocol-authored participant string as a valid
  `LocalizedString` and retains stable semantic names/values.
- Localization extends #1451's unreleased schema-9 tree and single v8→v9
  migration; the combined version preserves the full `dynamicnetwork`
  contract and is not published until all pending schema-9 work is complete.
- Incomplete translations validate, warn, preview, run, resume, and export.
- Undeclared keys, empty maps, invalid/canonicalization errors, and empty
  translations on fields with a nonempty content contract fail with exact
  paths.
- FormatJS best-fit matching and deterministic fallback are shared across
  Architect, Interviewer, Fresco server/client, and tests.
- Locale names/direction are derived, not protocol data; hosts serialize the
  complete option metadata so SSR and hydration use identical presentation.
- Architect can manage locales, edit all translations, inspect coverage,
  relabel `und`, and preview any locale.
- Interview locale is selected, user-changeable, persisted, and included in
  CSV/GraphML metadata.
- Schema-8 stored and imported protocols migrate once to the combined schema 9
  without changing stages or collected answer shapes.
- Fresco UI controls and roster details preserve each resolved string's source
  locale and stable identity even when translations are missing or collide.
- CSV locale metadata cannot replace or hide a colliding ego-variable response.
- Fresco persists the root localization declaration for schema-9 imports and
  preserves it through read, versioned adaptation, payload construction, and
  export. Canonical adapted hashes prevent runtime-equivalent re-import
  duplicates across stored schema 7-9 rows, and alias cascades preserve legacy
  protocol deletion.
- Studio round-trips localization in protocol settings, and its shipped
  `protocol-demo` completes a localized edit/diff/validation/publish sequence.
- Current-version constants are 9 across all modern consumers; Classic remains
  explicitly unsupported.
- Active protocol downloads are schema 9 while immutable schema-1-through-7
  copies and their digest manifest preserve historical migration coverage.
- Relevant tests, corpus validation, typecheck, lint, knip, builds, E2E,
  accessibility review, and inspected visual baselines pass.
- Changesets and migration documentation clearly communicate the breaking
  contract and the application-copy non-goal; both published compatibility
  protocol packages and the separate Studio release lane are included.
