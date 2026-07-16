# @codaco/network-exporters

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
