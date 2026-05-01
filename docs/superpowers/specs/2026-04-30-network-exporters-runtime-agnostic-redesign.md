# Network Exporters: Runtime-agnostic redesign

**Status:** design
**Date:** 2026-04-30
**Package:** `@codaco/network-exporters`

## 1. Goals

A runtime-agnostic export pipeline that runs unchanged on Node, browser, and Cloudflare Workers. Hosts plug in three Effect Layers (`InterviewRepository`, `ProtocolRepository`, `Output`) and call `exportPipeline`. The package owns no persistence and pulls in no `node:*` modules from its core.

Specifically, this redesign:

1. Removes Node-only types (`Readable`, `archiver`, `tmpdir`, `node:fs`) from the public surface and the core pipeline. Streams flow through the package as `AsyncIterable<Uint8Array>` — the lowest common denominator across Node `Readable`, Web `ReadableStream`, and Workers.
2. Generalises "Archiving" / "Uploading" into a single host-implemented `Output` service with explicit `begin → writeEntry × N → end` lifecycle. Bundling (zip vs. loose folder vs. blob) is the host's choice. The package ships one default `ZipOutput` layer for hosts that want today's bundled-zip behaviour.
3. Splits the protocol from the per-session payload. Sessions reference a `protocolHash`; a new `ProtocolRepository` resolves unique hashes once per pipeline run. Cuts protocol-fetch cost from O(sessions) to O(unique protocols).
4. Routes per-session failures (missing protocol, malformed session, generation error) through a single tagged `failedExports` array. The processing chain becomes a sequence of named Effects with spans and per-session error catches.
5. Drops `parseNcNetwork` from the public surface. Hosts call `NcNetworkSchema.parse()` directly.

Out of scope: shipping a browser consumer, a Workers smoke test, formatter implementation changes (CSV/GraphML logic) beyond their stream return type, and `fflate` performance benchmarking.

## 2. Architecture

### 2.1 Service surface

Three Tags:

| Tag | Replaces | Responsibility |
| --- | --- | --- |
| `InterviewRepository` | (unchanged Tag, new shape) | `getForExport(ids)` returns sessions referencing protocols by hash |
| `ProtocolRepository` | *new* | `getProtocols(hashes)` returns `Record<hash, ProtocolExportInput>` for unique hashes the pipeline encountered |
| `Output` | replaces `FileStorage` + `FileSystem` | Stateful `begin → writeEntry × N → end` lifecycle; consumes `OutputEntry { name, data: AsyncIterable<Uint8Array> }` per entry; returns a host-defined `OutputResult` |

### 2.2 Removed from the public surface

- `services/FileStorage` Tag
- `services/FileSystem` Tag
- `layers/NodeFileSystem` layer
- `input.parseNcNetwork`
- `errors.FileStorageError`, `errors.FileSystemError`, `errors.ArchiveError` (`OutputError` covers all three)
- `output.zipUrl`, `output.zipKey` (replaced by `output.output: OutputResult`)
- `events.ExportStage` values `"archiving"` and `"uploading"` (replaced by `"outputting"`)
- All `node:fs`, `node:os`, `node:stream`, `archiver` imports in core pipeline code
- `archive.ts` (subsumed into shipped `ZipOutput`)
- The temp-file dance inside `exportFile.ts`

### 2.3 Shipped `Output` implementation

`makeZipOutput((zipStream, fileName) => Effect<OutputResult, OutputError>)` — pure-JS zip via `fflate`. Lives at `@codaco/network-exporters/layers/ZipOutput`. Host passes a single sink callback that consumes the zip bytes; factory returns a `Layer<Output>`. Replaces today's `archive.ts` + `S3Storage`-style `FileStorage` together. `fflate` is added as a direct dependency of this package, not the workspace catalog.

### 2.4 Data flow

```
InterviewRepository.getForExport(ids)
  → unique-hash extraction
  → ProtocolRepository.getProtocols(uniqueHashes)
  → drop sessions with missing protocols (→ failedExports)
  → format / insertEgo / group / resequence (per-stage Effects, per-session catches)
  → generate (per-format/partition fan-out, AsyncIterable<Uint8Array> per file)
  → Output.begin → for each successful entry ⇒ Output.writeEntry → Output.end
  → ExportReturn
```

### 2.5 Stages

```ts
type ExportStage = "fetching" | "formatting" | "generating" | "outputting";
```

Four stages. `archiving` is gone. `uploading` is renamed to `outputting` and covers `begin` + every `writeEntry` + `end`. Per-entry progress events are emitted during both `generating` (per file produced) and `outputting` (per file written). Cleanup phase is gone — the pipeline allocates no persistent state.

## 3. Service interfaces

```ts
// services/InterviewRepository.ts
class InterviewRepository extends Context.Tag("NetworkExporters/InterviewRepository")<
  InterviewRepository,
  {
    readonly getForExport: (
      ids: readonly string[],
    ) => Effect.Effect<InterviewExportInput[], DatabaseError>;
  }
>() {}

// input.ts — protocol no longer inlined per session
type InterviewExportInput = {
  id: string;
  participantIdentifier: string;
  startTime: Date;
  finishTime: Date | null;
  network: NcNetwork;
  protocolHash: string;
};

// services/ProtocolRepository.ts — new
type ProtocolExportInput = {
  hash: string;
  name: string;
  codebook: Codebook;
};

class ProtocolRepository extends Context.Tag("NetworkExporters/ProtocolRepository")<
  ProtocolRepository,
  {
    readonly getProtocols: (
      hashes: readonly string[],
    ) => Effect.Effect<Record<string, ProtocolExportInput>, DatabaseError>;
  }
>() {}

// services/Output.ts — replaces FileStorage + FileSystem
type OutputEntry = { name: string; data: AsyncIterable<Uint8Array> };

type OutputResult = {
  readonly key?: string;
  readonly url?: string;
  readonly [k: string]: unknown;
};

type OutputHandle = unknown;

class Output extends Context.Tag("NetworkExporters/Output")<
  Output,
  {
    readonly begin: () => Effect.Effect<OutputHandle, OutputError>;
    readonly writeEntry: (
      handle: OutputHandle,
      entry: OutputEntry,
    ) => Effect.Effect<void, OutputError>;
    readonly end: (handle: OutputHandle) => Effect.Effect<OutputResult, OutputError>;
  }
>() {}
```

Notes:

- `getForExport` does less work than today — no protocol joins. Hosts that used `include: { protocol: true }` drop that.
- `getProtocols` is called once per pipeline run with the deduplicated hash set. Pipeline owns dedup; the repo is a dumb keyed lookup.
- Sessions whose `protocolHash` isn't in the returned map are dropped to `failedExports` with `kind: "protocol-missing"`.
- `OutputHandle` is opaque to the pipeline — the host stores anything it wants in it (an open zip stream, an active multipart upload, an OPFS dir handle).

## 4. Error model

### 4.1 Tagged errors

```ts
// Existing — unchanged
DatabaseError              // raised by either repo
ExportGenerationError      // partial channel, per file

// Renamed
OutputError                // ← was: FileStorageError; raised by Output.{begin,writeEntry,end}
                           //   ZipOutput's fflate failures and sink-callback failures both
                           //   surface as OutputError; hosts that need to disambiguate
                           //   inspect error.cause

// New — partial channel
ProtocolNotFoundError { hash: string; sessionId: string }
SessionProcessingError {
  cause: unknown;
  stage: "format" | "insertEgo" | "resequence";
  sessionId: string;
}

// Removed
FileSystemError            // FileSystem service is gone
ArchiveError               // no separate archive stage; collapsed into OutputError
```

### 4.2 Channel routing

| Error | Channel | Behaviour |
| --- | --- | --- |
| `DatabaseError` | fatal | aborts pipeline (raised by either repo) |
| `ProtocolNotFoundError` | partial | one entry per dropped session in `failedExports` |
| `SessionProcessingError` | partial | one entry per failing session per stage in `failedExports` |
| `ExportGenerationError` | partial | unchanged |
| `OutputError` | fatal | aborts pipeline (raised by `Output.{begin,writeEntry,end}` — covers former `FileStorageError` and `ArchiveError`) |

A failure inside `Output.writeEntry` is fatal — once partial bytes are in the host's bundle, retrying inline is the host's job, not the pipeline's. Hosts that need retry semantics implement them inside their `Output` layer.

### 4.3 `ExportSuccess` and `ExportFailure` shapes

```ts
type ExportSuccess = {
  readonly success: true;
  readonly format: ExportFormat;
  readonly sessionId: string;
  readonly partitionEntity?: string;
  readonly name: string;          // ← was filePath; now the entry name written to Output
};

type ExportFailure =
  | { kind: "generation";
      sessionId: string;
      format: ExportFormat;
      partitionEntity?: string;
      error: ExportGenerationError }
  | { kind: "protocol-missing";
      sessionId: string;
      error: ProtocolNotFoundError }
  | { kind: "session-processing";
      sessionId: string;
      error: SessionProcessingError };
```

`ExportSuccess.filePath` is gone (no temp files). It's replaced by `name` — the entry name passed to `Output.writeEntry`. Host iterates `failedExports` once and dispatches on `kind`. `describeExportError` handles the new tags.

### 4.4 `ExportReturn`

```ts
type ExportReturn = {
  readonly status: "success" | "partial";
  readonly successfulExports: ExportSuccess[];
  readonly failedExports: ExportFailure[];
  readonly output: OutputResult;
};
```

`status` is `"partial"` whenever `failedExports.length > 0`, regardless of which kind populated it. The old `zipUrl` / `zipKey` fields are gone — hosts that want a URL read `result.output.url`. The host-defined `OutputResult` is passed through unchanged.

## 5. Effectful processing chain

Each named Effect inside the `formatting` stage carries its own span and a per-session error catch where applicable:

```
sessions: InterviewExportInput[]
   │
   ▼ collectProtocolHashes (pure, batch)
hashes: Set<string>
   │
   ▼ ProtocolRepository.getProtocols(hashes)        [span: format.fetchProtocols]
protocols: Record<hash, ProtocolExportInput>        // fatal: DatabaseError
   │
   ▼ partitionByProtocolAvailability                [span: format.partitionMissing]
{ resolvable, missing[] }   // missing → failedExports as { kind: "protocol-missing" }
   │
   ▼ buildSessionVariables (per-session Effect)     [span: format.buildVariables]
formatted: FormattedSession[]   // per-session catch → SessionProcessingError("format")
   │
   ▼ insertEgoIntoSessionNetworks (per-session)     [span: format.insertEgo]
withEgo: SessionWithNetworkEgo[]   // per-session catch → SessionProcessingError("insertEgo")
   │
   ▼ groupByProtocolHash (pure, batch)              [span: format.group]
grouped: Record<hash, SessionWithNetworkEgo[]>
   │
   ▼ resequenceIds (per-session Effect)             [span: format.resequence]
resequenced: Record<hash, SessionWithResequencedIDs[]>
                                                   // per-session catch → SessionProcessingError("resequence")
```

### 5.1 Per-session catch pattern

The three per-session steps share one wrapper:

```ts
const perSession = <A>(
  stage: SessionProcessingError["stage"],
  fn: (s: InterviewExportInput) => Effect.Effect<A, unknown>,
) =>
  (sessions: InterviewExportInput[]) =>
    Effect.partition(sessions, (s) =>
      fn(s).pipe(
        Effect.mapError((cause) =>
          new SessionProcessingError({ cause, stage, sessionId: s.id }),
        ),
      ),
    );
// returns [errors, successes] — errors flow to failedExports, successes to next step
```

Failed sessions accumulate into a single `Ref<ExportFailure[]>` carried through the pipeline; `outputting` reads from it at the end alongside generation failures.

### 5.2 Pure functions stay pure

`collectProtocolHashes` and `groupByProtocolHash` are trivial transforms with no failure mode worth tagging. They stay as plain functions called inside the chain.

## 6. Stage events and progress

### 6.1 Events

```ts
type ExportStageEvent = {
  type: "stage";
  stage: ExportStage;
  message: string;
};

type ExportProgressEvent = {
  type: "progress";
  stage: "generating" | "outputting";
  current: number;
  total: number;
};

type ExportEvent = ExportStageEvent | ExportProgressEvent;
```

Same `progress` shape used in two stages. Existing UI code that drew a bar for `"generating"` works unchanged for `"outputting"`.

### 6.2 Outputting loop

```
emit { type: "stage", stage: "outputting", message: stageMessages.outputting }
const handle = yield* Output.begin()
let written = 0
const total = successfulGeneratedEntries.length
for (const entry of successfulGeneratedEntries) {
  yield* Output.writeEntry(handle, entry)
  written++
  emit { type: "progress", stage: "outputting", current: written, total }
}
const result = yield* Output.end(handle)
```

`begin` and `end` errors abort the pipeline. A `writeEntry` failure also aborts (see §4.2). Effect's interruption propagates naturally — the formatter generators stop being pulled, and the host's `Output` implementation handles its own resource finalisation via `Effect.acquireRelease` if it allocated anything in `begin`.

## 7. `ZipOutput`

Lives at `@codaco/network-exporters/layers/ZipOutput`.

```ts
type ZipSink = (
  zipStream: AsyncIterable<Uint8Array>,
  fileName: string,
) => Effect.Effect<OutputResult, OutputError>;

const ARCHIVE_PREFIX = "networkCanvasExport";

export const makeZipOutput = (sink: ZipSink): Layer.Layer<Output> =>
  Layer.succeed(Output, {
    begin: () =>
      Effect.sync(() => {
        const fileName = `${ARCHIVE_PREFIX}-${Date.now()}.zip`;
        const stream = createFflateZipStream();
        const sinkPromise = Effect.runPromise(sink(stream.iterable, fileName));
        return { fileName, stream, sinkPromise };
      }),

    writeEntry: (handle, entry) =>
      Effect.tryPromise({
        try: () => handle.stream.appendEntry(entry.name, entry.data),
        catch: (cause) => new OutputError({ cause }),
      }),

    end: (handle) =>
      Effect.tryPromise({
        try: async () => {
          await handle.stream.finalize();
          return await handle.sinkPromise;
        },
        catch: (cause) => new OutputError({ cause }),
      }),
  });
```

`createFflateZipStream()` is an internal helper that wraps `fflate.Zip` into an async-iterable streaming interface — chunks are pulled, not pushed; the consumer's pace is the producer's pace.

### 7.1 Reference host integrations (README only)

```ts
// 1. S3 multipart (Node) — replaces today's FileStorage.
const S3ZipOutput = makeZipOutput((stream, fileName) =>
  Effect.tryPromise({
    try: async () => {
      await new Upload({
        client: s3,
        params: { Bucket, Key: fileName, Body: Readable.from(stream) },
      }).done();
      return { key: fileName, url: await presign(fileName) };
    },
    catch: (cause) => new OutputError({ cause }),
  }),
);

// 2. Browser download — single blob.
const BlobZipOutput = makeZipOutput((stream) =>
  Effect.tryPromise({
    try: async () => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      const blob = new Blob(chunks, { type: "application/zip" });
      return { blob, url: URL.createObjectURL(blob) };
    },
    catch: (cause) => new OutputError({ cause }),
  }),
);

// 3. Browser folder (no zip) — OPFS, one entry per file.
//    Implements Output directly; doesn't use ZipOutput.
const OPFSFolderOutput = Layer.succeed(Output, {
  begin: () => Effect.tryPromise({
    try: async () => ({
      dir: await navigator.storage.getDirectory()
        .then((root) => root.getDirectoryHandle(`export-${Date.now()}`, { create: true })),
    }),
    catch: (cause) => new OutputError({ cause }),
  }),
  writeEntry: (handle, entry) => Effect.tryPromise({
    try: async () => {
      const file = await handle.dir.getFileHandle(entry.name, { create: true });
      const writable = await file.createWritable();
      for await (const chunk of entry.data) await writable.write(chunk);
      await writable.close();
    },
    catch: (cause) => new OutputError({ cause }),
  }),
  end: (handle) => Effect.succeed({ folderHandle: handle.dir }),
});
```

(3) is the existence proof for "output to a folder, not a zip" — it compiles against the same package surface, no special-casing.

## 8. Public surface

```
@codaco/network-exporters/pipeline                  exportPipeline
@codaco/network-exporters/options                   ExportOptions, ExportOptionsSchema, ExportFormat
@codaco/network-exporters/input                     InterviewExportInput, ProtocolExportInput,
                                                    FormattedSession, SessionVariables,
                                                    SessionWithNetworkEgo, SessionWithResequencedIDs
@codaco/network-exporters/output                    ExportResult, ExportSuccess, ExportFailure,
                                                    ExportReturn, OutputEntry, OutputResult
@codaco/network-exporters/events                    ExportEvent, ExportStageEvent,
                                                    ExportProgressEvent, stageMessages
@codaco/network-exporters/errors                    DatabaseError, OutputError,
                                                    ExportGenerationError, ProtocolNotFoundError,
                                                    SessionProcessingError, ExportError,
                                                    describeExportError
@codaco/network-exporters/services/InterviewRepository    InterviewRepository
@codaco/network-exporters/services/ProtocolRepository     ProtocolRepository
@codaco/network-exporters/services/Output                 Output
@codaco/network-exporters/layers/ZipOutput                makeZipOutput
```

`vite.config.ts` `build.lib.entry` and `package.json#exports` are updated to match. Removed entries' `dist/*.js` files no longer emit.

## 9. Dependencies

- Add: `fflate` (direct package dep, externalised in vite config).
- Remove: `archiver`, `@types/archiver`.
- Remove from imports throughout core: `node:fs`, `node:fs/promises`, `node:os`, `node:path`, `node:stream`.

## 10. Migration: Fresco

Three changes in the consumer:

1. `InterviewRepository.getForExport` — drop the `protocol: true` Prisma include. Map each row to `{ id, participantIdentifier, startTime, finishTime, network: NcNetworkSchema.parse(row.network), protocolHash: row.protocol.hash }`.
2. New `ProtocolRepository` Layer — query `prisma.protocol.findMany({ where: { hash: { in: hashes } } })` and return the keyed map.
3. Replace `S3Storage` with `makeZipOutput(s3Sink)` where `s3Sink` consumes an async-iterable instead of a Node `Readable` (use `Readable.from(asyncIterable)` for the AWS SDK call).

Rough size: ~30 lines of host change.

## 11. Testing

| Area | Approach |
| --- | --- |
| Pure transforms (`groupByProtocolHash`, `partitionByType`, etc.) | Existing unit tests; minor changes for renamed types |
| Per-session formatting steps | New unit tests asserting bad input produces a `SessionProcessingError` in `failedExports`, not a thrown exception |
| `ProtocolRepository` integration | New pipeline test using an in-memory repo that returns a partial map; assert missing-protocol sessions land in `failedExports` with `kind: "protocol-missing"` |
| `Output` lifecycle | New unit tests with a fake `Output` Tag that records `begin/writeEntry/end` calls; assert `writeEntry` is called once per successful generation result |
| `makeZipOutput` | Unit test that pipes a few entries through a fake sink, then unzips the captured bytes and asserts contents |
| End-to-end | Existing `pipeline.test.ts` updated to wire all three Layers (`InterviewRepository`, `ProtocolRepository`, `makeZipOutput` over an in-memory sink) and assert the final `ExportReturn` |

A browser smoke test is out of scope. The package is verified to be browser-*compatible* by ensuring no `node:*` imports survive in the published `dist/`.

## 12. Implementation order

Suggested sequence for the implementation plan:

1. **Errors and types.** Update `errors.ts`, `output.ts`, `input.ts`, `events.ts` with the new shapes. Compiles broken at this point — that's fine.
2. **New services.** Add `ProtocolRepository`, `Output`. Delete `FileStorage`, `FileSystem`, `NodeFileSystem`. Update `package.json#exports` and `vite.config.ts`.
3. **Effectful processing chain.** Refactor `formatExportableSessions`, `insertEgoIntoSessionNetworks`, `resequenceIds`, plus the new protocol-fetch and partition-missing steps, into per-stage Effects with the `perSession` wrapper.
4. **Formatter return type swap.** `Readable` → `AsyncIterable<Uint8Array>` across all five formatters. Rewrite `exportFile.ts` to no longer touch tempdir — it produces `OutputEntry { name, data }` directly.
5. **Pipeline outputting stage.** Replace `archive.ts` with the in-pipeline iteration that calls `Output.writeEntry`. Ship `makeZipOutput` at `layers/ZipOutput`.
6. **Tests, README, changeset.** Update existing tests to the new shape; add new tests per §11; rewrite the README around the new three-Tag model and `ZipOutput`; add a changeset (this is a major version bump).
