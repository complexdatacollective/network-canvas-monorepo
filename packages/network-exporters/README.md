# @codaco/network-exporters

An [Effect-TS](https://effect.website) pipeline that exports Network Canvas interview sessions to GraphML and CSV bundles. The package owns the full export flow — fetching, formatting, archiving, streaming upload, cleanup — and exposes a small set of injected service interfaces so consumers can adapt it to their database, storage backend, and runtime.

```ts
import { Effect, Layer, Queue } from "effect";
import { exportPipeline } from "@codaco/network-exporters/pipeline";
import type { ExportEvent } from "@codaco/network-exporters/events";
import { NodeFileSystem } from "@codaco/network-exporters/layers/NodeFileSystem";

const layer = Layer.mergeAll(
	MyInterviewRepository, // workspace-specific
	MyFileStorage,         // workspace-specific
	NodeFileSystem,        // ships with this package
);

const program = Effect.gen(function* () {
	const queue = yield* Queue.unbounded<ExportEvent>();
	return yield* exportPipeline(interviewIds, exportOptions, queue);
});

const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
// → { zipUrl, zipKey, status: "success" | "partial", successfulExports, failedExports }
```

---

## Why a package

Export logic was historically embedded in [Fresco](https://github.com/complexdatacollective/Fresco) and other Network Canvas applications. This package extracts the pipeline as a self-contained, host-agnostic library so:

- Multiple applications can share the same export semantics and file formats.
- The pipeline is testable in isolation (no Prisma, no S3).
- Storage and database integrations are pluggable via Effect Layers.
- Streams flow end-to-end — no archive is buffered into memory.

---

## Architecture

```text
┌──────────────────── consumer (host application) ─────────────────────┐
│                                                                       │
│  Provides Layers for these Tags ─────────────┐                        │
│                                              ▼                        │
│              ┌───────────────────── exportPipeline ─────────────────┐ │
│              │                                                     │ │
│              │  fetch → format → generate → archive → upload → clean│ │
│              │     ▲        ▲         ▲        ▲          ▲        │ │
│              │     │        │         │        │          │        │ │
│   Interview ─┘  pure   per-format  archiver   FileStorage FileSystem │
│   Repository      (in‑process)   (single zip)  (host‑side, streaming)│
│              └─────────────────────────────────────────────────────┘ │
│                                              │                        │
│                                              ▼                        │
│                            ExportReturn { zipUrl, zipKey,             │
│                                           successfulExports,          │
│                                           failedExports }             │
└───────────────────────────────────────────────────────────────────────┘
```

Three injected services (`Context.Tag`s) form the package's input/output boundary:

| Service                | Provided by | Responsibility                                              |
| ---------------------- | ----------- | ----------------------------------------------------------- |
| `InterviewRepository`  | Host        | Returns `InterviewExportInput[]` for a list of interview ids |
| `FileStorage`          | Host        | Uploads a `Readable` stream and produces a download URL    |
| `FileSystem`           | Host (or built-in `NodeFileSystem`) | Opens read streams + deletes temp files |

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
| `@codaco/network-exporters/input` | `InterviewExportInput`, `ProtocolExportInput`, `parseNcNetwork`, plus session shape types (`FormattedSession`, `SessionVariables`, `SessionWithNetworkEgo`, `SessionWithResequencedIDs`, …) |
| `@codaco/network-exporters/output` | `ExportResult`, `ExportSuccess`, `ExportFailure`, `ExportReturn`, `ArchiveResult` |
| `@codaco/network-exporters/events` | `ExportEvent`, `ExportStageEvent`, `ExportProgressEvent`, `stageMessages` |
| `@codaco/network-exporters/errors` | `DatabaseError`, `FileSystemError`, `ExportGenerationError`, `ArchiveError`, `FileStorageError`, type `ExportError`, `describeExportError` |
| `@codaco/network-exporters/services/InterviewRepository` | `InterviewRepository` Tag |
| `@codaco/network-exporters/services/FileStorage` | `FileStorage` Tag |
| `@codaco/network-exporters/services/FileSystem` | `FileSystem` Tag |
| `@codaco/network-exporters/layers/NodeFileSystem` | `NodeFileSystem` — concrete `node:fs` implementation of the FileSystem tag |

Everything else (formatters, session helpers, archiver wrapper, dispatch logic) is internal and not exported.

---

## Usage

### 1. Provide an `InterviewRepository`

```ts
import { Effect, Layer } from "effect";
import { DatabaseError } from "@codaco/network-exporters/errors";
import { parseNcNetwork, type InterviewExportInput }
	from "@codaco/network-exporters/input";
import { InterviewRepository }
	from "@codaco/network-exporters/services/InterviewRepository";

export const PrismaInterviewRepository = Layer.succeed(InterviewRepository, {
	getForExport: (ids) =>
		Effect.gen(function* () {
			const rows = yield* Effect.tryPromise({
				try: () => prisma.interview.findMany({ where: { id: { in: [...ids] } }, include: { protocol: true, participant: true } }),
				catch: (error) => new DatabaseError({ cause: error }),
			});

			const inputs: InterviewExportInput[] = rows.map((row) => ({
				id: row.id,
				participantIdentifier: row.participant.identifier,
				startTime: row.startTime,
				finishTime: row.finishTime,
				exportTime: new Date(),
				network: parseNcNetwork(row.network),
				protocol: {
					hash: row.protocol.hash,
					name: row.protocol.name,
					schemaVersion: row.protocol.schemaVersion,
					codebook: row.protocol.codebook,
				},
			}));

			return inputs;
		}),
});
```

`parseNcNetwork(unknown)` is exported because `network` is typically stored as opaque JSON and must be validated before flowing into formatters. The package's input shape is independent of any database schema; the adapter is the single place that bridges the two.

### 2. Provide a `FileStorage`

```ts
import { Upload } from "@aws-sdk/lib-storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Effect, Layer } from "effect";
import { FileStorageError } from "@codaco/network-exporters/errors";
import { FileStorage } from "@codaco/network-exporters/services/FileStorage";

export const S3Storage = Layer.succeed(FileStorage, {
	upload: (stream, fileName) =>
		Effect.tryPromise({
			try: async () => {
				await new Upload({
					client: s3,
					params: {
						Bucket: bucket,
						Key: fileName,
						Body: stream,
						ContentType: "application/zip",
					},
				}).done();
				return { key: fileName };
			},
			catch: (error) => new FileStorageError({ cause: error }),
		}),

	getDownloadUrl: (key) =>
		Effect.tryPromise({
			try: () =>
				getSignedUrl(
					s3,
					new GetObjectCommand({ Bucket: bucket, Key: key }),
					{ expiresIn: 3600 },
				),
			catch: (error) => new FileStorageError({ cause: error }),
		}),
});
```

`upload` accepts a Node `Readable` — the archive is piped from disk to S3 (or any backend) without buffering, even for very large exports. `@aws-sdk/lib-storage`'s `Upload` handles multipart upload and per-part retries internally.

For UploadThing, local-disk, or other backends, implement the same two methods.

### 3. Run the pipeline

```ts
import { Effect, Layer, Queue } from "effect";
import { exportPipeline } from "@codaco/network-exporters/pipeline";
import type { ExportEvent } from "@codaco/network-exporters/events";
import { describeExportError, type ExportError }
	from "@codaco/network-exporters/errors";
import { NodeFileSystem } from "@codaco/network-exporters/layers/NodeFileSystem";

const exportLayer = Layer.mergeAll(
	PrismaInterviewRepository,
	S3Storage,
	NodeFileSystem,
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
			// optional: defaults to os.cpus().length
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

---

## Pipeline stages

| Stage | What happens | Event emitted |
| --- | --- | --- |
| `fetching` | `InterviewRepository.getForExport(ids)` resolves to `InterviewExportInput[]` | `{ type: "stage", stage: "fetching" }` |
| `formatting` | Pure transforms: insert ego, group by protocol, resequence ids | `{ type: "stage", stage: "formatting" }` |
| `generating` | Per-file fan-out (CSV generators + GraphML doc), bounded concurrency | `{ type: "stage", stage: "generating" }` plus `{ type: "progress", current, total }` |
| `archiving` | All successful files zipped into `networkCanvasExport-<ts>.zip` | `{ type: "stage", stage: "archiving" }` |
| `uploading` | Archive piped via `Readable` → `FileStorage.upload(stream, fileName)`; download URL fetched | `{ type: "stage", stage: "uploading" }` |
| _(cleanup)_ | All temp files deleted via `FileSystem.deleteFile` (best-effort, runs on success **and** failure paths) | _(no event)_ |

---

## Concurrency

`generateOutputFilesEffect` fans out across the cross-product of (session × format × type-partition). Concurrency is configurable via `ExportOptions.concurrency`; the default is `os.cpus().length`. Set it lower for memory-constrained runtimes (small serverless functions), higher for benchmarking.

```ts
{ ...options, concurrency: 2 }
```

The archive and upload stages are inherently sequential.

---

## Error model

Two distinct error tracks, both tagged:

### Fatal errors — Effect failure channel

The pipeline raises into Effect's failure channel for unrecoverable conditions: database fetch fails, archiver crashes, storage upload fails, etc. Each is a tagged `Data.TaggedError` instance:

| Class | Tag | Raised by |
| --- | --- | --- |
| `DatabaseError` | `NetworkExporters/DatabaseError` | `InterviewRepository` |
| `FileSystemError` | `NetworkExporters/FileSystemError` | `FileSystem` (e.g. read stream open) |
| `ArchiveError` | `NetworkExporters/ArchiveError` | `archiver` |
| `FileStorageError` | `NetworkExporters/FileStorageError` | `FileStorage.upload` / `getDownloadUrl` |
| `ExportGenerationError` | `NetworkExporters/ExportGenerationError` | Per-file generation (used in the partial channel — see below) |

The `ExportError` union type covers the four fatal classes (excluding `ExportGenerationError`).

`describeExportError(error, stage?)` produces a human-readable message. It dispatches on the tag and inspects `error.cause` for known runtime patterns (`code === "ENOSPC"`, OOM messages, timeouts, connection refused, …) before falling back to a tag-aware default. Use it at the consumer boundary — the package itself never builds user-facing strings.

```ts
Effect.catchAll((error) =>
	Effect.succeed({
		status: "error" as const,
		message: describeExportError(error, "running export"),
	}),
)
```

### Partial failures — `ExportFailure[]`

A single file failing to generate (e.g. a malformed network for one session) does **not** abort the pipeline. The bad file becomes an `ExportFailure` carrying an `ExportGenerationError` with `format`, `sessionId`, and `partitionEntity` context. Successful files still get archived, uploaded, and reported.

```ts
const result = await Effect.runPromise(...);
//   ↓ ExportReturn
// {
//   zipUrl: "https://…/networkCanvasExport-…zip",
//   zipKey: "networkCanvasExport-…zip",
//   status: "success" | "partial",
//   successfulExports: ExportSuccess[],
//   failedExports:     ExportFailure[],
// }

if (result.status === "partial") {
	for (const failure of result.failedExports) {
		console.warn(describeExportError(failure.error));
		//   "Failed to generate ego (person) for session abc-123: …"
	}
}
```

This split — fatal-vs-partial — is intentional: consumers can give the user a usable zip even when one CSV failed, while still surfacing what was lost.

---

## Progress events

`exportPipeline` writes `ExportEvent`s to the queue you provide. Two event shapes:

```ts
type ExportStageEvent = {
	type: "stage";
	stage: "fetching" | "formatting" | "generating" | "archiving" | "uploading";
	message: string;
	current?: number;
	total?: number;
};

type ExportProgressEvent = {
	type: "progress";
	stage: "generating";
	current: number;
	total: number;
};
```

The package emits only these two — anything else (e.g. SSE-shaped `complete`/`error` events for client-side delivery) is the host's concern.

`stageMessages` is exported as a default `Record<ExportStage, string>` of pre-localised English strings; consumers may ignore it and emit their own.

---

## Built-in `NodeFileSystem` layer

The `FileSystem` Tag is satisfied by any consumer-provided implementation, but for the common case of a Node runtime the package ships a reference layer:

```ts
import { NodeFileSystem } from "@codaco/network-exporters/layers/NodeFileSystem";

Layer.mergeAll(MyRepo, MyStorage, NodeFileSystem);
```

It uses `node:fs.createReadStream` for `readStream` and `node:fs/promises.unlink` for `deleteFile`, with errors mapped to `FileSystemError`. Replace it with a custom layer for browser or Cloudflare Workers contexts.

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

The build emits `dist/<entry>.{js,d.ts}` per public sub-path defined in `vite.config.ts` and `package.json#exports`. All runtime dependencies (`effect`, `archiver`, `@codaco/shared-consts`, `@codaco/protocol-validation`, `es-toolkit`, `sanitize-filename`, `zod`, `@xmldom/xmldom`, `ohash`) are externalised at build time.

### Adding a new entry point

1. Add the source file under `src/<path>.ts`.
2. Add the entry to `vite.config.ts` `build.lib.entry`.
3. Add the corresponding sub-path to `package.json#exports`.
4. Run `pnpm --filter @codaco/network-exporters build` and verify a matching `dist/<path>.js` + `.d.ts` lands.

### Adding a runtime dependency

Prefer the workspace catalog. If the dep already has a catalog entry in `pnpm-workspace.yaml`, reference it as `"<dep>": "catalog:"`. Otherwise add it to the catalog with a pinned version, then reference it. Make sure to externalise it in `vite.config.ts` so it isn't bundled.

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
