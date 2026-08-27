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
force.

This is a coordinated cross-workspace change. Keep it on one feature branch
and make milestone-sized commits, but do not merge a state in which
`CURRENT_SCHEMA_VERSION` is 9 while a modern host still assumes schema-8
strings. The current-version flip is deliberately late.

## Planning context

### Decisions

| Decision                                      | Reason                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema 9 is required                          | Participant-facing fields change from strings to locale-keyed objects, which is a real protocol contract change.                                                         |
| Keep helpers in `@codaco/protocol-validation` | The functions operate on protocol-owned types; every modern host already depends on the package; this avoids a new public package and dependency cycle.                  |
| Keep React integration in `@codaco/interview` | Protocol-validation remains framework-free and works in Node, Vite, Next server code, workers, and the CLI.                                                              |
| Use FormatJS `best fit` explicitly            | It implements the ECMA-402 locale matching behavior the browser does not expose as a public arbitrary-resource matcher.                                                  |
| Persist one selected locale                   | It makes resume deterministic and avoids retaining the user's full browser/header preference list.                                                                       |
| Missing translations are warnings             | Partially translated protocols remain valid and runnable; extra locale keys, empty maps, and violations of the owning field's existing content constraint remain errors. |
| Fallback follows declared locale order        | Object key insertion order is not an authoring contract; `localization.locales` becomes the explicit final fallback priority.                                            |
| Migrate unknown-language text to `und`        | Automatic migration cannot truthfully infer that arbitrary schema-8 content is English.                                                                                  |
| Add codebook `label` beside `name`            | Participant copy becomes localizable without making export column/type names locale-dependent.                                                                           |
| Store locale in session and export metadata   | The language used is part of the conditions under which interview data was collected.                                                                                    |
| Do not deep-resolve the whole protocol        | That would erase the source locale of fallback text and prevent accurate DOM `lang`/`dir`.                                                                               |

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
- Classic apps keep their external legacy protocol-validation dependencies.
- Locale-derived display labels and direction never become protocol data or
  protocol hash inputs.
- Browser and request APIs remain at host boundaries.

### Delivery shape

Prefer one coordinated implementation pull request because switching
`CurrentProtocol` to schema 9 changes public field types across Architect,
Interview, builders, hosts, Studio's protocol store, and tests. Fresco is the
delivery exception: its compatibility code and additive database changes must
deploy and be verified before a follow-up activation change enables the
schema-9 row rewrite. If review size requires other stacked pull requests,
only the framework-free matcher utilities may land independently; do not
export or activate schema 9 until the consumer stack is ready.

## Milestone 0: Establish the implementation baseline

**Files to inspect, not initially edit:**

- `packages/protocol-validation/src/schemas/8/**`
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

1. Confirm the feature branch is not `main`, record `git status`, and preserve
   unrelated changes.
2. Run dependency installation only if the workspace is not ready.
3. Run the current focused baseline suites:
   `@codaco/protocol-validation` tests/typecheck, `@codaco/interview`
   tests/typecheck, Architect unit tests/typecheck, Interviewer unit
   tests/typecheck, Fresco unit tests/typecheck, Studio server unit
   tests/typecheck, and network-exporters tests.
4. Inventory every participant render of the fields listed in the design.
   Use schema searches plus TypeScript call sites; do not rely only on a text
   search for `label`.
5. Record the known failing baseline before changing code.

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

- `packages/protocol-validation/src/schemas/9/**` (new copy of schema 8)
- `packages/protocol-validation/src/schemas/9/localized-string.ts` (new)
- `packages/protocol-validation/src/utils/collectLocalizedStrings.ts` (new)
- `packages/protocol-validation/src/localization/analyzeProtocolLocalization.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/localized-string.test.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/localization-coverage.test.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/localized-disease-labels.test.ts` (new)
- `packages/protocol-validation/src/schemas/index.ts`
- `packages/protocol-validation/src/index.ts`

**Work:**

1. Copy schema 8 to `schemas/9` as the established version-isolation model.
   Update internal relative imports and schema literals; do not make schema 9
   re-export or mutate schema-8 definitions.
2. Define `LocaleTagSchema`, `ProtocolLocalizationSchema`, and a localized
   string schema factory. The base localized schema validates at least one key;
   the factory preserves each owning field's schema-8 content constraint (for
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
14. Add `ProtocolSchemaV9` to the versioned schema union and export
    `Protocol<9>`, but leave `CURRENT_SCHEMA_VERSION` at 8 until the activation
    milestone.

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
- Schema-8 protocols remain parsed only by schema 8; schema-9 maps are never
  backported into schema 8.
- Collector conformance test enumerates expected metadata hits from a complete
  fixture, so a future schema field cannot disappear silently.
- Disease collisions caused by fallback fail for the affected locale; distinct
  resolved labels pass.

**Acceptance criteria:**

- Schema 8 remains byte-for-byte compatible in its public validation behavior.
- Schema 9 validates complete and incomplete localized fixtures as designed.
- Warning analysis and blocking validation are separate APIs.

## Milestone 3: Implement v8-to-v9 migration and version plumbing

**Files:**

- `packages/protocol-validation/src/schemas/9/migration.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/migration.test.ts` (new)
- `packages/protocol-validation/src/schemas/9/__tests__/migration-fuzz.test.ts` (new)
- `packages/protocol-validation/src/migration/index.ts`
- `packages/protocol-validation/src/migration/migrate-protocol.ts`
- `packages/protocol-validation/src/utils/hashProtocol.ts`
- `packages/protocol-validation/src/utils/__tests__/hashProtocol.test.ts`

**Work:**

1. Add schema 9 to `ProtocolTypeMap` and register `migrationV8toV9`.
2. Implement typed, explicit mapping helpers for each v8 schema family. Do not
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
   keys, and all fields that determine collected answer shape.
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
    `{ localization, codebook, stages }`. Decide the compatibility signature
    explicitly: schema-8 callers either pass an optional localization until
    activation or use a version-discriminated helper so old tests remain
    meaningful.
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
- Migration to target 8 post-validates schema 8 after schema 9 exists.
- The same caller cache key used first for target 8 and then target 9 returns
  the correct distinct schema versions; repeated calls at one target share the
  cached result; clearing the key removes both variants.
- Hash changes for a translation, default locale, or locale order; name,
  description, and derived locale metadata do not affect it.

**Acceptance criteria:**

- Any valid schema-8 protocol migrates deterministically to valid schema 9.
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

**Work:**

1. Build a one-use typed conversion script or use the v8-to-v9 migrator as a
   starting point, then explicitly relabel known English first-party content
   from `und` to `en-US`.
2. Convert canonical protocol sources, not generated compatibility copies;
   regenerate/synchronize compatibility packages through their existing
   workflow.
3. Update `SyntheticInterview` so its default protocol localization is
   `en-US`, every generated participant string uses localized helpers, and a
   fluent locale configuration API can add translations for tests.
4. Prefer builder methods such as `localized('text', { es: 'texto' })` or a
   centralized `LocalizedString` factory over repeated casts. Do not hide
   incomplete translation warnings in test builders.
5. Update protocol fixture factories to accept localization overrides while
   keeping terse defaults for unrelated tests.
6. Add one canonical intentionally incomplete multilingual fixture used across
   schema, runtime, host, and E2E tests.
7. Validate that generated compatibility packages and protocol archives carry
   schema 9 and the correct localization declaration.

**Acceptance criteria:**

- All first-party English protocols declare `en-US`, not `und`.
- Builders can generate complete, incomplete, regional-variant, and RTL
  protocol fixtures without unsafe assertions.
- The protocol corpus validates under schema 9.

## Milestone 5: Add Interview runtime localization context

**Required skills when implementation reaches this milestone:**

- Invoke `developing-network-canvas-ui` immediately before the first UI edit.
- Use `verifying-an-interface-change` for the existing interface matrix.
- Use `writing-an-oracle-that-can-fail` for new assertions.

**Files:**

- `packages/interview/src/contract/types.ts`
- `packages/interview/src/store/modules/session.ts`
- `packages/interview/src/store/middleware/syncMiddleware.ts`
- `packages/interview/src/localization/ProtocolLocalizationProvider.tsx` (new)
- `packages/interview/src/localization/useLocalizedString.ts` (new)
- `packages/interview/src/localization/LocalizedText.tsx` (new, only if a wrapper materially reduces repeated accessible markup)
- `packages/interview/src/Shell.tsx`
- `packages/interview/src/components/Navigation/**`
- `packages/interview/src/components/ContentItem.tsx`
- `packages/interview/src/components/StagesMenu.tsx`
- `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Participant interface, prompt, form, panel, content, and codebook label renderers identified in Milestone 0
- `packages/interview/src/index.ts`
- Focused unit, Storybook, and interface-matrix tests

**Work:**

1. Add required `locale` to `SessionPayload` and session state. Validate it
   against `payload.protocol.localization.locales` during store creation.
2. Wrap the interview-rendering subtree in `ProtocolLocalizationProvider`.
   It receives protocol config and session locale and exposes the pure resolver.
3. Add a session action to change locale. It must use the same sync path as
   other session changes and must not reset stage, prompt, metadata, or network.
4. Add a language control to Navigation's existing settings menu when there is
   a meaningful choice. Use autonyms and derived direction; make the current
   selection and fallback behavior accessible.
5. Convert every participant-facing render call site from schema strings to
   `useLocalizedString` or the pure resolver. Use actual source locale on the
   nearest text container.
6. Update form adapters so prompt, hint, option labels, scalar endpoint labels,
   and Network Composer Visual Analog Scale endpoint overrides resolve before
   reaching Fresco UI. Replace the current string-only runtime checks with the
   typed component branch; preserve error associations, accessible names,
   variable ids, and values.
7. Update node/edge/variable display fallbacks to use localized `label`, while
   export and semantic code continues to use stable `name` and keys.
8. Resolve stage `label` in the participant Stages menu and Narrative Pedigree
   snapshot title. Researcher/editor surfaces choose an explicit editor locale
   or the protocol default rather than treating the map as a string.
9. Resolve asset-item `description` before rendering image, audio, and video
   accessibility labels. Never fall back to `assetMeta.name`; use an
   application-owned generic media label when the optional description is
   absent, leaving its translation to the separate UI-message catalog.
10. Remove label-based runtime comparisons discovered by the type transition;
    compare stable values or ids.
11. Apply selected direction to protocol content regions and actual fallback
    direction to leaf content. Audit physical spacing/alignment, arrows, and
    drag behavior under RTL without mirroring graph coordinates.
12. Keep hardcoded runtime-owned English copy out of LocalizedString and note
    it in tests/documentation as the separate application-catalog boundary.
13. Ensure analytics records only the selected declared locale if approved;
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
- `lang`/`dir` on selected and mixed-fallback strings.
- Changing locale preserves all session/network state and triggers one sync.
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

1. Add required `locale` to `StoredSession` and hydrated `SessionPayload` as
   encryption-independent metadata alongside `protocolHash`. This is required
   for the commit-time cross-tab guard to read the freshest value without
   decrypting and re-encrypting the latest row. Document that it is research
   metadata and will also be exported.
2. Add a Dexie version only if an index or upgrade transform is needed. A
   nonindexed field can be populated by the existing launch-time protocol
   migration transaction; do not add a schema version without a storage need.
3. Extend protocol migration so schema-8 sessions repointed to a schema-9 hash
   receive `und` in the same transaction. Preserve rollback on any failure.
4. Extend the commit-time `updateSession` race guard to preserve the freshest
   stored locale alongside `protocolHash` if migration lands during an
   encryption gap. A legacy tab can still perform a schema-8 full-row write
   after migration and remove the field, so extend the durable
   `protocolMigrations` launch healer to restore missing locale to `und` while
   following the hash record. Never overwrite a locale that is present.
5. Extend `createSession` with required locale. In NewSessionForm, compute the
   initial locale from `navigator.languages` at render/interaction time and
   expose an Interview Language select for multiple locales.
6. Explicit selection passes as the only requested locale. Do not store the
   browser preference list.
7. Update synthetic sessions to default to protocol default or an explicit
   builder locale.
8. Hydrate and sync the session locale in InterviewRoute. Review mode reads the
   recorded locale and discards locale edits with other review changes.
9. Listen to browser `languagechange` only to refresh the default for future
   new-session forms. Never change a running session automatically.

**Tests:**

- Create, encrypt/decrypt, update, hydrate, and query old/new session rows.
- Browser exact/variant/default selection and explicit override.
- Migration transaction changes protocol hash and locale together; injected
  failure rolls back both.
- Interleave current-bundle encryption with migration and prove the commit
  guard preserves the freshest hash and locale. Then simulate a schema-8 tab's
  full-row write with no locale and prove the next launch heals it to `und`
  without changing network, progress, or current step.
- Running locale change survives lock-screen route remount and app restart.
- Existing session data and current step remain unchanged.

**Acceptance criteria:**

- Every schema-9 Interviewer session has a declared locale.
- No v8 session becomes orphaned or resumes in a different state.

## Milestone 8: Persist locale in Fresco and preserve SSR parity

**Files:**

- `apps/fresco/lib/db/schema.prisma`
- `apps/fresco/lib/db/migrations/<timestamp>_add_protocol_localization_and_interview_locale/migration.sql` (new)
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
- `apps/fresco/scripts/migrate-protocols.ts`
- Related Prisma, action, route, mapper, sync, and migration tests

**Work:**

1. Add required JSON `localization` storage to `Protocol` and a non-null
   `locale` column to `Interview`. Backfill protocol rows with the migrated
   `und` declaration and existing interviews with `und` in coordination with
   schema-9 migration. Use additive columns with database defaults so the
   still-live schema-8 server can continue inserting rows during the first
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
7. Include stored locale in `GetInterviewByIdQuery`, `mapInterviewPayload`, and
   `SessionPayload` before server render. InterviewClient does not inspect
   `navigator.languages`.
8. New clients include locale in the sync schema and the route validates a
   supplied value against the interview's protocol declaration. Keep locale
   optional at this HTTP boundary during rolling deployment: a schema-8 tab
   that omits it must still save network, step, and metadata changes, and the
   update must preserve the database's backfilled `und` locale. Reject a
   supplied undeclared value with the existing generic 400 response.
9. Decouple `migrateProtocolsToCompatibleVersion` activation from Interview's
   runtime compatibility constant. The first Fresco release applies the
   additive storage migration but leaves schema-8 rows and hashes untouched.
   Its new server accepts stored schemas 8 and 9, migrating schema-8 content in
   memory for the schema-9 Interview runtime and deriving `und` localization.
   Compute the migrated schema-9 hash for runtime payloads and exports while
   leaving the stored hash untouched; activation later persists that same
   identity. Schema-9 imports write the complete new shape. Update strict
   result extensions, `createInterview`, `mapInterviewPayload`, exports, and
   every reconstruction path to share this bounded dual-read adapter.
10. Release and verify that compatibility deployment in production before
    enabling the data rewrite. In a follow-up activation change, enable the
    idempotent schema-9 rewrite. `build:platform` may run it before `next build`
    because the live compatibility server already accepts both row versions;
    a later build failure must leave that server functional. Persist
    localization, stages, codebook, hash, and schema version together and
    preserve interview ids, locale, step indices, and networks.
11. Keep the dual-read adapter and database defaults for the rollback window.
    Never roll back to a pre-compatibility Fresco build after schema-9 rows
    exist, and do not let the compatibility deployment create new schema-8
    protocols.
12. Include locale in relevant administrative summaries only where it provides
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
- Compatibility-release setup leaves existing schema-8 protocol rows and
  hashes unchanged, while the deployed server starts/resumes interviews from
  mixed schema-8/schema-9 storage and writes only schema 9 for new imports.
- Simulate activation committing its database transaction and then failing
  before the new build activates. The still-live compatibility deployment
  must start, resume, and sync interviews for the migrated rows.
- Payload server/client equality and no hydration warning.
- Sync accepts declared locale, rejects arbitrary locale, and preserves freeze
  behavior for completed interviews. A legacy locale-less sync after database
  migration saves its network/current-step changes and leaves stored `und`
  intact.

**Acceptance criteria:**

- Fresco selects locale before first client render.
- Existing interviews remain resumable after schema/database migration.
- No schema-9 protocol row can lose its root localization declaration.
- No raw preference list is stored.
- The schema-9 row rewrite cannot run until the dual-read compatibility
  deployment has been released and verified.

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
3. Emit it in ego/session CSV output and as `nc:interviewLocale` in GraphML.
4. Map Interviewer `StoredSession.locale` and Fresco `Interview.locale` into
   export inputs.
5. Keep CSV attribute headers, GraphML key names, node/edge type names, and
   option values based on stable codebook names/values. Do not use localized
   labels for analysis identifiers.
6. Document `und` in exported legacy-migrated sessions.

**Tests:**

- Spanish, region-specific, RTL, and `und` values round-trip to CSV/GraphML.
- Switching interview locale does not change codebook-derived headers or keys.
- Multi-session exports retain each session's own locale.

**Acceptance criteria:**

- Researchers can determine the selected language for every exported session.
- Existing analysis field identity is locale-independent.

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
- Studio protocol round-trip, diff, validation, migration, and publish tests
- Any residual schema-version fixtures or documentation

**Work:**

1. Add `localization` to Studio's settings section and strict schema, and prove
   sectionize/assemble/diff/migrate/publish preserves it. Older stored section
   manifests assemble unchanged before canonical migration adds `und`.
2. Set `CURRENT_SCHEMA_VERSION = 9` and
   `CurrentProtocolSchema = ProtocolSchemaV9` only after the implementation
   from Milestones 1-9, including Studio compatibility work, compiles
   successfully on the branch.
3. Update current-version exports of interface-owned constants to schema 9.
   Keep explicit schema-version imports where migration code needs old values.
4. Confirm Interview's compatibility constant, Architect's typed constant,
   Interviewer, Fresco, and Studio all derive 9 without new numeric literals.
   Fresco's temporary stored-row migration gate is the explicit exception: it
   is not derived from that runtime constant and remains disabled for the
   compatibility release.
5. Run a literal-version search over active code, tests, scripts, fixture
   manifests, protocol archives, and documentation. Classify every remaining
   `8` as historical/versioned or fix it.
6. Run publish-export verification after a full build so the new helper and
   schema types are present in packed artifacts.
7. After the compatibility Fresco release is verified, make the follow-up
   activation change that enables its schema-9 row rewrite. Do not combine
   these into one deployment even if all branch tests pass.

**Acceptance criteria:**

- All modern hosts report schema 9 from their single source of truth.
- Studio round-trips the complete schema-9 settings section without dropping
  localization.
- No current host constructs or accepts a schema-8-shaped `CurrentProtocol`.
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
3. Incomplete Spanish prompt/hint: Spanish prompt, English hint with correct
   `lang` and warning.
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
    multilingual protocol without dropping localization.
11. Classic app attempts schema 9: clear incompatibility, no partial import.
12. Fresco compatibility build serves mixed stored versions; activation data
    migration commits, the subsequent build is forced to fail, and the still-
    live compatibility deployment continues new, resumed, and synced
    interviews.

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
   affected libraries and apps, including `@codaco/shared-consts` for the
   public session-locale export consumed by the externally bundled network
   exporter. This ensures npm and the latest-development-protocol delivery
   path actually receive schema 9 without an exporter/runtime version skew.
   Add a separate Studio-lane changeset for affected Studio packages. Do not
   mix Studio, Documentation, or Website with the normal lane or with one
   another.
2. Explain in release notes:
   - schema 9 and `LocalizedString`;
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

| Risk                                                              | Mitigation                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A participant-facing string is omitted from schema 9              | Complete the schema/render inventory before activation; metadata conformance fixture and compiler errors guard future drift.                           |
| Best-fit behavior differs between environments                    | Use the same FormatJS ponyfill everywhere and explicit `best fit`; run Node and browser contract tests.                                                |
| Browser/server hydration picks different languages                | Fresco selects and persists locale before render; client receives it and never redetects.                                                              |
| Missing translation becomes a production blocker                  | Keep coverage outside `validateProtocol`; assert incomplete fixtures import/run/download.                                                              |
| Fallback produces duplicate disease labels                        | Resolve and compare disease labels for every declared locale during schema-9 validation.                                                               |
| Locale removal corrupts localized maps                            | Use schema-tagged paths, atomic update, collision/empty checks, confirmation, and undo tests.                                                          |
| Translation changes alter export schema                           | Keep stable `name`, keys, and option values; test headers/GraphML keys across locales.                                                                 |
| Locale preference leaks identifying data                          | Persist/export only the selected declared locale, never the raw ordered preference list.                                                               |
| RTL mirrors graph data or breaks interaction                      | Scope direction to presentation, audit physical CSS/icons, and run matrix/visual/manual RTL checks.                                                    |
| New schema strands in-progress sessions                           | Preserve migration invariants; update hash, protocol, session locale, and references transactionally in each host.                                     |
| A legacy app tab erases or cannot sync locale-backed state        | Preserve freshest locale in current Interviewer writes, heal locale-less legacy rows, and accept omission at Fresco sync while retaining stored `und`. |
| Fresco rewrites rows before a compatible server is active         | Ship and verify an additive, dual-read compatibility deployment first; enable the data rewrite only in a follow-up activation change.                  |
| `und` is mistaken for English                                     | Dedicated warning and explicit relabel action; known first-party English sources are converted to `en-US`.                                             |
| Shared package bundle becomes unusable in CLI/worker              | Keep helpers framework-free, bundle FormatJS, and test source and packed ESM imports.                                                                  |
| Built-in English UI gives a false impression of full localization | State the boundary in Architect and docs; do not set document language globally for untranslated host chrome.                                          |

## Definition of done

- Schema 9 represents every protocol-authored participant string as a valid
  `LocalizedString` and retains stable semantic names/values.
- Incomplete translations validate, warn, preview, run, resume, and export.
- Undeclared keys, empty maps, invalid/canonicalization errors, and empty
  translations on fields with a nonempty content contract fail with exact
  paths.
- FormatJS best-fit matching and deterministic fallback are shared across
  Architect, Interviewer, Fresco server/client, and tests.
- Locale names/direction are derived, not protocol data.
- Architect can manage locales, edit all translations, inspect coverage,
  relabel `und`, and preview any locale.
- Interview locale is selected, user-changeable, persisted, and included in
  CSV/GraphML metadata.
- Schema-8 stored and imported protocols migrate without changing stages or
  collected answer shapes.
- Fresco persists the root localization declaration on import, read, migration,
  payload construction, and export; Studio round-trips it in protocol settings.
- Current-version constants are 9 across all modern consumers; Classic remains
  explicitly unsupported.
- Relevant tests, corpus validation, typecheck, lint, knip, builds, E2E,
  accessibility review, and inspected visual baselines pass.
- Changesets and migration documentation clearly communicate the breaking
  contract and the application-copy non-goal; both published compatibility
  protocol packages and the separate Studio release lane are included.
