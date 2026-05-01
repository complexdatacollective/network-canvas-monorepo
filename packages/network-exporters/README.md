# @codaco/network-exporters

A runtime-agnostic [Effect-TS](https://effect.website) pipeline that exports Network Canvas interview sessions to GraphML and CSV. Hosts plug in three Layers (`InterviewRepository`, `ProtocolRepository`, `Output`) and call `exportPipeline`. The package owns no persistence, pulls in no `node:*` modules from its core, and runs unchanged on Node, browsers, and Cloudflare Workers.

```ts
import { Effect, Layer, Queue } from "effect";
import { exportPipeline } from "@codaco/network-exporters/pipeline";
import type { ExportEvent } from "@codaco/network-exporters/events";
import { makeZipOutput } from "@codaco/network-exporters/layers/ZipOutput";

const layer = Layer.mergeAll(
	MyInterviewRepository, // workspace-specific
	MyProtocolRepository,  // workspace-specific
	makeZipOutput(mySink), // ships with this package
);

const program = Effect.gen(function* () {
	const queue = yield* Queue.unbounded<ExportEvent>();
	return yield* exportPipeline(interviewIds, exportOptions, queue);
});

const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
// → { status, successfulExports, failedExports, output }
```

---

## Why a package

Export logic was historically embedded in [Fresco](https://github.com/complexdatacollective/Fresco) and other Network Canvas applications. This package extracts the pipeline as a self-contained, host-agnostic library so:

- Multiple applications can share the same export semantics and file formats.
- The pipeline is testable in isolation (no Prisma, no S3, no temp files).
- Database, protocol storage, and output destinations are pluggable via Effect Layers.
- Streams flow end-to-end as `AsyncIterable<Uint8Array>` — the lowest common denominator across Node `Readable`, Web `ReadableStream`, and Workers — so the same package runs in every runtime.

---

## Architecture

```text
┌──────────────────── consumer (host application) ─────────────────────┐
│                                                                       │
│  Provides Layers for these Tags ─────────────┐                        │
│                                              ▼                        │
│              ┌───────────────────── exportPipeline ─────────────────┐ │
│              │                                                     │ │
│              │  fetching → formatting → generating → outputting    │ │
│              │     ▲           ▲             ▲            ▲        │ │
│              │     │           │             │            │        │ │
│   Interview ─┘  Protocol     pure         per-format    Output     │ │
│   Repository    Repository  (in-process)   fan-out      lifecycle  │ │
│                                                       (begin/write/│ │
│                                                          end)      │ │
│              └─────────────────────────────────────────────────────┘ │
│                                              │                        │
│                                              ▼                        │
│                            ExportReturn { status,                     │
│                                           successfulExports,          │
│                                           failedExports,              │
│                                           output: OutputResult }      │
└───────────────────────────────────────────────────────────────────────┘
```

Three injected services (`Context.Tag`s) form the package's input/output boundary:

| Service               | Provided by | Responsibility                                                                                 |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `InterviewRepository` | Host        | `getForExport(ids)` returns sessions referencing protocols by hash                             |
| `ProtocolRepository`  | Host        | `getProtocols(hashes)` returns `Record<hash, ProtocolExportInput>` for unique hashes           |
| `Output`              | Host (or shipped `makeZipOutput`) | Stateful `begin → writeEntry × N → end`; consumes `OutputEntry { name, data }` per entry |

Sessions reference protocols by hash, so the pipeline fetches each unique protocol exactly once per run regardless of how many sessions share it. The `Output` service is stateful: `begin` produces an opaque handle, the pipeline writes one entry per successful generation result, and `end` returns a host-defined `OutputResult` that flows out via `ExportReturn.output`.

The host's only responsibilities are:

1. Implement the three service Layers.
2. Call `exportPipeline(ids, options, queue)` and surface progress events.

---

## Public surface

Imports use sub-paths — the package has no barrel export.

| Sub-path | Exports |
| --- | --- |
| `@codaco/network-exporters/pipeline` | `exportPipeline`, type `ExportedProtocol` |
| `@codaco/network-exporters/options` | `ExportOptions`, `ExportOptionsSchema`, type `ExportFormat` |
| `@codaco/network-exporters/input` | `InterviewExportInput`, `ProtocolExportInput`, plus session shape types (`FormattedSession`, `SessionVariables`, `SessionWithNetworkEgo`, `SessionWithResequencedIDs`) |
| `@codaco/network-exporters/output` | `ExportResult`, `ExportSuccess`, `ExportFailure`, `ExportReturn`, `OutputEntry`, `OutputResult`, `OutputHandle` |
| `@codaco/network-exporters/events` | `ExportEvent`, `stageMessages` |
| `@codaco/network-exporters/errors` | `DatabaseError`, `OutputError`, `ExportGenerationError`, `ProtocolNotFoundError`, `SessionProcessingError`, type `ExportError`, `describeExportError` |
| `@codaco/network-exporters/services/InterviewRepository` | `InterviewRepository` Tag |
| `@codaco/network-exporters/services/ProtocolRepository` | `ProtocolRepository` Tag |
| `@codaco/network-exporters/services/Output` | `Output` Tag |
| `@codaco/network-exporters/layers/ZipOutput` | `makeZipOutput`, type `ZipSink` |

Everything else (formatters, session helpers, dispatch logic, internal zip stream helpers) is internal and not exported.

---

## Usage

### 1. Provide an `InterviewRepository`

```ts
import { Effect, Layer } from "effect";
import { NcNetworkSchema } from "@codaco/shared-consts";
import { DatabaseError } from "@codaco/network-exporters/errors";
import type { InterviewExportInput } from "@codaco/network-exporters/input";
import { InterviewRepository } from "@codaco/network-exporters/services/InterviewRepository";

export const PrismaInterviewRepository = Layer.succeed(InterviewRepository, {
	getForExport: (ids) =>
		Effect.gen(function* () {
			const rows = yield* Effect.tryPromise({
				try: () =>
					prisma.interview.findMany({
						where: { id: { in: [...ids] } },
						include: { participant: true },
					}),
				catch: (error) => new DatabaseError({ cause: error }),
			});

			const inputs: InterviewExportInput[] = rows.map((row) => ({
				id: row.id,
				participantIdentifier: row.participant.identifier,
				startTime: row.startTime,
				finishTime: row.finishTime,
				network: NcNetworkSchema.parse(row.network),
				protocolHash: row.protocolHash,
			}));

			return inputs;
		}),
});
```

The repository returns sessions referencing protocols **by hash**. There is no `protocol: true` join — the pipeline resolves protocols separately via `ProtocolRepository`. Hosts validate the network with `NcNetworkSchema.parse()` directly; the package no longer ships a `parseNcNetwork` helper.

### 2. Provide a `ProtocolRepository`

```ts
import { Effect, Layer } from "effect";
import { DatabaseError } from "@codaco/network-exporters/errors";
import type { ProtocolExportInput } from "@codaco/network-exporters/input";
import { ProtocolRepository } from "@codaco/network-exporters/services/ProtocolRepository";

export const PrismaProtocolRepository = Layer.succeed(ProtocolRepository, {
	getProtocols: (hashes) =>
		Effect.gen(function* () {
			const rows = yield* Effect.tryPromise({
				try: () => prisma.protocol.findMany({ where: { hash: { in: [...hashes] } } }),
				catch: (error) => new DatabaseError({ cause: error }),
			});

			const map: Record<string, ProtocolExportInput> = {};
			for (const row of rows) {
				map[row.hash] = { hash: row.hash, name: row.name, codebook: row.codebook };
			}
			return map;
		}),
});
```

The pipeline calls `getProtocols` once per run with the deduplicated hash set extracted from the session list. Hashes the host doesn't return are treated as missing — sessions referencing them are routed to `failedExports` with `kind: "protocol-missing"` rather than aborting the run.

### 3. Provide an `Output`

`Output` replaces the old `FileStorage` + `FileSystem` Tags with a single stateful lifecycle. The package ships `makeZipOutput(sink)` for hosts that want today's bundled-zip behaviour: it streams entries through pure-JS `fflate` and forwards the resulting zip bytes (as an `AsyncIterable<Uint8Array>`) to a host-supplied sink callback. Hosts that don't want a zip implement `Output` directly.

#### S3 with `ZipOutput` (Node)

```ts
import { Readable } from "node:stream";
import { Upload } from "@aws-sdk/lib-storage";
import { Effect } from "effect";
import { OutputError } from "@codaco/network-exporters/errors";
import { makeZipOutput } from "@codaco/network-exporters/layers/ZipOutput";

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
```

`Readable.from(asyncIterable)` adapts the package's `AsyncIterable<Uint8Array>` to the Node `Readable` the AWS SDK expects. `@aws-sdk/lib-storage`'s `Upload` handles multipart upload and per-part retries internally.

#### Browser blob with `ZipOutput`

```ts
import { Effect } from "effect";
import { OutputError } from "@codaco/network-exporters/errors";
import { makeZipOutput } from "@codaco/network-exporters/layers/ZipOutput";

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
```

`fflate` is pure JS, so this layer works in browsers and Cloudflare Workers without polyfills.

#### OPFS folder (no zip)

```ts
import { Effect, Layer } from "effect";
import { OutputError } from "@codaco/network-exporters/errors";
import { Output } from "@codaco/network-exporters/services/Output";

const OPFSFolderOutput = Layer.succeed(Output, {
	begin: () =>
		Effect.tryPromise({
			try: async () => ({
				dir: await navigator.storage
					.getDirectory()
					.then((root) => root.getDirectoryHandle(`export-${Date.now()}`, { create: true })),
			}),
			catch: (cause) => new OutputError({ cause }),
		}),
	writeEntry: (handle, entry) =>
		Effect.tryPromise({
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

This implementation skips `makeZipOutput` entirely: each successful generation result is written as one OPFS file, and the returned `OutputResult` carries the directory handle back to the host. It compiles against the same `Output` Tag — no special-casing in the pipeline.

### 4. Run the pipeline

```ts
import { Effect, Layer, Queue } from "effect";
import { exportPipeline } from "@codaco/network-exporters/pipeline";
import type { ExportEvent } from "@codaco/network-exporters/events";
import { describeExportError, type ExportError } from "@codaco/network-exporters/errors";

const exportLayer = Layer.mergeAll(
	PrismaInterviewRepository,
	PrismaProtocolRepository,
	S3ZipOutput,
);

const result = await Effect.gen(function* () {
	const queue = yield* Queue.unbounded<ExportEvent>();

	// Spawn a fiber that drains the queue and forwards events to the UI
	// (e.g. an SSE response). The pipeline writes; this consumer reads.
	yield* Effect.forkDaemon(
		Effect.gen(function* () {
			while (true) {
				const event = yield* Queue.take(queue);
				yield* renderEventToClient(event);
			}
		}),
	);

	return yield* exportPipeline(
		["interview-1", "interview-2"],
		{
			exportGraphML: true,
			exportCSV: true,
			globalOptions: {
				useScreenLayoutCoordinates: true,
				screenLayoutHeight: 1080,
				screenLayoutWidth: 1920,
			},
			// optional: defaults to os.cpus().length on Node, 4 elsewhere
			concurrency: 4,
			// optional: only used to populate session metadata
			appVersion: "3.0.0",
			commitHash: process.env.COMMIT_HASH,
		},
		queue,
	);
}).pipe(
	Effect.provide(exportLayer),
	Effect.catchAll((error: ExportError) =>
		Effect.succeed({
			status: "error" as const,
			message: describeExportError(error, "running export"),
		}),
	),
	Effect.runPromise,
);
```

`result.output` carries whatever the `Output.end` implementation returned — for `S3ZipOutput` above, that's `{ key, url }`. There are no `zipUrl` or `zipKey` fields on `ExportReturn`; hosts that want a URL read `result.output.url`.

---

## Pipeline stages

| Stage | What happens | Event emitted |
| --- | --- | --- |
| `fetching` | `InterviewRepository.getForExport(ids)` resolves to `InterviewExportInput[]` | `{ type: "stage", stage: "fetching" }` |
| `formatting` | Per-stage Effects: `getProtocols`, partition missing, build session variables, insert ego, group by protocol hash, resequence ids. Per-session catches route bad sessions to `failedExports` | `{ type: "stage", stage: "formatting" }` |
| `generating` | Per-file fan-out (CSV generators + GraphML doc), bounded concurrency, each producing an `AsyncIterable<Uint8Array>` | `{ type: "stage", stage: "generating" }` plus `{ type: "progress", stage: "generating", current, total }` |
| `outputting` | `Output.begin()`, then `Output.writeEntry(handle, entry)` per successful file, then `Output.end(handle)` | `{ type: "stage", stage: "outputting" }` plus `{ type: "progress", stage: "outputting", current, total }` |

Four stages, four `stage` event values. `outputting` covers `begin`, every `writeEntry`, and `end`. The pipeline allocates no persistent state — there is no separate cleanup phase.

---

## Concurrency

`generateOutputFilesEffect` fans out across the cross-product of (session × format × type-partition). Concurrency is configurable via `ExportOptions.concurrency`. The default is `os.cpus().length` on Node (resolved through a guarded dynamic import) and a small fixed value elsewhere. Set it lower for memory-constrained runtimes (small serverless functions), higher for benchmarking.

```ts
{ ...options, concurrency: 2 }
```

The `outputting` stage is inherently sequential — one zip stream, written to in entry order.

---

## Error model

Two distinct error tracks, both tagged.

### Fatal errors — Effect failure channel

The pipeline raises into Effect's failure channel for unrecoverable conditions: database fetch fails, output begin/write/end fails. Each is a tagged `Data.TaggedError` instance:

| Class                | Tag                                | Raised by                                   |
| -------------------- | ---------------------------------- | ------------------------------------------- |
| `DatabaseError`      | `NetworkExporters/DatabaseError`   | `InterviewRepository`, `ProtocolRepository` |
| `OutputError`        | `NetworkExporters/OutputError`     | `Output.begin` / `Output.writeEntry` / `Output.end` (covers former `FileStorageError` and `ArchiveError`) |

The `ExportError` union type covers both fatal classes.

A failure inside `Output.writeEntry` is fatal — once partial bytes are in the host's bundle, retrying inline is the host's job, not the pipeline's. Hosts that need retry semantics implement them inside their `Output` layer; `fflate` failures and host sink-callback failures both surface as `OutputError`, with the original error available on `error.cause`.

`describeExportError(error, stage?)` produces a human-readable message. It dispatches on the tag and inspects `error.cause` for known runtime patterns (`code === "ENOSPC"`, OOM messages, timeouts, connection refused) before falling back to a tag-aware default. Use it at the consumer boundary — the package itself never builds user-facing strings.

```ts
Effect.catchAll((error) =>
	Effect.succeed({
		status: "error" as const,
		message: describeExportError(error, "running export"),
	}),
)
```

### Partial failures — `ExportFailure[]`

A single bad session or a single failing file does **not** abort the pipeline. Three things can land in `failedExports`:

| `kind`               | Source error             | When                                                                                  |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `protocol-missing`   | `ProtocolNotFoundError`  | Session's `protocolHash` not present in `ProtocolRepository.getProtocols` result      |
| `session-processing` | `SessionProcessingError` | Per-session catch in `format`, `insertEgo`, or `resequence` stages                    |
| `generation`         | `ExportGenerationError`  | A per-file generator (e.g. one CSV partition) throws while the rest succeed           |

Successful files still get written to `Output` and reported.

```ts
const result = await Effect.runPromise(...);
//   ↓ ExportReturn
// {
//   status: "success" | "partial",
//   successfulExports: ExportSuccess[],
//   failedExports:     ExportFailure[],
//   output:            OutputResult,   // host-defined
// }

if (result.status === "partial") {
	for (const failure of result.failedExports) {
		switch (failure.kind) {
			case "protocol-missing":
			case "session-processing":
			case "generation":
				console.warn(describeExportError(failure.error));
				break;
		}
	}
}
```

`status` is `"partial"` whenever `failedExports.length > 0`, regardless of which kind populated it. This split — fatal-vs-partial — is intentional: consumers can give the user a usable bundle even when one CSV failed, while still surfacing what was lost.

---

## Progress events

`exportPipeline` writes `ExportEvent`s to the queue you provide. Two event shapes:

```ts
type ExportStageEvent = {
	type: "stage";
	stage: "fetching" | "formatting" | "generating" | "outputting";
	message: string;
};

type ExportProgressEvent = {
	type: "progress";
	stage: "generating" | "outputting";
	current: number;
	total: number;
};
```

Per-entry `progress` events are emitted during both `generating` (per file produced) and `outputting` (per file written). Existing UI code that drew a bar for `generating` works unchanged for `outputting` — the shape is the same, only the `stage` value differs.

The package emits only these two event types — anything else (e.g. SSE-shaped `complete`/`error` events for client-side delivery) is the host's concern.

`stageMessages` is exported as a `Record<ExportStage, string>` of pre-localised English strings; consumers may ignore it and emit their own.

---

## Local development

This package lives in the `network-canvas-monorepo` and follows the standard scripts.

```bash
# from monorepo root
pnpm --filter @codaco/network-exporters build       # tsgo --noEmit && vite build
pnpm --filter @codaco/network-exporters test        # vitest --run
pnpm --filter @codaco/network-exporters test:watch
pnpm --filter @codaco/network-exporters typecheck   # tsgo --noEmit
pnpm --filter @codaco/network-exporters dev         # vite build --watch
```

The build emits `dist/<entry>.{js,d.ts}` per public sub-path defined in `vite.config.ts` and `package.json#exports`. All runtime dependencies (`effect`, `fflate`, `@codaco/shared-consts`, `@codaco/protocol-validation`, `es-toolkit`, `sanitize-filename`, `zod`, `@xmldom/xmldom`, `ohash`) are externalised at build time.

### Adding a new entry point

1. Add the source file under `src/<path>.ts`.
2. Add the entry to `vite.config.ts` `build.lib.entry`.
3. Add the corresponding sub-path to `package.json#exports`.
4. Run `pnpm --filter @codaco/network-exporters build` and verify a matching `dist/<path>.js` + `.d.ts` lands.

### Adding a runtime dependency

Prefer the workspace catalog. If the dep already has a catalog entry in `pnpm-workspace.yaml`, reference it as `"<dep>": "catalog:"`. Otherwise add it to the catalog with a pinned version, then reference it. Make sure to externalise it in `vite.config.ts` so it isn't bundled. Browser/Workers compatibility means avoiding `node:*` imports from any new code in `src/` — `node:os` inside the guarded dynamic import in `session/generateOutputFiles.ts` is the sole exception.

---

## Versioning

This package uses [Changesets](https://github.com/changesets/changesets), like the rest of the monorepo. After making user-facing changes:

```bash
pnpm changeset
```

Pick `@codaco/network-exporters` and choose the bump type. Don't bump `package.json#version` by hand.

---

## License

GPL-3.0-or-later. See `LICENSE` at the monorepo root.
