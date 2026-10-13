# @codaco/network-exporters

## 4.0.0

### Major Changes

- 216e8c4: Architect, Interviewer and Fresco now download only the interface language you
  are using, instead of every translation at once. English needs no download at
  all, and starting in another language fetches that one language before the
  first screen appears, so the interface never shows English first and then
  switches. Changing language loads the new one and then switches over, keeping
  the current language on screen in the meantime. If a language cannot be
  downloaded, the app keeps working — in English at startup, or in the current
  language after a switch — and a notice names the language that could not be
  loaded and offers to reload; the language still switches in by itself if a
  later attempt succeeds. In an interview the same notice appears without the
  reload. Installed offline copies of Architect and Interviewer still hold every
  language, so switching works without a connection. A Fresco interview in
  another language now arrives with its messages, so it opens without waiting for
  a download, and Architect's preview and Interviewer fetch the interview's
  language while they prepare it rather than afterwards.

  Breaking: each package's catalog map is replaced by per-locale loaders.
  `commonCatalogs`, `frescoUiCatalogs`, `interviewCatalogs`,
  `networkExporterCatalogs`, `protocolUtilitiesCatalogs` and
  `protocolValidationCatalogs` become `commonCatalogLoaders`,
  `frescoUiCatalogLoaders`, `interviewCatalogLoaders`,
  `networkExporterCatalogLoaders`, `protocolUtilitiesCatalogLoaders` and
  `protocolValidationCatalogLoaders`: for each translated locale, a function that
  dynamically imports that locale's catalog. Combine them with
  `createCatalogSource(...)` from `@codaco/app-i18n/locales`, then either
  `await source.load(locale)` before rendering or pass the source to
  `useLocaleCatalog` from `@codaco/app-i18n/react`, which feeds
  `AppI18nProvider`. `loadCatalog(locale, ...loaders)` loads and merges one
  locale where no source is needed, and `checkCatalogLoaders` in
  `@codaco/app-i18n/catalog-guards` checks that every committed catalog has a
  loader that loads it. `InterviewI18nProvider` from `@codaco/interview` now
  suspends while the catalog for a language it has not shown yet loads, so a
  host that renders it directly needs a `Suspense` boundary above it; `Shell`
  brings its own and shows a spinner in the interview's frame meanwhile.

  A catalog that cannot be loaded no longer reaches an error boundary.
  `useLocaleCatalog` falls back to English for a first load, or keeps the current
  language for a switch, and returns the `failure`; pass it to `AppI18nProvider`
  as `loadFailure`, and read it anywhere below with `useLocaleLoadFailure()`.
  `@codaco/fresco-ui/LocaleLoadFailureToast` presents it as a toast that stays
  until the language arrives, with an optional `onReload` button and an
  `onFailure` callback for error reporting. A fresco-ui toast with both a
  description and an action button no longer pushes the button out of view.

  `Shell` takes an optional `catalog`, and the new `@codaco/interview/catalog`
  entry, which carries no React and can be imported on a server, exports
  `loadInterviewCatalog(requestedLocale, localePreference)`: it negotiates as
  `Shell` does and resolves to the `catalog` to pass, so a server-rendered host
  can deliver the interview's messages with the page and a client host can start
  the download before mounting `Shell`.

### Minor Changes

- 08fd0f7: Brazilian Portuguese (Português (Brasil), `pt-BR`) is now available as an
  interface language in Architect, Interviewer and Fresco, alongside English,
  Spanish and Simplified Chinese. Choose it from the language setting, or let it
  be selected automatically when your browser prefers Portuguese. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- ee4ad52: Dutch (Nederlands, `nl`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Dutch, whether from the
  Netherlands or Belgium. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- bff61d5: French (Français, `fr`) is now available as an interface language in
  Architect, Interviewer and Fresco, alongside English, Spanish and Simplified
  Chinese. Choose it from the language setting, or let it be selected
  automatically when your browser prefers French — including Canadian, Belgian
  and Swiss French. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- 62617a9: German (Deutsch, `de`) is now available as an interface language in Architect,
  Interviewer and Fresco, alongside English, Spanish and Simplified Chinese.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers German, including the Austrian and Swiss variants. The
  built-in interview controls participants see are translated too; protocol
  content keeps the language it was written in.
- 5b12f3b: Italian (Italiano, `it`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Italian. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- f32135f: Simplified Chinese (简体中文, `zh-Hans`) is now available as an interface
  language in Architect, Interviewer and Fresco, alongside English and Spanish.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers Chinese. The built-in interview controls participants see
  are translated too; protocol content keeps the language it was written in.
- e5f6a9a: Traditional Chinese (繁體中文, `zh-Hant`) is now available as an interface
  language in Architect, Interviewer and Fresco, written in Taiwan-standard
  vocabulary. Choose it from the language setting, or let it be selected
  automatically: browsers set to Chinese for Taiwan, Hong Kong or Macau now get
  Traditional Chinese instead of Simplified Chinese, while other Chinese browser
  languages still get Simplified Chinese. The built-in interview controls
  participants see are translated too; protocol content keeps the language it
  was written in.

  Chinese browser languages are now matched by script rather than by region.
  `resolveAppLocale` in `@codaco/app-i18n` maps each Chinese tag to its script
  first, so Hong Kong (`zh-HK`) and Macau (`zh-MO`) resolve to Traditional
  Chinese even when the browser also sends a generic `zh`, which previously won
  Simplified Chinese. `@codaco/shared-consts` exports the rule as
  `toScriptMatchingTag`, which the website uses too. A registry that declares a
  regional Chinese tag such as `zh-TW` exactly still receives that tag.

### Patch Changes

- 34965ed: CSV and GraphML exports now mark an answer `ENCRYPTED` only when it was
  saved encrypted. Before, the exporters followed the protocol's current
  setting, so an answer saved as plain text could be exported as `ENCRYPTED`.
  An answer saved encrypted could also be exported as unreadable data, if the
  protocol no longer asked for encryption. GraphML node labels follow the same
  rule. A plain-text answer that replaced an encrypted one is exported as
  itself, even where an earlier version left the encrypted answer's details
  saved alongside it.
- 56e16d0: Update third-party dependencies to their latest minor and patch releases, including Base UI 1.8, React Aria Components 1.21, Tiptap 3.31.4, Mapbox GL 3.32, Motion 13.4, Lucide 1.49, the Inclusive Sans and Nunito variable fonts 5.3, PostHog, Prisma 7.10 and Electron 43.7.
- 2659fb1: Support Effect 4.0.0. Effect 4.0.0 reversed the order of the tuple `Effect.partition` returns, so with it installed, export runs reported every formatted session as an error and every failed session as a result. The `effect` peer dependency is now `^4.0.0`.
- Updated dependencies ([c5dc35b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5dc35b889d75c4f21657ce473ef6ec030660e24), [08fd0f7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08fd0f7dc2c1a7b757b2caf64ae68aacaaf31572), [ee4ad52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ee4ad52b14e081d25f883d9d170454932749d5ab), [489bf51](https://github.com/complexdatacollective/network-canvas-monorepo/commit/489bf5173aad4d29e79c6a2a29d018223e369031), [bff61d5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bff61d58f17fbb7b021e6591da9575ed4c12cc16), [62617a9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/62617a9c21d7e6e200adc162417090a522fac1e6), [5b12f3b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5b12f3b977d4244c398301541d978d825f53ea13), [216e8c4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/216e8c4e1cc63357f121d65150851536996ef3af), [f32135f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f32135fd036f07157198728377dfdbeb30dff747), [56e16d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/56e16d0de03049200559dbf6bf07671689e4d99b), [3093df5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3093df504bae4a945b77a7441aefd04c6abb4a7f), [e5f6a9a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e5f6a9ac0760f4a67ba353996b43327a5d1b0855))
  - @codaco/protocol-validation@15.0.0
  - @codaco/app-i18n@0.3.0
  - @codaco/shared-consts@6.2.0

## 3.0.0

### Major Changes

- 8d4585b: Effect 4.

  `@codaco/network-exporters` is built against Effect 4 and no longer bundles or
  depends on Effect itself: `effect` is now a **peer dependency**
  (`^4.0.0-rc.115`). Install it alongside the package, or the package will not
  resolve at runtime. Effect 4 has no stable release yet, so ask for the release
  candidate by tag — `npm install effect@rc`. A plain `effect@^4` matches
  nothing, because a caret range with no prerelease component does not match a
  prerelease. The peer is what guarantees one Effect copy, and so one fiber
  runtime, in an application that also uses Effect directly.

  Two pieces of the package's public surface change shape with the major:

  - The three service tags — `InterviewRepository`, `ProtocolRepository` and
    `Output` — are `Context.Service` classes rather than `Context.Tag` classes.
    Providing them is unchanged (`Layer.succeed(Output, impl)` still works); only
    the declaration form differs, which matters if you were extending or
    re-declaring one.
  - `Fiber.RuntimeFiber` collapsed into `Fiber.Fiber` in Effect 4, so the sink
    handle that `makeZipOutput` carries is typed `Fiber.Fiber<OutputResult,
OutputError>`.

  Error classes are unchanged: they remain `Data.TaggedError`, so nothing in the
  package's public types pulls in Effect Schema.

  Fresco and Interviewer move to Effect 4 with it, and each picks up a fix to a
  drain that Effect 4 made visible:

  - Fresco's batch export flushes its remaining progress events by ending the
    queue and taking what is buffered. Effect 4's `Queue.takeAll` suspends on an
    open empty queue instead of returning nothing, and an empty queue at that
    point is the ordinary case, so the old line would have hung the export's
    response open indefinitely.
  - Interviewer's export runner now ends its event queue and joins the drain
    fiber before finishing, so every progress event has reached the UI callback
    before the export resolves. Previously the last events were delivered only
    because the pipeline happened to yield to the scheduler between them, and
    were dropped when it did not.

### Minor Changes

- 3ae3a94: Provide optional localized researcher guidance with complete Spanish catalogs:
  protocol import failures, migration approval notes and validation conflicts, synthetic generation
  refusals, and export progress. Applications can present this guidance in the
  active language while keeping existing technical diagnostics, event identifiers,
  and generated interview data unchanged.

  Synthetic generation guidance covers both `generateNetwork` and the public
  `SyntheticInterview` builder, including fixed-value conflicts and unsupported
  participant uniqueness rules.

  Protocol validation also exports `parseAcceptLanguage` for HTTP hosts to parse
  canonical, quality-ordered browser preferences through the shared locale
  negotiation flow.

### Patch Changes

- 5de44c1: Bump `@xmldom/xmldom` from 0.9.10 to 0.9.12, fixing several denial-of-service
  vulnerabilities in XML parsing and serialization: quadratic-memory namespace
  handling, quadratic-time duplicate-attribute de-duplication, and RAWTEXT
  closing-tag output amplification, among others. `@codaco/network-exporters`
  builds and serializes GraphML exports through this dependency, so npm
  consumers pinned to the previous floor need this patch to pick up the fix.
- Updated dependencies ([026b518](https://github.com/complexdatacollective/network-canvas-monorepo/commit/026b5188636452e20570bb4c15e055c8d6d000e8), [2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [e322f90](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e322f9040c9f5f4218ea8d7da1aa286ef4e719e9), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [02ead76](https://github.com/complexdatacollective/network-canvas-monorepo/commit/02ead76454267cb9fcc8e2810eb6189e6d3aabc9), [f84eb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f84eb32e7c776a088c412511183baf7e3b635021), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a), [9d9f310](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9d9f310867e490c073374df20689def7be163f47))
  - @codaco/app-i18n@0.2.0
  - @codaco/shared-consts@6.1.0
  - @codaco/protocol-validation@14.0.0

## 2.0.1

### Patch Changes

- Republish the intended 2.0.0 release under an available npm version. The
  `@codaco/network-exporters@2.0.0` version was already occupied by an unrelated
  legacy artifact, so Changesets skipped publishing the current package.

## 2.0.0

### Major Changes

- e9a6522: CSV and GraphML exports continue to declare Codebook variables when every response is unanswered under the new sparse-attribute contract. GraphML keys are now scoped correctly across ego, node, and edge data, including external attributes and colliding identifiers.

### Patch Changes

- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15))
  - @codaco/protocol-validation@13.0.0
  - @codaco/shared-consts@6.0.0

## 1.1.7

### Patch Changes

- 0bf9a05: The export pipeline now tears down the ZIP output sink when it is interrupted
  (releasing any buffered archive data), and yields to the host's event loop
  between stages and every 25 generated or written files so browser hosts can
  render the progress events they are sent.

## 1.1.6

### Patch Changes

- Updated dependencies [9c25292]
- Updated dependencies [c8c4614]
  - @codaco/protocol-validation@12.0.0

## 1.1.5

### Patch Changes

- 98a31e7: Widen the internal `@codaco/*` dependency ranges from exact pins to caret ranges. When you install several Network Canvas packages together, npm and pnpm can now resolve a single shared version of each common dependency instead of being forced to keep multiple exact-pinned copies side by side.
- Updated dependencies [c7e767c]
  - @codaco/protocol-validation@11.11.0

## 1.1.4

### Patch Changes

- Updated dependencies [34d2bfd]
  - @codaco/protocol-validation@11.10.0

## 1.1.3

### Patch Changes

- Updated dependencies [367e702]
- Updated dependencies [e6c58c2]
- Updated dependencies [c16a1d9]
- Updated dependencies [803e4e7]
- Updated dependencies [179952e]
- Updated dependencies [b467615]
  - @codaco/protocol-validation@11.9.0
  - @codaco/shared-consts@5.5.0

## 1.1.2

### Patch Changes

- Updated dependencies [272c1b2]
  - @codaco/protocol-validation@11.8.1

## 1.1.1

### Patch Changes

- Updated dependencies [38aff29]
- Updated dependencies [37006d0]
- Updated dependencies [fd2a7e2]
- Updated dependencies [a171f96]
- Updated dependencies [3218905]
- Updated dependencies [0f577dd]
- Updated dependencies [7970d1f]
- Updated dependencies [c56b75a]
  - @codaco/protocol-validation@11.8.0
  - @codaco/shared-consts@5.4.0

## 1.1.0

### Minor Changes

- 8be592d: Store categorical attribute values consistently as arrays of selected option values.

  Previously the CategoricalBin interface wrote a bare scalar while CheckboxGroup / ToggleButtonGroup wrote arrays, and consumers carried bridging helpers to tolerate both shapes. Categorical attributes are now always arrays (a single selection is a one-element array), and the bridges have been removed:

  - `interview`: `CategoricalBin` writes a single-element array; the node-shape resolver, categorical sorter, and bin matcher read the array contract directly.
  - `network-query`: `EXACTLY` / `NOT` use deep equality and `OPTIONS_*` use array length — the scalar-categorical fallbacks (`categoricalEqual`, scalar `optionsLength`) are gone.
  - `network-exporters`: `isCategoricalOptionSelected` checks array membership only.
  - `shared-consts`: `VariableValue` types categorical as an array of option values.
  - `protocol-validation`: the v7→v8 migration wraps existing scalar categorical filter / skip-logic rule operands (`EXACTLY` / `NOT` / `INCLUDES` / `EXCLUDES`) in a single-element array.
  - `interview` (FamilyPedigree): the `relationshipType` edge variable (a categorical) is now written and read as a single-element array, conforming to the contract so its values export and query correctly.
  - `shared-consts`: adds the canonical `RelationshipType` type and `RELATIONSHIP_TYPE_OPTIONS`, shared between Architect (which locks the categorical edge variable's options) and the FamilyPedigree interface so they cannot drift.

  Collected interview networks holding scalar categorical values must be migrated by the host application (tracked for Fresco).

### Patch Changes

- 24078da: Fix a CSV/formula-injection vulnerability (OWASP) in the CSV exporter. Exported
  cell values include untrusted, participant-entered interview data; a value
  beginning with a spreadsheet formula trigger (`=`, `+`, `-`, `@`, tab, or CR)
  could be evaluated as a formula when the CSV is opened in Excel / Google Sheets /
  LibreOffice (data exfiltration via `HYPERLINK`/`WEBSERVICE`, or command
  execution via DDE). `sanitizeCellValue` now prefixes such string values with a
  single quote so spreadsheets treat them as literal text. This covers all CSV
  output (attributeList, edgeList, egoList, adjacencyMatrix). Existing
  quote-wrapping/escaping and non-string passthrough behavior are preserved.
- Updated dependencies [dd13556]
- Updated dependencies [8be592d]
- Updated dependencies [545edda]
- Updated dependencies [d0ca1be]
  - @codaco/protocol-validation@11.7.0
  - @codaco/shared-consts@5.3.0

## 1.0.3

### Patch Changes

- Dependency bump: `fflate` (→ ^0.8.3).

## 1.0.2

### Patch Changes

- ae81956: Fix `.d.ts` output paths for the multi-entry build. Types were being emitted at `dist/src/<name>.d.ts` while `package.json` declared them at `dist/<name>.d.ts`, breaking type resolution for every subpath export. Configure `vite-plugin-dts` with `entryRoot: "src"` so types land alongside their JS counterparts.

## 1.0.1

### Patch Changes

- 23efeeb: Update @xmldom/xmldom from ^0.9.9 to ^0.9.10 to address the security advisory flagged by pnpm install. No API changes; typecheck, tests, and build all pass cleanly.

## 1.0.0

### Major Changes

- 4335dee: Complete rewrite of `@codaco/network-exporters` as an Effect-TS export pipeline for Network Canvas interview sessions. The previous 0.1.x package was a collection of stand-alone formatters; v1.0.0 ships an end-to-end pipeline (fetch → format → generate → archive → upload → cleanup) that consumers integrate via three injected service Tags.

  ### Public API

  The package now uses **multi-entry-point exports** instead of a single barrel. Each public concern is its own sub-path:

  - `@codaco/network-exporters/pipeline` — `exportPipeline(ids, options, queue)` returning an `Effect.Effect<ExportReturn, ExportError, …>`
  - `@codaco/network-exporters/options` — `ExportOptions`, `ExportOptionsSchema`, `ExportFormat`
  - `@codaco/network-exporters/input` — `InterviewExportInput`, `ProtocolExportInput`, `parseNcNetwork`, plus session shape types
  - `@codaco/network-exporters/output` — `ExportResult`, `ExportSuccess`, `ExportFailure`, `ExportReturn`, `ArchiveResult`
  - `@codaco/network-exporters/events` — `ExportEvent`, stage/progress event shapes, `stageMessages`
  - `@codaco/network-exporters/errors` — tagged error classes, `ExportError` union, `describeExportError`
  - `@codaco/network-exporters/services/{InterviewRepository, FileStorage, FileSystem}` — Context.Tags consumers provide via Layers
  - `@codaco/network-exporters/layers/NodeFileSystem` — built-in `node:fs` implementation of the `FileSystem` Tag

  ### New capabilities
  - **Streaming upload end-to-end.** The archive zip is piped from disk through `FileStorage.upload(stream, fileName)` rather than buffered into a `Buffer`. S3 implementations can use `@aws-sdk/lib-storage`'s `Upload` for multipart streaming with per-part retries.
  - **Configurable concurrency.** Per-file generation runs through `Effect.forEach` with `concurrency` defaulting to `os.cpus().length`; consumers can override via `ExportOptions.concurrency`.
  - **Tagged errors with structured classification.** Every error is a `Data.TaggedError` (namespaced `NetworkExporters/<Name>`). `describeExportError(error, stage?)` derives user-facing messages by inspecting the cause's class/`code` (e.g. `ENOSPC`, `ECONNREFUSED`, OOM patterns) before falling back to a tag-aware default. The `userMessage` field that previously had to be passed at every throw site is gone.
  - **Fatal-vs-partial error model.** Per-file generation failures resolve as `ExportFailure` entries on the returned `ExportReturn`; the pipeline still produces a usable archive of the successful files. Pipeline-fatal errors (database, archive, storage) flow through Effect's failure channel as before.
  - **Progress events.** `exportPipeline` writes `ExportStageEvent`/`ExportProgressEvent` to a consumer-supplied `Queue.Enqueue<ExportEvent>`, supporting SSE-style streaming UIs without coupling the package to any wire format.
  - **Cleanup on all paths.** Temp file deletion is wrapped in `Effect.ensuring` so it runs on success and failure paths alike.
  - **Self-contained input contract.** `InterviewExportInput` is owned by the package; consumers map their database rows (via `parseNcNetwork(unknown)`) at the adapter boundary rather than passing Prisma/ORM types through. Eliminates the previous `as unknown as NcNetwork` cast that propagated through the formatters.

  ### CSV formatters

  The four CSV formatters (`attributeList`, `edgeList`, `egoList`, `adjacencyMatrix`) are rewritten as typed `function*` generators returning row strings. Each is wrapped in a `Readable.from(...)` adapter at the I/O edge, replacing the prior class-based `writeToStream` API. Generators are unit-testable as plain `Iterable<string>` without stream machinery.

  ### Build, dependencies, and tooling
  - Build via `tsgo --noEmit && vite build` with `vite-plugin-dts`; multiple library entry points emit alongside `.d.ts` files.
  - Runtime dependencies (`effect`, `archiver`, `sanitize-filename`, `@xmldom/xmldom`, `ohash`) added to the workspace catalog.
  - Package re-included in monorepo-wide `build`, `test`, `typecheck`, and `knip` runs (the prior 0.1.x package was excluded).
  - Comprehensive README documenting the architecture, public surface, error model, concurrency, progress events, and local development workflow.

  ### Breaking changes

  This is a major version bump and shares no API with 0.1.x. Consumers must:

  1. Replace stand-alone formatter calls with `exportPipeline(...)` + Layer composition.
  2. Provide their own `InterviewRepository` and `FileStorage` Layer implementations (or use the built-in `NodeFileSystem` for the filesystem service).
  3. Update imports to the relevant sub-path (no top-level barrel).

- fe48a62: Runtime-agnostic redesign. Removes Node-only types from the public surface and the core pipeline. Three injected services (`InterviewRepository`, `ProtocolRepository`, `Output`) replace the previous `InterviewRepository` + `FileStorage` + `FileSystem` trio. Streams flow as `AsyncIterable<Uint8Array>`. Bundling is a host concern; the package ships `makeZipOutput` (pure-JS via fflate) for hosts that want today's bundled-zip behaviour.

  Breaking changes:

  - `InterviewExportInput.protocol` is replaced by `InterviewExportInput.protocolHash`. Hosts implement a new `ProtocolRepository` Tag that returns `Record<hash, ProtocolExportInput>` for unique hashes.
  - `FileStorage` and `FileSystem` Tags are replaced by a single stateful `Output` Tag (`begin`/`writeEntry`/`end`). The shipped `NodeFileSystem` layer is removed.
  - `parseNcNetwork` is removed from public exports; hosts call `NcNetworkSchema.parse()` directly.
  - `ExportReturn.zipUrl` / `zipKey` are replaced by `ExportReturn.output: OutputResult` (host-defined).
  - `ExportFailure` is now a tagged union with `kind: "generation" | "protocol-missing" | "session-processing"`.
  - `FileStorageError`, `FileSystemError`, and `ArchiveError` are collapsed into a single `OutputError`.
  - The `archiving` and `uploading` stage event values are replaced by a single `outputting` value.

  Hosts that previously wrapped the package as in the README's `S3Storage` example migrate by replacing the `FileStorage` Layer with `makeZipOutput(s3Sink)`, splitting protocol joins out of `InterviewRepository.getForExport`, and adding a small `ProtocolRepository` Layer that batch-fetches protocols by hash.

### Patch Changes

- Updated dependencies [f1dbd8d]
  - @codaco/protocol-validation@11.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [b8b9fb0]
  - @codaco/protocol-validation@11.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [4f2d778]
  - @codaco/protocol-validation@11.1.1
