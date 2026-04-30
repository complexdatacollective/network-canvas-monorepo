# Network Exporters Runtime-Agnostic Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@codaco/network-exporters` runtime-agnostic by removing Node-only types from its core, generalising "archive/upload" into a host-implemented `Output` service, deduplicating protocol fetches via a new `ProtocolRepository`, and routing per-session failures through a unified Effectful processing chain.

**Architecture:** Three injected Effect Layers (`InterviewRepository`, `ProtocolRepository`, `Output`). Streams flow through the package as `AsyncIterable<Uint8Array>`. The pipeline owns no persistence. Bundling is a host concern; the package ships one `ZipOutput` layer (pure-JS via `fflate`) for hosts that want today's bundled-zip behaviour. Per-session errors from any stage land in a single `failedExports` array.

**Tech Stack:** Effect-TS 3.x, TypeScript, Vitest, Vite, fflate (new).

**Spec:** `docs/superpowers/specs/2026-04-30-network-exporters-runtime-agnostic-redesign.md`

---

## File map

### New files
- `packages/network-exporters/src/services/ProtocolRepository.ts`
- `packages/network-exporters/src/services/Output.ts`
- `packages/network-exporters/src/session/perSession.ts`
- `packages/network-exporters/src/session/collectProtocolHashes.ts`
- `packages/network-exporters/src/session/partitionByProtocolAvailability.ts`
- `packages/network-exporters/src/session/processSessions.ts`
- `packages/network-exporters/src/layers/ZipOutput.ts`
- `packages/network-exporters/src/layers/__tests__/ZipOutput.test.ts`
- `packages/network-exporters/src/services/__tests__/Output.test.ts`
- `packages/network-exporters/src/session/__tests__/perSession.test.ts`
- `packages/network-exporters/src/session/__tests__/processSessions.test.ts`

### Modified files
- `packages/network-exporters/src/errors.ts`
- `packages/network-exporters/src/events.ts`
- `packages/network-exporters/src/input.ts`
- `packages/network-exporters/src/output.ts`
- `packages/network-exporters/src/pipeline.ts`
- `packages/network-exporters/src/services/InterviewRepository.ts` (docstring only)
- `packages/network-exporters/src/session/exportFile.ts`
- `packages/network-exporters/src/session/generateOutputFiles.ts`
- `packages/network-exporters/src/session/groupByProtocolProperty.ts` (rename internals)
- `packages/network-exporters/src/session/insertEgoIntoSessionNetworks.ts`
- `packages/network-exporters/src/session/resequenceIds.ts`
- `packages/network-exporters/src/formatters/formatExportableSessions.ts`
- `packages/network-exporters/src/formatters/csv/csvShared.ts`
- `packages/network-exporters/src/formatters/csv/attributeList.ts`
- `packages/network-exporters/src/formatters/csv/edgeList.ts`
- `packages/network-exporters/src/formatters/csv/egoList.ts`
- `packages/network-exporters/src/formatters/csv/adjacencyMatrix.ts`
- `packages/network-exporters/src/formatters/graphml/graphmlReadable.ts`
- `packages/network-exporters/src/utils/getFormatter.ts`
- `packages/network-exporters/src/__tests__/pipeline.test.ts`
- `packages/network-exporters/src/__tests__/errors.test.ts`
- `packages/network-exporters/src/formatters/csv/__tests__/attributeList.test.ts`
- `packages/network-exporters/src/formatters/csv/__tests__/edgeList.test.ts`
- `packages/network-exporters/src/formatters/csv/__tests__/egoList.test.ts`
- `packages/network-exporters/src/formatters/csv/__tests__/adjacencyMatrix.test.ts`
- `packages/network-exporters/src/formatters/graphml/__tests__/createGraphML.test.ts` (only if it imports Readable)
- `packages/network-exporters/vite.config.ts`
- `packages/network-exporters/package.json`
- `packages/network-exporters/README.md`

### Deleted files
- `packages/network-exporters/src/services/FileStorage.ts`
- `packages/network-exporters/src/services/FileSystem.ts`
- `packages/network-exporters/src/layers/NodeFileSystem.ts`
- `packages/network-exporters/src/session/archive.ts`

### Notes for the implementer
- All paths below are relative to the repo root unless prefixed with `../`.
- The package compiles broken between Phases 1–5. End-state compilation is verified at the end of Phase 5 with `pnpm --filter @codaco/network-exporters typecheck`. This is intentional — the spec explicitly accepts this.
- When formatting code, follow Biome (tabs, 120 char line width, double quotes). Run `pnpm --filter @codaco/network-exporters lint:fix` if any test or compile complains about format.
- Commits should follow the existing convention (e.g., `feat(network-exporters): ...`, `refactor(network-exporters): ...`, `test(network-exporters): ...`). Do not include `Co-Authored-By: Claude`.

---

## Phase 1 — Type foundations

These tasks reshape error, event, input, and output types. Compilation will be broken after Phase 1; that's expected. We finish Phase 1 with a single combined commit so the broken state never sits across multiple commits.

### Task 1: Update `errors.ts`

**Files:**
- Modify: `packages/network-exporters/src/errors.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { Data } from "effect";
import type { ExportFormat } from "./options";

export class DatabaseError extends Data.TaggedError("NetworkExporters/DatabaseError")<{
	readonly cause: unknown;
}> {}

export class OutputError extends Data.TaggedError("NetworkExporters/OutputError")<{
	readonly cause: unknown;
}> {}

export class ExportGenerationError extends Data.TaggedError("NetworkExporters/ExportGenerationError")<{
	readonly cause: unknown;
	readonly format: ExportFormat;
	readonly sessionId: string;
	readonly partitionEntity?: string;
}> {}

export class ProtocolNotFoundError extends Data.TaggedError("NetworkExporters/ProtocolNotFoundError")<{
	readonly hash: string;
	readonly sessionId: string;
}> {}

export class SessionProcessingError extends Data.TaggedError("NetworkExporters/SessionProcessingError")<{
	readonly cause: unknown;
	readonly stage: "format" | "insertEgo" | "resequence";
	readonly sessionId: string;
}> {}

export type ExportError = DatabaseError | OutputError;

type AnyExportError = ExportError | ExportGenerationError | ProtocolNotFoundError | SessionProcessingError;

const TAG_FALLBACK_MESSAGE: Record<AnyExportError["_tag"], string> = {
	"NetworkExporters/DatabaseError": "Database connection failed",
	"NetworkExporters/OutputError": "Output failed",
	"NetworkExporters/ExportGenerationError": "Failed to generate an export file",
	"NetworkExporters/ProtocolNotFoundError": "Protocol not found",
	"NetworkExporters/SessionProcessingError": "Failed to process session",
};

function classifyCause(
	cause: unknown,
): { kind: "oom" } | { kind: "disk-full" } | { kind: "timeout" } | { kind: "connection" } | { kind: "unknown" } {
	if (cause && typeof cause === "object" && "code" in cause) {
		const code = (cause as { code?: unknown }).code;
		if (code === "ENOSPC") return { kind: "disk-full" };
		if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return { kind: "timeout" };
		if (code === "ECONNREFUSED" || code === "ECONNRESET") return { kind: "connection" };
	}

	const message = cause instanceof Error ? cause.message.toLowerCase() : String(cause).toLowerCase();
	if (message.includes("heap") || message.includes("out of memory")) return { kind: "oom" };
	if (message.includes("no space")) return { kind: "disk-full" };
	if (message.includes("timeout") || message.includes("timed out")) return { kind: "timeout" };
	if (message.includes("database") || message.includes("prisma")) return { kind: "connection" };
	return { kind: "unknown" };
}

export function describeExportError(error: unknown, stage?: string): string {
	const stageSuffix = stage ? ` while ${stage}` : "";

	if (error instanceof ExportGenerationError) {
		const partition = error.partitionEntity ? ` (${error.partitionEntity})` : "";
		return `Failed to generate ${error.format}${partition} for session ${error.sessionId}: ${
			error.cause instanceof Error ? error.cause.message : String(error.cause)
		}`;
	}

	if (error instanceof ProtocolNotFoundError) {
		return `Protocol ${error.hash} not found for session ${error.sessionId}`;
	}

	if (error instanceof SessionProcessingError) {
		return `Failed to process session ${error.sessionId} during ${error.stage}: ${
			error.cause instanceof Error ? error.cause.message : String(error.cause)
		}`;
	}

	if (error instanceof DatabaseError || error instanceof OutputError) {
		const classification = classifyCause(error.cause);
		switch (classification.kind) {
			case "oom":
				return `Export ran out of memory${stageSuffix}. Try exporting fewer interviews at a time.`;
			case "disk-full":
				return `Export ran out of disk space${stageSuffix}. Please free up server storage and try again.`;
			case "timeout":
				return `Export timed out${stageSuffix}. Try exporting fewer interviews at a time.`;
			case "connection":
				return `${TAG_FALLBACK_MESSAGE[error._tag]}${stageSuffix}.`;
			case "unknown":
				return `${TAG_FALLBACK_MESSAGE[error._tag]}${stageSuffix}: ${
					error.cause instanceof Error ? error.cause.message : String(error.cause)
				}`;
		}
	}

	const message = error instanceof Error ? error.message : "An unexpected error occurred";
	return `Export failed${stageSuffix}: ${message}`;
}
```

- [ ] **Step 2: Don't run typecheck yet — Phase 1 compiles broken on purpose**

### Task 2: Update `events.ts`

**Files:**
- Modify: `packages/network-exporters/src/events.ts`

- [ ] **Step 1: Rewrite the file**

```ts
type ExportStage = "fetching" | "formatting" | "generating" | "outputting";

export const stageMessages: Record<ExportStage, string> = {
	fetching: "Fetching interview data...",
	formatting: "Formatting sessions...",
	generating: "Generating files...",
	outputting: "Writing output...",
};

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

export type ExportEvent = ExportStageEvent | ExportProgressEvent;
```

### Task 3: Update `input.ts`

**Files:**
- Modify: `packages/network-exporters/src/input.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import type { Codebook } from "@codaco/protocol-validation";
import type {
	caseProperty,
	codebookHashProperty,
	edgeExportIDProperty,
	egoProperty,
	NcEdge,
	NcNetwork,
	NcNode,
	ncSourceUUID,
	ncTargetUUID,
	nodeExportIDProperty,
	protocolName,
	protocolProperty,
	sessionExportTimeProperty,
	sessionFinishTimeProperty,
	sessionProperty,
	sessionStartTimeProperty,
} from "@codaco/shared-consts";

type NodeWithEgo = NcNode & {
	[egoProperty]: string;
};

type EdgeWithEgo = NcEdge & {
	[egoProperty]: string;
};

export type SessionsByProtocol = Record<string, SessionWithNetworkEgo[]>;

export type SessionVariables = {
	[caseProperty]: string;
	[sessionProperty]: string;
	[protocolProperty]: string;
	[protocolName]: string;
	[codebookHashProperty]: string;
	[sessionExportTimeProperty]: string;
	[sessionStartTimeProperty]: string | undefined;
	[sessionFinishTimeProperty]: string | undefined;
	COMMIT_HASH: string;
	APP_VERSION: string;
};

export type FormattedSession = NcNetwork & {
	sessionVariables: SessionVariables;
};

export type SessionWithNetworkEgo = Omit<FormattedSession, "nodes" | "edges"> & {
	nodes: NodeWithEgo[];
	edges: EdgeWithEgo[];
};

export type NodeWithResequencedID = NodeWithEgo & {
	[nodeExportIDProperty]: number;
};

export type EdgeWithResequencedID = EdgeWithEgo & {
	[ncSourceUUID]: string;
	[ncTargetUUID]: string;
	[edgeExportIDProperty]: number;
};

export type SessionWithResequencedIDs = Omit<FormattedSession, "nodes" | "edges"> & {
	nodes: NodeWithResequencedID[];
	edges: EdgeWithResequencedID[];
};

export type ProtocolExportInput = {
	hash: string;
	name: string;
	codebook: Codebook;
};

export type InterviewExportInput = {
	id: string;
	participantIdentifier: string;
	startTime: Date;
	finishTime: Date | null;
	network: NcNetwork;
	protocolHash: string;
};
```

`parseNcNetwork` is removed. Hosts will call `NcNetworkSchema.parse()` directly.

### Task 4: Update `output.ts`

**Files:**
- Modify: `packages/network-exporters/src/output.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import type {
	ExportGenerationError,
	ProtocolNotFoundError,
	SessionProcessingError,
} from "./errors";
import type { ExportFormat } from "./options";

export type OutputEntry = {
	readonly name: string;
	readonly data: AsyncIterable<Uint8Array>;
};

export type OutputResult = {
	readonly key?: string;
	readonly url?: string;
	readonly [k: string]: unknown;
};

export type OutputHandle = unknown;

export type ExportSuccess = {
	readonly success: true;
	readonly format: ExportFormat;
	readonly sessionId: string;
	readonly partitionEntity?: string;
	readonly name: string;
};

export type ExportFailure =
	| {
			readonly kind: "generation";
			readonly sessionId: string;
			readonly format: ExportFormat;
			readonly partitionEntity?: string;
			readonly error: ExportGenerationError;
	  }
	| {
			readonly kind: "protocol-missing";
			readonly sessionId: string;
			readonly error: ProtocolNotFoundError;
	  }
	| {
			readonly kind: "session-processing";
			readonly sessionId: string;
			readonly error: SessionProcessingError;
	  };

export type ExportResult =
	| ExportSuccess
	| { readonly success: false; readonly failure: ExportFailure };

export type ExportReturn = {
	readonly status: "success" | "partial";
	readonly successfulExports: ExportSuccess[];
	readonly failedExports: ExportFailure[];
	readonly output: OutputResult;
};
```

### Task 5: Phase-1 commit

- [ ] **Step 1: Stage and commit Phase 1**

```bash
git add packages/network-exporters/src/errors.ts \
        packages/network-exporters/src/events.ts \
        packages/network-exporters/src/input.ts \
        packages/network-exporters/src/output.ts
git commit -m "refactor(network-exporters): reshape core types for runtime-agnostic redesign"
```

---

## Phase 2 — Services

### Task 6: Add `ProtocolRepository` service

**Files:**
- Create: `packages/network-exporters/src/services/ProtocolRepository.ts`

- [ ] **Step 1: Write the file**

```ts
import { Context, type Effect } from "effect";
import type { DatabaseError } from "../errors";
import type { ProtocolExportInput } from "../input";

export class ProtocolRepository extends Context.Tag("NetworkExporters/ProtocolRepository")<
	ProtocolRepository,
	{
		readonly getProtocols: (
			hashes: readonly string[],
		) => Effect.Effect<Record<string, ProtocolExportInput>, DatabaseError>;
	}
>() {}
```

### Task 7: Add `Output` service

**Files:**
- Create: `packages/network-exporters/src/services/Output.ts`

- [ ] **Step 1: Write the file**

```ts
import { Context, type Effect } from "effect";
import type { OutputError } from "../errors";
import type { OutputEntry, OutputHandle, OutputResult } from "../output";

export class Output extends Context.Tag("NetworkExporters/Output")<
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

### Task 8: Update `InterviewRepository.ts` (no shape change, but update import)

**Files:**
- Modify: `packages/network-exporters/src/services/InterviewRepository.ts`

The Tag itself is unchanged — its method signature still uses `InterviewExportInput[]`. But `InterviewExportInput` now has `protocolHash` instead of `protocol`, so any consumer-facing impact is downstream. No code change needed here.

- [ ] **Step 1: Verify no edits are needed**

```bash
cat packages/network-exporters/src/services/InterviewRepository.ts
```

Expected: file imports `InterviewExportInput` from `../input`, returns it unchanged. Confirm no edits required.

### Task 9: Delete `FileStorage`, `FileSystem`, `NodeFileSystem`

**Files:**
- Delete: `packages/network-exporters/src/services/FileStorage.ts`
- Delete: `packages/network-exporters/src/services/FileSystem.ts`
- Delete: `packages/network-exporters/src/layers/NodeFileSystem.ts`

- [ ] **Step 1: Delete the three files**

```bash
git rm packages/network-exporters/src/services/FileStorage.ts \
       packages/network-exporters/src/services/FileSystem.ts \
       packages/network-exporters/src/layers/NodeFileSystem.ts
```

### Task 10: Phase-2 commit

- [ ] **Step 1: Stage and commit Phase 2**

```bash
git add packages/network-exporters/src/services/ProtocolRepository.ts \
        packages/network-exporters/src/services/Output.ts
git commit -m "refactor(network-exporters): replace FileStorage/FileSystem with Output and add ProtocolRepository"
```

---

## Phase 3 — Formatters: `Readable` → `AsyncIterable<Uint8Array>`

### Task 11: Replace `csvShared.toReadable` with `toAsyncBytes`

**Files:**
- Modify: `packages/network-exporters/src/formatters/csv/csvShared.ts`

- [ ] **Step 1: Rewrite the file**

```ts
export const csvEOL = "\r\n";

const DIFFICULT_CHARACTERS = ['"', ",", "\r", "\n"];

const containsDifficultCharacters = (value: string) => DIFFICULT_CHARACTERS.some((c) => value.includes(c));

const quoteValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function sanitizeCellValue(value: unknown): string | number | boolean | null | undefined {
	if (value === null || value === undefined) return value;
	if (typeof value === "object") {
		let serialized: string;
		try {
			serialized = JSON.stringify(value) ?? "";
		} catch {
			serialized = "";
		}
		return quoteValue(serialized);
	}
	if (typeof value === "string") {
		return containsDifficultCharacters(value) ? quoteValue(value) : value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	return `${value as bigint}`;
}

const encoder = new TextEncoder();

export async function* toAsyncBytes(rows: Iterable<string>): AsyncIterable<Uint8Array> {
	for (const row of rows) {
		yield encoder.encode(row);
	}
}
```

### Task 12: Convert `attributeList.ts`

**Files:**
- Modify: `packages/network-exporters/src/formatters/csv/attributeList.ts`

- [ ] **Step 1: Replace the readable export**

Change the file's bottom three exports (no other changes needed):

```ts
// Replace `import type { Readable } from "node:stream";` with nothing.
// Replace `import { csvEOL, sanitizeCellValue, toReadable } from "./csvShared";`
// with    `import { csvEOL, sanitizeCellValue, toAsyncBytes } from "./csvShared";`
//
// Replace the `attributeListReadable` export with:

export function attributeListBytes(
	network: SessionWithResequencedIDs,
	codebook: Codebook,
	exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
	return toAsyncBytes(attributeListRows(network, codebook, exportOptions));
}
```

The function previously returned `Readable`; it now returns `AsyncIterable<Uint8Array>`. The internal `attributeListRows` generator is unchanged.

### Task 13: Convert `edgeList.ts`

**Files:**
- Modify: `packages/network-exporters/src/formatters/csv/edgeList.ts`

- [ ] **Step 1: Mirror Task 12**

- Drop `import type { Readable } from "node:stream";`.
- Replace `toReadable` with `toAsyncBytes` in the import from `./csvShared`.
- Replace the bottom export:

```ts
export function edgeListBytes(
	network: SessionWithResequencedIDs,
	codebook: Codebook,
	exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
	return toAsyncBytes(edgeListRows(network, codebook, exportOptions));
}
```

### Task 14: Convert `egoList.ts`

**Files:**
- Modify: `packages/network-exporters/src/formatters/csv/egoList.ts`

- [ ] **Step 1: Mirror Task 12**

- Drop `import type { Readable } from "node:stream";`.
- Replace `toReadable` with `toAsyncBytes` in the import from `./csvShared`.
- Replace the bottom export:

```ts
export function egoListBytes(
	network: SessionWithResequencedIDs,
	codebook: Codebook,
	exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
	return toAsyncBytes(egoListRows(network, codebook, exportOptions));
}
```

### Task 15: Convert `adjacencyMatrix.ts`

**Files:**
- Modify: `packages/network-exporters/src/formatters/csv/adjacencyMatrix.ts`

- [ ] **Step 1: Mirror Task 12**

- Drop `import type { Readable } from "node:stream";`.
- Replace `toReadable` with `toAsyncBytes` in the import from `./csvShared`.
- Replace the bottom export:

```ts
export function adjacencyMatrixBytes(
	network: SessionWithResequencedIDs,
	codebook: Codebook,
	options: ExportOptions,
): AsyncIterable<Uint8Array> {
	return toAsyncBytes(adjacencyMatrixRows(network, codebook, options));
}
```

### Task 16: Convert `graphmlReadable.ts`

**Files:**
- Modify: `packages/network-exporters/src/formatters/graphml/graphmlReadable.ts`

- [ ] **Step 1: Rename and rewrite**

The file is small. Rewrite it in place (still named `graphmlReadable.ts` so we don't churn paths in this task; we keep the filename to avoid renaming complexity):

```ts
import type { Codebook } from "@codaco/protocol-validation";
import type { ExportOptions } from "../../options";
import type { ExportFileNetwork } from "../../session/exportFile";
import GraphMLFormatter from "./GraphMLFormatter";

const encoder = new TextEncoder();

export async function* graphmlBytes(
	network: ExportFileNetwork,
	codebook: Codebook,
	exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
	const formatter = new GraphMLFormatter(network, codebook, exportOptions);
	const xml = formatter.writeToString();
	yield encoder.encode(xml);
}
```

The export name changes from `graphmlReadable` to `graphmlBytes`.

### Task 17: Update `getFormatter.ts`

**Files:**
- Modify: `packages/network-exporters/src/utils/getFormatter.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import type { Codebook } from "@codaco/protocol-validation";
import { adjacencyMatrixBytes } from "../formatters/csv/adjacencyMatrix";
import { attributeListBytes } from "../formatters/csv/attributeList";
import { edgeListBytes } from "../formatters/csv/edgeList";
import { egoListBytes } from "../formatters/csv/egoList";
import { graphmlBytes } from "../formatters/graphml/graphmlReadable";
import type { ExportFormat, ExportOptions } from "../options";
import type { ExportFileNetwork } from "../session/exportFile";

type FormatterBytes = (
	network: ExportFileNetwork,
	codebook: Codebook,
	options: ExportOptions,
) => AsyncIterable<Uint8Array>;

export function getFormatter(format: ExportFormat): FormatterBytes {
	switch (format) {
		case "graphml":
			return graphmlBytes;
		case "attributeList":
			return attributeListBytes;
		case "edgeList":
			return edgeListBytes;
		case "ego":
			return egoListBytes;
		case "adjacencyMatrix":
			return adjacencyMatrixBytes;
	}
}
```

### Task 18: Update CSV formatter tests

**Files:**
- Modify: `packages/network-exporters/src/formatters/csv/__tests__/attributeList.test.ts`
- Modify: `packages/network-exporters/src/formatters/csv/__tests__/edgeList.test.ts`
- Modify: `packages/network-exporters/src/formatters/csv/__tests__/egoList.test.ts`
- Modify: `packages/network-exporters/src/formatters/csv/__tests__/adjacencyMatrix.test.ts`

- [ ] **Step 1: Find and update each test that imports the old `*Readable` exports**

For each test file: change imports to the renamed `*Bytes` exports, and replace any `Readable.from`-style assertions with the `gatherBytes` helper.

Add the helper at the top of each test file (one local copy per file is fine for now; if duplication grows, extract later):

```ts
const decoder = new TextDecoder();

async function gatherText(bytes: AsyncIterable<Uint8Array>): Promise<string> {
	let out = "";
	for await (const chunk of bytes) out += decoder.decode(chunk, { stream: true });
	out += decoder.decode();
	return out;
}
```

Then any test that previously did:

```ts
const stream = attributeListReadable(network, codebook, options);
const chunks: string[] = [];
for await (const c of stream) chunks.push(c);
const text = chunks.join("");
```

becomes:

```ts
const text = await gatherText(attributeListBytes(network, codebook, options));
```

If a test imports `Readable` from `node:stream`, drop that import.

- [ ] **Step 2: Run formatter tests**

```bash
pnpm --filter @codaco/network-exporters vitest run src/formatters/csv
```

Expected: all CSV formatter tests pass.

- [ ] **Step 3: If `createGraphML.test.ts` or `processAttributes.test.ts` fail** (they should not, since they don't import the readable layer)

Look at the failure: only update if they actually import `graphmlReadable` or a Node `Readable`. Otherwise leave alone.

```bash
pnpm --filter @codaco/network-exporters vitest run src/formatters/graphml
```

Expected: all graphml formatter tests pass without modification.

### Task 19: Phase-3 commit

- [ ] **Step 1: Stage and commit Phase 3**

```bash
git add packages/network-exporters/src/formatters \
        packages/network-exporters/src/utils/getFormatter.ts
git commit -m "refactor(network-exporters): formatters return AsyncIterable<Uint8Array>"
```

---

## Phase 4 — Effectful processing chain

### Task 20: Add `perSession` wrapper

**Files:**
- Create: `packages/network-exporters/src/session/perSession.ts`
- Create: `packages/network-exporters/src/session/__tests__/perSession.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/network-exporters/src/session/__tests__/perSession.test.ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SessionProcessingError } from "../../errors";
import { perSession } from "../perSession";

describe("perSession", () => {
	it("partitions successes from failures, tagging failures with stage and sessionId", async () => {
		const items = [
			{ id: "ok-1" },
			{ id: "bad" },
			{ id: "ok-2" },
		];

		const fn = (item: { id: string }) =>
			item.id === "bad" ? Effect.fail(new Error("nope")) : Effect.succeed(item.id.toUpperCase());

		const [errors, successes] = await Effect.runPromise(
			perSession(
				"insertEgo",
				fn,
				(item: { id: string }) => item.id,
			)(items),
		);

		expect(successes).toEqual(["OK-1", "OK-2"]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(SessionProcessingError);
		expect(errors[0]?.stage).toBe("insertEgo");
		expect(errors[0]?.sessionId).toBe("bad");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @codaco/network-exporters vitest run src/session/__tests__/perSession.test.ts
```

Expected: FAIL with "Cannot find module '../perSession'".

- [ ] **Step 3: Implement `perSession.ts`**

```ts
// packages/network-exporters/src/session/perSession.ts
import { Effect } from "effect";
import { SessionProcessingError } from "../errors";

export const perSession = <S, A, E>(
	stage: SessionProcessingError["stage"],
	fn: (s: S) => Effect.Effect<A, E>,
	getId: (s: S) => string,
) =>
	(sessions: S[]): Effect.Effect<readonly [SessionProcessingError[], A[]]> =>
		Effect.partition(sessions, (s) =>
			fn(s).pipe(
				Effect.mapError(
					(cause) =>
						new SessionProcessingError({ cause, stage, sessionId: getId(s) }),
				),
			),
		);
```

`getId` lets each call site project a session id from whatever shape it carries (`InterviewExportInput.id`, `FormattedSession.sessionVariables[sessionProperty]`, etc.) without forcing all session types to share a top-level `id` field.

Note: `Effect.partition` returns `Effect<[Es, As]>` where `Es` is the array of error values from failing branches and `As` is the array of successes. If the local Effect version surfaces a different signature, adapt the destructuring.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @codaco/network-exporters vitest run src/session/__tests__/perSession.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/network-exporters/src/session/perSession.ts \
        packages/network-exporters/src/session/__tests__/perSession.test.ts
git commit -m "feat(network-exporters): add perSession wrapper for partial-failure routing"
```

### Task 21: Add `collectProtocolHashes`

**Files:**
- Create: `packages/network-exporters/src/session/collectProtocolHashes.ts`

- [ ] **Step 1: Write the file**

```ts
import type { InterviewExportInput } from "../input";

export function collectProtocolHashes(sessions: InterviewExportInput[]): string[] {
	return [...new Set(sessions.map((s) => s.protocolHash))];
}
```

No test — trivial enough that the integration test in Task 25 covers it.

### Task 22: Add `partitionByProtocolAvailability`

**Files:**
- Create: `packages/network-exporters/src/session/partitionByProtocolAvailability.ts`

- [ ] **Step 1: Write the file**

```ts
import { ProtocolNotFoundError } from "../errors";
import type { InterviewExportInput, ProtocolExportInput } from "../input";
import type { ExportFailure } from "../output";

export function partitionByProtocolAvailability(
	sessions: InterviewExportInput[],
	protocols: Record<string, ProtocolExportInput>,
): { resolvable: InterviewExportInput[]; missing: ExportFailure[] } {
	const resolvable: InterviewExportInput[] = [];
	const missing: ExportFailure[] = [];
	for (const session of sessions) {
		if (protocols[session.protocolHash]) {
			resolvable.push(session);
		} else {
			missing.push({
				kind: "protocol-missing",
				sessionId: session.id,
				error: new ProtocolNotFoundError({
					hash: session.protocolHash,
					sessionId: session.id,
				}),
			});
		}
	}
	return { resolvable, missing };
}
```

### Task 23: Refactor `formatExportableSessions` to take a protocols map

**Files:**
- Modify: `packages/network-exporters/src/formatters/formatExportableSessions.ts`

The function previously read `session.protocol`. It now takes a separate `protocols` map keyed by hash.

- [ ] **Step 1: Rewrite the file**

```ts
import {
	caseProperty,
	codebookHashProperty,
	protocolName,
	protocolProperty,
	sessionExportTimeProperty,
	sessionFinishTimeProperty,
	sessionProperty,
	sessionStartTimeProperty,
} from "@codaco/shared-consts";
import { hash } from "ohash";
import type { FormattedSession, InterviewExportInput, ProtocolExportInput, SessionVariables } from "../input";
import type { ExportOptions } from "../options";

export const formatExportableSession = (
	session: InterviewExportInput,
	protocol: ProtocolExportInput,
	exportOptions: ExportOptions,
): FormattedSession => {
	const sessionVariables: SessionVariables = {
		[caseProperty]: session.participantIdentifier,
		[sessionProperty]: session.id,
		[protocolProperty]: protocol.hash,
		[protocolName]: protocol.name,
		[codebookHashProperty]: hash(protocol.codebook),
		[sessionStartTimeProperty]: session.startTime.toISOString(),
		[sessionFinishTimeProperty]: session.finishTime?.toISOString() ?? undefined,
		[sessionExportTimeProperty]: new Date().toISOString(),
		COMMIT_HASH: exportOptions.commitHash ?? "",
		APP_VERSION: exportOptions.appVersion ?? "",
	};

	return {
		...session.network,
		sessionVariables,
	};
};
```

The function signature changes: previous `(sessions, options) => sessions.map(...)`; new `(session, protocol, options) => FormattedSession`. Per-session orchestration moves to `processSessions` (Task 26).

### Task 24: Adjust `insertEgoIntoSessionNetworks` to single-session signature

**Files:**
- Modify: `packages/network-exporters/src/session/insertEgoIntoSessionNetworks.ts`

The function currently maps over a list. We want to expose a single-session entry point so `perSession` can wrap it.

- [ ] **Step 1: Rewrite the file**

```ts
import { egoProperty, entityPrimaryKeyProperty } from "@codaco/shared-consts";
import type { FormattedSession, SessionWithNetworkEgo } from "../input";

export const insertEgoIntoSessionNetwork = (session: FormattedSession): SessionWithNetworkEgo => ({
	...session,
	nodes: session.nodes
		? session.nodes.map((node) => ({
				[egoProperty]: session.ego[entityPrimaryKeyProperty],
				...node,
			}))
		: [],
	edges: session.edges
		? session.edges.map((edge) => ({
				[egoProperty]: session.ego[entityPrimaryKeyProperty],
				...edge,
			}))
		: [],
});
```

The previous `insertEgoIntoSessionNetworks` (plural) export is removed. Callers use the singular form via `perSession`.

### Task 25: Adjust `resequenceIds` to single-session signature

**Files:**
- Modify: `packages/network-exporters/src/session/resequenceIds.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import {
	edgeExportIDProperty,
	edgeSourceProperty,
	edgeTargetProperty,
	entityPrimaryKeyProperty,
	ncSourceUUID,
	ncTargetUUID,
	nodeExportIDProperty,
} from "@codaco/shared-consts";
import type {
	EdgeWithResequencedID,
	NodeWithResequencedID,
	SessionWithNetworkEgo,
	SessionWithResequencedIDs,
} from "../input";

export const resequenceSessionIds = (session: SessionWithNetworkEgo): SessionWithResequencedIDs => {
	let resequencedNodeId = 0;
	let resequencedEdgeId = 0;
	const IDLookupMap: Record<string, string> = {};

	return {
		...session,
		nodes: session?.nodes?.map((node) => {
			resequencedNodeId++;
			IDLookupMap[node[entityPrimaryKeyProperty]] = resequencedNodeId.toString();
			const newNode: NodeWithResequencedID = {
				[nodeExportIDProperty]: resequencedNodeId,
				...node,
			};
			return newNode;
		}),
		edges: session?.edges?.map((edge) => {
			resequencedEdgeId++;
			IDLookupMap[edge[entityPrimaryKeyProperty]] = resequencedEdgeId.toString();
			const newEdge: EdgeWithResequencedID = {
				...edge,
				[ncSourceUUID]: edge[edgeSourceProperty],
				[ncTargetUUID]: edge[edgeTargetProperty],
				[edgeExportIDProperty]: resequencedEdgeId,
				from: IDLookupMap[edge[edgeSourceProperty]] ?? edge[edgeSourceProperty],
				to: IDLookupMap[edge[edgeTargetProperty]] ?? edge[edgeTargetProperty],
			};
			return newEdge;
		}),
	};
};
```

The previous `resequenceIds` (working on grouped record) is removed. The orchestrator (`processSessions`) groups by hash *after* per-session resequencing.

### Task 26: Make `groupByProtocolProperty` generic

**Files:**
- Modify: `packages/network-exporters/src/session/groupByProtocolProperty.ts`

The new orchestrator resequences before grouping (cleaner per-session error catches throughout), so this function needs to accept `SessionWithResequencedIDs[]` as well as `SessionWithNetworkEgo[]`. Both extend the shape `{ sessionVariables: { [protocolProperty]: string } }`, so we make the function generic.

- [ ] **Step 1: Rewrite the file**

```ts
import { protocolProperty } from "@codaco/shared-consts";
import { groupBy } from "es-toolkit";
import type { FormattedSession } from "../input";

export default function groupByProtocolProperty<S extends FormattedSession>(
	sessions: S[],
): Record<string, S[]> {
	return groupBy(sessions, (s) => s.sessionVariables[protocolProperty]);
}
```

The existing `SessionsByProtocol` type alias in `input.ts` remains valid for the `SessionWithNetworkEgo` case but isn't referenced by this function anymore.

### Task 27: Add `processSessions` orchestrator

**Files:**
- Create: `packages/network-exporters/src/session/processSessions.ts`
- Create: `packages/network-exporters/src/session/__tests__/processSessions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/network-exporters/src/session/__tests__/processSessions.test.ts
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { DatabaseError } from "../../errors";
import type { InterviewExportInput, ProtocolExportInput } from "../../input";
import type { ExportOptions } from "../../options";
import { ProtocolRepository } from "../../services/ProtocolRepository";
import { processSessions } from "../processSessions";

const mkSession = (id: string, hash: string, ego = "ego-1"): InterviewExportInput => ({
	id,
	participantIdentifier: `p-${id}`,
	startTime: new Date("2025-01-01"),
	finishTime: new Date("2025-01-01"),
	network: { nodes: [], edges: [], ego: { _uid: ego, attributes: {} } },
	protocolHash: hash,
});

const protocol = (hash: string): ProtocolExportInput => ({
	hash,
	name: `Protocol ${hash}`,
	codebook: { node: {}, edge: {} },
});

const mkRepo = (mapping: Record<string, ProtocolExportInput>) =>
	Layer.succeed(ProtocolRepository, {
		getProtocols: () => Effect.succeed(mapping),
	});

const opts: ExportOptions = {
	exportGraphML: true,
	exportCSV: false,
	globalOptions: { useScreenLayoutCoordinates: false, screenLayoutHeight: 0, screenLayoutWidth: 0 },
};

describe("processSessions", () => {
	it("returns grouped, resequenced sessions and an empty failure list when all protocols resolve", async () => {
		const sessions = [mkSession("s1", "hA"), mkSession("s2", "hA")];
		const repo = mkRepo({ hA: protocol("hA") });

		const { grouped, protocols, failures } = await Effect.runPromise(
			processSessions(sessions, opts).pipe(Effect.provide(repo)),
		);

		expect(failures).toEqual([]);
		expect(protocols.hA?.hash).toBe("hA");
		expect(Object.keys(grouped)).toEqual(["hA"]);
		expect(grouped.hA).toHaveLength(2);
	});

	it("routes sessions whose protocols are missing into failures with kind=protocol-missing", async () => {
		const sessions = [mkSession("s1", "hA"), mkSession("s2", "hMISSING")];
		const repo = mkRepo({ hA: protocol("hA") });

		const { grouped, failures } = await Effect.runPromise(
			processSessions(sessions, opts).pipe(Effect.provide(repo)),
		);

		expect(grouped.hA).toHaveLength(1);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.kind).toBe("protocol-missing");
		expect(failures[0]?.sessionId).toBe("s2");
	});

	it("propagates DatabaseError fatally", async () => {
		const sessions = [mkSession("s1", "hA")];
		const failingRepo = Layer.succeed(ProtocolRepository, {
			getProtocols: () => Effect.fail(new DatabaseError({ cause: new Error("db down") })),
		});

		await expect(
			Effect.runPromise(processSessions(sessions, opts).pipe(Effect.provide(failingRepo))),
		).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @codaco/network-exporters vitest run src/session/__tests__/processSessions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `processSessions.ts`**

```ts
// packages/network-exporters/src/session/processSessions.ts
import { sessionProperty } from "@codaco/shared-consts";
import { Effect } from "effect";
import { formatExportableSession } from "../formatters/formatExportableSessions";
import type {
	FormattedSession,
	InterviewExportInput,
	ProtocolExportInput,
	SessionWithNetworkEgo,
	SessionWithResequencedIDs,
} from "../input";
import type { ExportOptions } from "../options";
import type { ExportFailure } from "../output";
import { ProtocolRepository } from "../services/ProtocolRepository";
import { collectProtocolHashes } from "./collectProtocolHashes";
import groupByProtocolProperty from "./groupByProtocolProperty";
import { insertEgoIntoSessionNetwork } from "./insertEgoIntoSessionNetworks";
import { partitionByProtocolAvailability } from "./partitionByProtocolAvailability";
import { perSession } from "./perSession";
import { resequenceSessionIds } from "./resequenceIds";

export type ProcessSessionsResult = {
	readonly grouped: Record<string, SessionWithResequencedIDs[]>;
	readonly protocols: Record<string, ProtocolExportInput>;
	readonly failures: ExportFailure[];
};

const getInterviewId = (s: InterviewExportInput) => s.id;
const getFormattedId = (s: FormattedSession) => s.sessionVariables[sessionProperty];
const getNetworkEgoId = (s: SessionWithNetworkEgo) => s.sessionVariables[sessionProperty];

export const processSessions = (sessions: InterviewExportInput[], exportOptions: ExportOptions) =>
	Effect.gen(function* () {
		const protocolRepo = yield* ProtocolRepository;

		const hashes = collectProtocolHashes(sessions);
		const protocols = yield* protocolRepo
			.getProtocols(hashes)
			.pipe(Effect.withSpan("format.fetchProtocols"));

		const { resolvable, missing } = partitionByProtocolAvailability(sessions, protocols);
		const failures: ExportFailure[] = [...missing];

		const [formatErrors, formatted] = yield* perSession(
			"format",
			(s: InterviewExportInput) =>
				Effect.try(() => {
					const protocol = protocols[s.protocolHash];
					if (!protocol) {
						throw new Error(`unreachable: protocol ${s.protocolHash} dropped earlier`);
					}
					return formatExportableSession(s, protocol, exportOptions);
				}),
			getInterviewId,
		)(resolvable).pipe(Effect.withSpan("format.buildVariables"));

		for (const err of formatErrors) {
			failures.push({ kind: "session-processing", sessionId: err.sessionId, error: err });
		}

		const [egoErrors, withEgo] = yield* perSession(
			"insertEgo",
			(s: FormattedSession) => Effect.try(() => insertEgoIntoSessionNetwork(s)),
			getFormattedId,
		)(formatted).pipe(Effect.withSpan("format.insertEgo"));

		for (const err of egoErrors) {
			failures.push({ kind: "session-processing", sessionId: err.sessionId, error: err });
		}

		const [reseqErrors, resequenced] = yield* perSession(
			"resequence",
			(s: SessionWithNetworkEgo) => Effect.try(() => resequenceSessionIds(s)),
			getNetworkEgoId,
		)(withEgo).pipe(Effect.withSpan("format.resequence"));

		for (const err of reseqErrors) {
			failures.push({ kind: "session-processing", sessionId: err.sessionId, error: err });
		}

		const grouped = groupByProtocolProperty(resequenced);

		return { grouped, protocols, failures } satisfies ProcessSessionsResult;
	});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @codaco/network-exporters vitest run src/session/__tests__/processSessions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Phase 4**

```bash
git add packages/network-exporters/src/session \
        packages/network-exporters/src/formatters/formatExportableSessions.ts
git commit -m "refactor(network-exporters): effectful processing chain with per-session failure routing"
```

---

## Phase 5 — Generation, pipeline, and ZipOutput

### Task 28: Rewrite `exportFile.ts` to produce `OutputEntry`

**Files:**
- Modify: `packages/network-exporters/src/session/exportFile.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import type { Codebook } from "@codaco/protocol-validation";
import { Effect } from "effect";
import { ExportGenerationError } from "../errors";
import type { ExportFormat, ExportOptions } from "../options";
import type { ExportFailure, ExportSuccess, OutputEntry } from "../output";
import { getFileExtension, makeFilename } from "../utils/general";
import { getFormatter } from "../utils/getFormatter";
import type { partitionByType } from "./partitionByType";

export type ExportFileNetwork = ReturnType<typeof partitionByType>[number];

type ExportFileParams = {
	prefix: string;
	exportFormat: ExportFormat;
	network: ExportFileNetwork;
	codebook: Codebook;
	exportOptions: ExportOptions;
	sessionId: string;
};

export type GenerationResult =
	| { ok: true; success: ExportSuccess; entry: OutputEntry }
	| { ok: false; failure: ExportFailure };

const exportFile = (params: ExportFileParams): Effect.Effect<GenerationResult> =>
	Effect.sync(() => {
		const { prefix, exportFormat, network, codebook, exportOptions, sessionId } = params;
		const toBytes = getFormatter(exportFormat);
		const extension = getFileExtension(exportFormat);
		const name = makeFilename(prefix, network.partitionEntity, exportFormat, extension);

		try {
			const data = toBytes(network, codebook, exportOptions);
			const success: ExportSuccess = {
				success: true,
				format: exportFormat,
				sessionId,
				partitionEntity: network.partitionEntity,
				name,
			};
			return { ok: true, success, entry: { name, data } };
		} catch (cause) {
			const error = new ExportGenerationError({
				cause,
				format: exportFormat,
				sessionId,
				partitionEntity: network.partitionEntity,
			});
			return {
				ok: false,
				failure: {
					kind: "generation",
					sessionId,
					format: exportFormat,
					partitionEntity: network.partitionEntity,
					error,
				},
			};
		}
	});

export default exportFile;
```

The function no longer touches the filesystem. It only synthesises the entry. Errors thrown during synchronous `toBytes` setup land as a `generation` failure; failures inside the async iterable are surfaced when the bytes are pulled by `Output.writeEntry`.

### Task 29: Update `generateOutputFiles.ts` to emit entries

**Files:**
- Modify: `packages/network-exporters/src/session/generateOutputFiles.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import os from "node:os";
import { sessionProperty } from "@codaco/shared-consts";
import { Effect, Queue, Ref } from "effect";
import { invariant } from "es-toolkit";
import type { ExportEvent } from "../events";
import type { ProtocolExportInput, SessionWithResequencedIDs } from "../input";
import type { ExportFormat, ExportOptions } from "../options";
import type { ExportFailure, ExportSuccess, OutputEntry } from "../output";
import { getFilePrefix } from "../utils/general";
import exportFile, { type GenerationResult } from "./exportFile";
import { partitionByType } from "./partitionByType";

type ExportItem = {
	prefix: string;
	exportFormat: ExportFormat;
	network: ReturnType<typeof partitionByType>[number];
	codebook: ProtocolExportInput["codebook"];
	exportOptions: ExportOptions;
	sessionId: string;
};

function buildExportItems(
	protocols: Record<string, ProtocolExportInput>,
	exportOptions: ExportOptions,
	unifiedSessions: Record<string, SessionWithResequencedIDs[]>,
): ExportItem[] {
	const exportFormats: ExportFormat[] = [
		...(exportOptions.exportGraphML ? (["graphml"] as const) : []),
		...(exportOptions.exportCSV ? (["attributeList", "edgeList", "ego"] as const) : []),
	];

	const items: ExportItem[] = [];
	Object.entries(unifiedSessions).forEach(([protocolKey, sessions]) => {
		const codebook = protocols[protocolKey]?.codebook;
		invariant(codebook, `No protocol found for key: ${protocolKey}`);

		sessions.forEach((session) => {
			const prefix = getFilePrefix(session);
			exportFormats.forEach((format) => {
				const partitionedNetworks = partitionByType(codebook, session, format);
				partitionedNetworks.forEach((partitionedNetwork) => {
					items.push({
						prefix,
						exportFormat: format,
						network: partitionedNetwork,
						codebook,
						exportOptions,
						sessionId: session.sessionVariables[sessionProperty],
					});
				});
			});
		});
	});
	return items;
}

export type GenerateOutputFilesResult = {
	readonly successes: { readonly success: ExportSuccess; readonly entry: OutputEntry }[];
	readonly failures: ExportFailure[];
};

export const generateOutputFilesEffect = (
	protocols: Record<string, ProtocolExportInput>,
	exportOptions: ExportOptions,
	unifiedSessions: Record<string, SessionWithResequencedIDs[]>,
	progressQueue: Queue.Enqueue<ExportEvent>,
) =>
	Effect.gen(function* () {
		const items = buildExportItems(protocols, exportOptions, unifiedSessions);
		const total = items.length;
		const concurrency = exportOptions.concurrency ?? os.cpus().length;
		const completedRef = yield* Ref.make(0);

		yield* Queue.offer(progressQueue, {
			type: "stage",
			stage: "generating",
			message: "Generating files...",
		});

		const results: GenerationResult[] = yield* Effect.forEach(
			items,
			(item) =>
				exportFile(item).pipe(
					Effect.tap(() =>
						Ref.updateAndGet(completedRef, (n) => n + 1).pipe(
							Effect.tap((current) =>
								Queue.offer(progressQueue, {
									type: "progress",
									stage: "generating",
									current,
									total,
								}),
							),
						),
					),
				),
			{ concurrency },
		);

		const successes: GenerateOutputFilesResult["successes"] = [];
		const failures: ExportFailure[] = [];
		for (const r of results) {
			if (r.ok) successes.push({ success: r.success, entry: r.entry });
			else failures.push(r.failure);
		}

		return { successes, failures } satisfies GenerateOutputFilesResult;
	});
```

`os.cpus()` is Node-only; for browser/Workers it's used only when `exportOptions.concurrency` is unset. We accept the import here because `node:os` is externalised by Vite and dropped at bundle time in non-Node consumers — but for true browser compat we should fall back to a hard-coded default. Adjust:

Replace the `concurrency` line with:

```ts
const defaultConcurrency =
	typeof navigator !== "undefined" && "hardwareConcurrency" in navigator
		? navigator.hardwareConcurrency
		: typeof globalThis.process !== "undefined"
		? os.cpus().length
		: 4;
const concurrency = exportOptions.concurrency ?? defaultConcurrency;
```

This still imports `os` but only calls `os.cpus()` when `process` exists. Bundlers tree-shake `os` for browser builds, but the literal import string keeps it as a runtime require — for true elimination we'd need a conditional dynamic import. For this round, keep the static import and rely on `process` guarding the call site. Browser hosts that hit this path would break only if their bundler keeps `os.cpus()` reachable; since we guard, they don't.

If the lint/typecheck step in Task 33 flags `os.cpus` as unreachable in browser builds, replace the static import with:

```ts
let cpuCount = 4;
if (typeof globalThis.process !== "undefined") {
	const os = await import("node:os");
	cpuCount = os.cpus().length;
}
```

Top-level await is supported by ES modules; if the surrounding function isn't async, do this lazily via `Effect.sync(() => ...)` wrapping the import. For the first pass leave the static import in place — a follow-up can remove it if browser-side bundle audit complains.

### Task 30: Add `ZipOutput` layer

**Files:**
- Create: `packages/network-exporters/src/layers/ZipOutput.ts`
- Create: `packages/network-exporters/src/layers/__tests__/ZipOutput.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/network-exporters/src/layers/__tests__/ZipOutput.test.ts
import { Effect, Layer } from "effect";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { OutputEntry } from "../../output";
import { Output } from "../../services/Output";
import { makeZipOutput } from "../ZipOutput";

const encoder = new TextEncoder();

async function* bytesOf(text: string): AsyncIterable<Uint8Array> {
	yield encoder.encode(text);
}

describe("makeZipOutput", () => {
	it("zips a single entry through the sink and the unzip yields the original bytes", async () => {
		const captured: { fileName: string; bytes: Uint8Array | null } = { fileName: "", bytes: null };

		const sink = (stream: AsyncIterable<Uint8Array>, fileName: string) =>
			Effect.tryPromise({
				try: async () => {
					const chunks: Uint8Array[] = [];
					for await (const chunk of stream) chunks.push(chunk);
					const total = chunks.reduce((a, b) => a + b.length, 0);
					const bytes = new Uint8Array(total);
					let offset = 0;
					for (const c of chunks) {
						bytes.set(c, offset);
						offset += c.length;
					}
					captured.fileName = fileName;
					captured.bytes = bytes;
					return { key: fileName };
				},
				catch: (cause) => {
					throw cause;
				},
			});

		const program = Effect.gen(function* () {
			const out = yield* Output;
			const handle = yield* out.begin();
			const entry: OutputEntry = { name: "hello.txt", data: bytesOf("world") };
			yield* out.writeEntry(handle, entry);
			return yield* out.end(handle);
		});

		const result = await Effect.runPromise(program.pipe(Effect.provide(makeZipOutput(sink))));

		expect(captured.fileName).toMatch(/^networkCanvasExport-\d+\.zip$/);
		expect(captured.bytes).not.toBeNull();
		const unzipped = unzipSync(captured.bytes!);
		expect(new TextDecoder().decode(unzipped["hello.txt"]!)).toBe("world");
		expect(result.key).toBe(captured.fileName);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @codaco/network-exporters vitest run src/layers/__tests__/ZipOutput.test.ts
```

Expected: FAIL — `fflate` not installed and `makeZipOutput` not implemented.

- [ ] **Step 3: Add `fflate` as a direct dependency**

In `packages/network-exporters/package.json`, add to `dependencies` (alphabetical):

```json
"fflate": "^0.8.2"
```

Then:

```bash
pnpm install
```

Expected: `fflate` resolves to `node_modules`.

- [ ] **Step 4: Implement `ZipOutput.ts`**

```ts
// packages/network-exporters/src/layers/ZipOutput.ts
import { Effect, Layer } from "effect";
import { Zip, ZipPassThrough } from "fflate";
import { OutputError } from "../errors";
import type { OutputEntry, OutputResult } from "../output";
import { Output } from "../services/Output";

const ARCHIVE_PREFIX = "networkCanvasExport";

type ZipStreamHandle = {
	readonly fileName: string;
	readonly iterable: AsyncIterable<Uint8Array>;
	appendEntry: (name: string, data: AsyncIterable<Uint8Array>) => Promise<void>;
	finalize: () => Promise<void>;
	abort: (cause: unknown) => void;
};

function createFflateZipStream(fileName: string): ZipStreamHandle {
	const queue: (Uint8Array | null)[] = [];
	let resolveNext: (() => void) | null = null;
	let rejectNext: ((cause: unknown) => void) | null = null;
	let aborted: unknown = null;

	const onChunk = (chunk: Uint8Array, final: boolean) => {
		queue.push(chunk);
		if (final) queue.push(null);
		if (resolveNext) {
			const r = resolveNext;
			resolveNext = null;
			rejectNext = null;
			r();
		}
	};

	const zip = new Zip((err, chunk, final) => {
		if (err) {
			aborted = err;
			if (rejectNext) {
				const r = rejectNext;
				resolveNext = null;
				rejectNext = null;
				r(err);
			}
			return;
		}
		onChunk(chunk, final);
	});

	const iterable: AsyncIterable<Uint8Array> = {
		[Symbol.asyncIterator]: () => ({
			next: () =>
				new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
					if (aborted) {
						reject(aborted);
						return;
					}
					if (queue.length > 0) {
						const head = queue.shift();
						if (head === null) {
							resolve({ value: undefined as unknown as Uint8Array, done: true });
						} else {
							resolve({ value: head!, done: false });
						}
						return;
					}
					resolveNext = () => {
						const head = queue.shift();
						if (head === null) {
							resolve({ value: undefined as unknown as Uint8Array, done: true });
						} else {
							resolve({ value: head!, done: false });
						}
					};
					rejectNext = reject;
				}),
		}),
	};

	const appendEntry = async (name: string, data: AsyncIterable<Uint8Array>) => {
		const passThrough = new ZipPassThrough(name);
		zip.add(passThrough);
		for await (const chunk of data) {
			passThrough.push(chunk);
		}
		passThrough.push(new Uint8Array(0), true);
	};

	const finalize = async () => {
		zip.end();
	};

	const abort = (cause: unknown) => {
		aborted = cause;
		if (rejectNext) {
			const r = rejectNext;
			resolveNext = null;
			rejectNext = null;
			r(cause);
		}
	};

	return { fileName, iterable, appendEntry, finalize, abort };
}

export type ZipSink = (
	zipStream: AsyncIterable<Uint8Array>,
	fileName: string,
) => Effect.Effect<OutputResult, OutputError>;

export const makeZipOutput = (sink: ZipSink): Layer.Layer<Output> =>
	Layer.succeed(Output, {
		begin: () =>
			Effect.sync(() => {
				const fileName = `${ARCHIVE_PREFIX}-${Date.now()}.zip`;
				const handle = createFflateZipStream(fileName);
				const sinkPromise = Effect.runPromise(sink(handle.iterable, fileName));
				return { handle, sinkPromise };
			}),

		writeEntry: (rawHandle, entry) => {
			const { handle } = rawHandle as { handle: ZipStreamHandle };
			return Effect.tryPromise({
				try: () => handle.appendEntry(entry.name, entry.data),
				catch: (cause) => new OutputError({ cause }),
			});
		},

		end: (rawHandle) => {
			const { handle, sinkPromise } = rawHandle as {
				handle: ZipStreamHandle;
				sinkPromise: Promise<OutputResult>;
			};
			return Effect.tryPromise({
				try: async () => {
					await handle.finalize();
					return await sinkPromise;
				},
				catch: (cause) => new OutputError({ cause }),
			});
		},
	});
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @codaco/network-exporters vitest run src/layers/__tests__/ZipOutput.test.ts
```

Expected: PASS — round-tripped bytes match.

### Task 31: Add `Output` lifecycle test (fake recorder)

**Files:**
- Create: `packages/network-exporters/src/services/__tests__/Output.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { OutputEntry } from "../../output";
import { Output } from "../Output";

describe("Output Tag (recorder layer)", () => {
	it("records the order of begin → writeEntry → end", async () => {
		const log: string[] = [];

		const RecorderOutput = Layer.succeed(Output, {
			begin: () =>
				Effect.sync(() => {
					log.push("begin");
					return { id: "h1" };
				}),
			writeEntry: (_handle, entry: OutputEntry) =>
				Effect.sync(() => {
					log.push(`writeEntry:${entry.name}`);
				}),
			end: () =>
				Effect.sync(() => {
					log.push("end");
					return { key: "result" };
				}),
		});

		const program = Effect.gen(function* () {
			const out = yield* Output;
			const h = yield* out.begin();
			yield* out.writeEntry(h, { name: "a.csv", data: (async function* () {})() });
			yield* out.writeEntry(h, { name: "b.csv", data: (async function* () {})() });
			return yield* out.end(h);
		});

		const result = await Effect.runPromise(program.pipe(Effect.provide(RecorderOutput)));

		expect(log).toEqual(["begin", "writeEntry:a.csv", "writeEntry:b.csv", "end"]);
		expect(result.key).toBe("result");
	});
});
```

- [ ] **Step 2: Run test**

```bash
pnpm --filter @codaco/network-exporters vitest run src/services/__tests__/Output.test.ts
```

Expected: PASS.

### Task 32: Delete `archive.ts`

**Files:**
- Delete: `packages/network-exporters/src/session/archive.ts`

- [ ] **Step 1: Delete**

```bash
git rm packages/network-exporters/src/session/archive.ts
```

### Task 33: Rewrite `pipeline.ts`

**Files:**
- Modify: `packages/network-exporters/src/pipeline.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { Effect, Queue, Ref } from "effect";
import { stageMessages } from "./events";
import type { ExportEvent } from "./events";
import type { InterviewExportInput } from "./input";
import type { ExportOptions } from "./options";
import type { ExportFailure, ExportReturn, ExportSuccess } from "./output";
import { InterviewRepository } from "./services/InterviewRepository";
import { Output } from "./services/Output";
import { generateOutputFilesEffect } from "./session/generateOutputFiles";
import { processSessions } from "./session/processSessions";

export type ExportedProtocol = import("./input").ProtocolExportInput;

export const exportPipeline = (
	interviewIds: string[],
	exportOptions: ExportOptions,
	progressQueue: Queue.Enqueue<ExportEvent>,
) =>
	Effect.gen(function* () {
		const repo = yield* InterviewRepository;
		const output = yield* Output;

		yield* Queue.offer(progressQueue, {
			type: "stage",
			stage: "fetching",
			message: stageMessages.fetching,
		});

		const sessions: InterviewExportInput[] = yield* repo
			.getForExport(interviewIds)
			.pipe(Effect.withSpan("export.fetch"));

		yield* Queue.offer(progressQueue, {
			type: "stage",
			stage: "formatting",
			message: stageMessages.formatting,
		});

		const failuresRef = yield* Ref.make<ExportFailure[]>([]);

		const { grouped, protocols, failures: formatFailures } = yield* processSessions(
			sessions,
			exportOptions,
		).pipe(Effect.withSpan("export.format"));

		yield* Ref.update(failuresRef, (curr) => [...curr, ...formatFailures]);

		const { successes, failures: generationFailures } = yield* generateOutputFilesEffect(
			protocols,
			exportOptions,
			grouped,
			progressQueue,
		).pipe(Effect.withSpan("export.generateFiles"));

		yield* Ref.update(failuresRef, (curr) => [...curr, ...generationFailures]);

		yield* Queue.offer(progressQueue, {
			type: "stage",
			stage: "outputting",
			message: stageMessages.outputting,
		});

		const handle = yield* output.begin().pipe(Effect.withSpan("export.outputBegin"));

		const total = successes.length;
		let written = 0;
		for (const { entry } of successes) {
			yield* output.writeEntry(handle, entry).pipe(Effect.withSpan("export.writeEntry"));
			written += 1;
			yield* Queue.offer(progressQueue, {
				type: "progress",
				stage: "outputting",
				current: written,
				total,
			});
		}

		const outputResult = yield* output.end(handle).pipe(Effect.withSpan("export.outputEnd"));

		const finalFailures = yield* Ref.get(failuresRef);
		const successfulExports: ExportSuccess[] = successes.map((s) => s.success);

		const result: ExportReturn = {
			status: finalFailures.length > 0 ? "partial" : "success",
			successfulExports,
			failedExports: finalFailures,
			output: outputResult,
		};

		return result;
	});
```

### Task 34: Phase-5 commit

- [ ] **Step 1: Stage and commit Phase 5**

```bash
git add packages/network-exporters/src/pipeline.ts \
        packages/network-exporters/src/session/exportFile.ts \
        packages/network-exporters/src/session/generateOutputFiles.ts \
        packages/network-exporters/src/layers/ZipOutput.ts \
        packages/network-exporters/src/layers/__tests__/ZipOutput.test.ts \
        packages/network-exporters/src/services/__tests__/Output.test.ts \
        packages/network-exporters/package.json \
        pnpm-lock.yaml
git commit -m "feat(network-exporters): integrate Output service and ZipOutput layer; remove temp-file generation"
```

---

## Phase 6 — Build config and end-to-end tests

### Task 35: Update `vite.config.ts`

**Files:**
- Modify: `packages/network-exporters/vite.config.ts`

- [ ] **Step 1: Rewrite the entries and externals**

```ts
/// <reference types="vitest" />

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: {
				pipeline: resolve(__dirname, "src/pipeline.ts"),
				options: resolve(__dirname, "src/options.ts"),
				input: resolve(__dirname, "src/input.ts"),
				output: resolve(__dirname, "src/output.ts"),
				events: resolve(__dirname, "src/events.ts"),
				errors: resolve(__dirname, "src/errors.ts"),
				"services/InterviewRepository": resolve(__dirname, "src/services/InterviewRepository.ts"),
				"services/ProtocolRepository": resolve(__dirname, "src/services/ProtocolRepository.ts"),
				"services/Output": resolve(__dirname, "src/services/Output.ts"),
				"layers/ZipOutput": resolve(__dirname, "src/layers/ZipOutput.ts"),
			},
			formats: ["es"],
		},
		rolldownOptions: {
			external: [
				"@codaco/protocol-validation",
				"@codaco/shared-consts",
				"@xmldom/xmldom",
				"effect",
				"es-toolkit",
				"es-toolkit/compat",
				"fflate",
				"ohash",
				"sanitize-filename",
				"zod",
				"zod/mini",
				/^node:/,
			],
		},
	},
	plugins: [
		dts({
			rollupTypes: false,
			insertTypesEntry: false,
		}),
	],
});
```

`archiver` is removed from externals; `fflate` is added. `services/FileStorage`, `services/FileSystem`, and `layers/NodeFileSystem` entries are removed; `services/ProtocolRepository`, `services/Output`, and `layers/ZipOutput` are added.

### Task 36: Update `package.json`

**Files:**
- Modify: `packages/network-exporters/package.json`

- [ ] **Step 1: Update `exports`, `dependencies`, `devDependencies`**

Replace the `exports` map with:

```json
"exports": {
	"./pipeline": {
		"types": "./dist/pipeline.d.ts",
		"import": "./dist/pipeline.js"
	},
	"./options": {
		"types": "./dist/options.d.ts",
		"import": "./dist/options.js"
	},
	"./input": {
		"types": "./dist/input.d.ts",
		"import": "./dist/input.js"
	},
	"./output": {
		"types": "./dist/output.d.ts",
		"import": "./dist/output.js"
	},
	"./events": {
		"types": "./dist/events.d.ts",
		"import": "./dist/events.js"
	},
	"./errors": {
		"types": "./dist/errors.d.ts",
		"import": "./dist/errors.js"
	},
	"./services/InterviewRepository": {
		"types": "./dist/services/InterviewRepository.d.ts",
		"import": "./dist/services/InterviewRepository.js"
	},
	"./services/ProtocolRepository": {
		"types": "./dist/services/ProtocolRepository.d.ts",
		"import": "./dist/services/ProtocolRepository.js"
	},
	"./services/Output": {
		"types": "./dist/services/Output.d.ts",
		"import": "./dist/services/Output.js"
	},
	"./layers/ZipOutput": {
		"types": "./dist/layers/ZipOutput.d.ts",
		"import": "./dist/layers/ZipOutput.js"
	}
}
```

In `dependencies`: remove `archiver`; ensure `fflate` is present (added in Task 30 step 3). The block should be:

```json
"dependencies": {
	"@codaco/protocol-validation": "workspace:*",
	"@codaco/shared-consts": "workspace:*",
	"@xmldom/xmldom": "catalog:",
	"effect": "catalog:",
	"es-toolkit": "catalog:",
	"fflate": "^0.8.2",
	"ohash": "catalog:",
	"sanitize-filename": "catalog:",
	"zod": "catalog:"
}
```

In `devDependencies`: remove `@types/archiver`. The block should be:

```json
"devDependencies": {
	"@codaco/tsconfig": "workspace:*",
	"@types/node": "catalog:",
	"typescript": "catalog:",
	"vite": "catalog:",
	"vite-plugin-dts": "catalog:",
	"vitest": "catalog:"
}
```

- [ ] **Step 2: Reinstall**

```bash
pnpm install
```

### Task 37: Update `errors.test.ts`

**Files:**
- Modify: `packages/network-exporters/src/__tests__/errors.test.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { describe, expect, it } from "vitest";
import {
	DatabaseError,
	describeExportError,
	ExportGenerationError,
	OutputError,
	ProtocolNotFoundError,
	SessionProcessingError,
} from "../errors";

describe("describeExportError", () => {
	it("detects ENOSPC from a NodeJS.ErrnoException via OutputError", () => {
		const cause = Object.assign(new Error("write failed"), { code: "ENOSPC" });
		const err = new OutputError({ cause });
		expect(describeExportError(err, "outputting")).toMatch(/disk space/i);
	});

	it("detects out-of-memory errors via cause inspection", () => {
		const cause = new Error("JavaScript heap out of memory");
		const err = new OutputError({ cause });
		expect(describeExportError(err, "outputting")).toMatch(/memory/i);
	});

	it("returns a tag-aware fallback when the cause is unrecognised", () => {
		const err = new DatabaseError({ cause: new Error("???") });
		expect(describeExportError(err, "fetching interviews")).toMatch(/database connection failed.*fetching interviews/i);
	});

	it("describes per-file ExportGenerationError with file context", () => {
		const err = new ExportGenerationError({
			cause: new Error("bad codebook"),
			format: "attributeList",
			sessionId: "session-A",
			partitionEntity: "person",
		});
		const message = describeExportError(err);
		expect(message).toContain("attributeList");
		expect(message).toContain("person");
		expect(message).toContain("session-A");
	});

	it("describes ProtocolNotFoundError with hash and session id", () => {
		const err = new ProtocolNotFoundError({ hash: "h1", sessionId: "s1" });
		expect(describeExportError(err)).toMatch(/protocol h1.*not found.*s1/i);
	});

	it("describes SessionProcessingError with stage and session id", () => {
		const err = new SessionProcessingError({
			cause: new Error("ego missing"),
			stage: "insertEgo",
			sessionId: "s2",
		});
		expect(describeExportError(err)).toMatch(/session s2.*insertEgo.*ego missing/i);
	});
});
```

### Task 38: Rewrite `pipeline.test.ts`

**Files:**
- Modify: `packages/network-exporters/src/__tests__/pipeline.test.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { Effect, Layer, Queue } from "effect";
import { describe, expect, it, vi } from "vitest";
import { DatabaseError, describeExportError } from "../errors";
import type { ExportEvent } from "../events";
import type { InterviewExportInput, ProtocolExportInput } from "../input";
import type { OutputEntry } from "../output";
import { exportPipeline } from "../pipeline";
import { InterviewRepository } from "../services/InterviewRepository";
import { Output } from "../services/Output";
import { ProtocolRepository } from "../services/ProtocolRepository";
import type * as GetFormatterModule from "../utils/getFormatter";

vi.mock("../utils/getFormatter", async (importOriginal) => {
	const original = await importOriginal<typeof GetFormatterModule>();
	return {
		...original,
		getFormatter: (format: Parameters<typeof original.getFormatter>[0]) => {
			if (format === "attributeList") {
				return () => {
					throw new Error("mock formatter failure");
				};
			}
			return original.getFormatter(format);
		},
	};
});

const defaultExportOptions = {
	exportGraphML: true,
	exportCSV: false,
	globalOptions: {
		useScreenLayoutCoordinates: true,
		screenLayoutHeight: 1080,
		screenLayoutWidth: 1920,
	},
};

const protocol = (hash: string): ProtocolExportInput => ({
	hash,
	name: `Protocol ${hash}`,
	codebook: { node: {}, edge: {} },
});

const recordingOutput = () => {
	const writes: string[] = [];
	const Layer_ = Layer.succeed(Output, {
		begin: () => Effect.succeed({ id: "h" }),
		writeEntry: (_h, entry: OutputEntry) =>
			Effect.sync(() => {
				writes.push(entry.name);
			}),
		end: () => Effect.succeed({ key: "k", url: "http://test/k" }),
	});
	return { layer: Layer_, writes };
};

describe("exportPipeline", () => {
	it("returns error when database fetch fails", async () => {
		const MockRepo = Layer.succeed(InterviewRepository, {
			getForExport: () =>
				Effect.fail(new DatabaseError({ cause: new Error("connection refused") })),
		});
		const MockProtocols = Layer.succeed(ProtocolRepository, {
			getProtocols: () => Effect.succeed({}),
		});
		const { layer: Out } = recordingOutput();
		const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

		const result = await Effect.gen(function* () {
			const queue = yield* Queue.unbounded<ExportEvent>();
			return yield* exportPipeline(["test-id"], defaultExportOptions, queue).pipe(
				Effect.catchAll((error) =>
					Effect.succeed({
						status: "error" as const,
						error: describeExportError(error, "fetching interviews"),
					}),
				),
			);
		}).pipe(Effect.provide(layer), Effect.runPromise);

		expect(result.status).toBe("error");
		if (result.status !== "error") throw new Error("Expected error status");
		expect(result.error).toMatch(/database connection failed.*fetching interviews/i);
	});

	it("emits all stage events in order on successful export", async () => {
		const session: InterviewExportInput = {
			id: "test-interview-1",
			participantIdentifier: "p1",
			startTime: new Date("2025-01-01"),
			finishTime: new Date("2025-01-01"),
			network: { nodes: [], edges: [], ego: { _uid: "ego-1", attributes: {} } },
			protocolHash: "h1",
		};

		const MockRepo = Layer.succeed(InterviewRepository, {
			getForExport: () => Effect.succeed([session]),
		});
		const MockProtocols = Layer.succeed(ProtocolRepository, {
			getProtocols: () => Effect.succeed({ h1: protocol("h1") }),
		});
		const { layer: Out } = recordingOutput();
		const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

		const { result, events } = await Effect.gen(function* () {
			const queue = yield* Queue.unbounded<ExportEvent>();
			const pipelineResult = yield* exportPipeline(["test-interview-1"], defaultExportOptions, queue).pipe(
				Effect.catchAll((error) =>
					Effect.succeed({ status: "error" as const, error: describeExportError(error) }),
				),
			);
			const allEvents = yield* Queue.takeAll(queue);
			return { result: pipelineResult, events: [...allEvents] };
		}).pipe(Effect.provide(layer), Effect.runPromise);

		const stageOrder = events
			.filter((e) => e.type === "stage")
			.map((e) => (e.type === "stage" ? e.stage : ""));
		expect(stageOrder).toEqual(["fetching", "formatting", "generating", "outputting"]);
		expect(result.status).not.toBe("error");
	});

	it("returns status=partial when one file generation fails", async () => {
		const session: InterviewExportInput = {
			id: "test-interview-2",
			participantIdentifier: "p2",
			startTime: new Date("2025-01-01"),
			finishTime: new Date("2025-01-01"),
			network: { nodes: [], edges: [], ego: { _uid: "ego-2", attributes: {} } },
			protocolHash: "h2",
		};

		const MockRepo = Layer.succeed(InterviewRepository, {
			getForExport: () => Effect.succeed([session]),
		});
		const MockProtocols = Layer.succeed(ProtocolRepository, {
			getProtocols: () => Effect.succeed({ h2: protocol("h2") }),
		});
		const { layer: Out, writes } = recordingOutput();
		const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

		const opts = { ...defaultExportOptions, exportCSV: true };

		const result = await Effect.gen(function* () {
			const queue = yield* Queue.unbounded<ExportEvent>();
			return yield* exportPipeline(["test-interview-2"], opts, queue);
		}).pipe(Effect.provide(layer), Effect.runPromise);

		expect(result.status).toBe("partial");
		expect(result.failedExports).toHaveLength(1);
		expect(result.failedExports[0]?.kind).toBe("generation");
		if (result.failedExports[0]?.kind === "generation") {
			expect(result.failedExports[0].format).toBe("attributeList");
			expect(result.failedExports[0].sessionId).toBe("test-interview-2");
		}
		expect(result.successfulExports.length).toBeGreaterThan(0);
		expect(writes.length).toBe(result.successfulExports.length);
		expect(result.output.key).toBe("k");
		expect(result.output.url).toBe("http://test/k");
	});

	it("routes sessions whose protocol is missing into failedExports with kind=protocol-missing", async () => {
		const sessions: InterviewExportInput[] = [
			{
				id: "s-ok",
				participantIdentifier: "p-ok",
				startTime: new Date("2025-01-01"),
				finishTime: new Date("2025-01-01"),
				network: { nodes: [], edges: [], ego: { _uid: "ego", attributes: {} } },
				protocolHash: "hA",
			},
			{
				id: "s-missing",
				participantIdentifier: "p-missing",
				startTime: new Date("2025-01-01"),
				finishTime: new Date("2025-01-01"),
				network: { nodes: [], edges: [], ego: { _uid: "ego", attributes: {} } },
				protocolHash: "hMISSING",
			},
		];

		const MockRepo = Layer.succeed(InterviewRepository, {
			getForExport: () => Effect.succeed(sessions),
		});
		const MockProtocols = Layer.succeed(ProtocolRepository, {
			getProtocols: () => Effect.succeed({ hA: protocol("hA") }),
		});
		const { layer: Out } = recordingOutput();
		const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

		const result = await Effect.gen(function* () {
			const queue = yield* Queue.unbounded<ExportEvent>();
			return yield* exportPipeline(["s-ok", "s-missing"], defaultExportOptions, queue);
		}).pipe(Effect.provide(layer), Effect.runPromise);

		expect(result.status).toBe("partial");
		const missingFailures = result.failedExports.filter((f) => f.kind === "protocol-missing");
		expect(missingFailures).toHaveLength(1);
		expect(missingFailures[0]?.sessionId).toBe("s-missing");
		expect(result.successfulExports.length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run all tests**

```bash
pnpm --filter @codaco/network-exporters test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @codaco/network-exporters typecheck
```

Expected: clean.

- [ ] **Step 4: Run lint**

```bash
pnpm --filter @codaco/network-exporters lint:fix
```

Expected: no errors. If unused imports remain in deleted-feature paths, lint:fix will remove them.

- [ ] **Step 5: Run build**

```bash
pnpm --filter @codaco/network-exporters build
```

Expected: builds clean. Confirm `dist/` contains the new entries: `services/ProtocolRepository.js`, `services/Output.js`, `layers/ZipOutput.js`. Confirm absence of `services/FileStorage.js`, `services/FileSystem.js`, `layers/NodeFileSystem.js`.

```bash
ls packages/network-exporters/dist
ls packages/network-exporters/dist/services
ls packages/network-exporters/dist/layers
```

### Task 39: Phase-6 commit

- [ ] **Step 1: Stage and commit Phase 6**

```bash
git add packages/network-exporters/src/__tests__ \
        packages/network-exporters/vite.config.ts \
        packages/network-exporters/package.json \
        pnpm-lock.yaml
git commit -m "test(network-exporters): rewrite pipeline tests for new service surface; update build config"
```

---

## Phase 7 — Documentation and changeset

### Task 40: Rewrite `README.md`

**Files:**
- Modify: `packages/network-exporters/README.md`

- [ ] **Step 1: Replace the README**

The README must reflect: three Tags (`InterviewRepository`, `ProtocolRepository`, `Output`); the lifecycle interface for `Output` (`begin`/`writeEntry`/`end`); the four-stage pipeline (`fetching → formatting → generating → outputting`); the new `ExportReturn` shape (`output: OutputResult` instead of `zipUrl`/`zipKey`); the unified `failedExports` array with `kind` discriminator; and `makeZipOutput` as the shipped layer for hosts that want bundled-zip behaviour. The three reference host integrations (S3, Blob, OPFS folder) from §7.1 of the spec belong in the Usage section.

Use the spec's Section 1 (Goals) as the basis for the "Why a package" intro. Use Sections 2.1, 3, 4, 5, 6, 7 as the basis for the corresponding README sections. Keep the structure:

```
# @codaco/network-exporters
## Why a package
## Architecture (with three-Tag diagram)
## Public surface (sub-paths table; copy from spec §8)
## Usage
  ### 1. Provide an InterviewRepository (with new shape)
  ### 2. Provide a ProtocolRepository (new section)
  ### 3. Provide an Output  (replaces "Provide a FileStorage")
    #### S3 with ZipOutput (Node)
    #### Browser blob with ZipOutput
    #### OPFS folder (no zip)
  ### 4. Run the pipeline (updated example)
## Pipeline stages (4 stages, updated table)
## Concurrency (unchanged)
## Error model (updated: OutputError; partial-channel for ProtocolNotFound + SessionProcessing)
## Progress events (updated: outputting + per-entry progress)
## Local development (unchanged)
## Versioning (unchanged)
## License (unchanged)
```

Copy code blocks directly from the spec where helpful. Do not invent host integrations beyond the three referenced.

### Task 41: Add changeset

**Files:**
- Create: `.changeset/network-exporters-runtime-agnostic.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@codaco/network-exporters": major
---

Runtime-agnostic redesign. Removes Node-only types from the public surface and the core pipeline. Three injected services (`InterviewRepository`, `ProtocolRepository`, `Output`) replace the previous `InterviewRepository` + `FileStorage` + `FileSystem` trio. Streams flow as `AsyncIterable<Uint8Array>`. Bundling is a host concern; the package ships `makeZipOutput` (pure-JS via fflate) for hosts that want today's bundled-zip behaviour.

Breaking changes:

- `InterviewExportInput.protocol` is replaced by `InterviewExportInput.protocolHash`. Hosts implement a new `ProtocolRepository` Tag that returns `Record<hash, ProtocolExportInput>` for unique hashes.
- `FileStorage` and `FileSystem` Tags are replaced by a single stateful `Output` Tag (`begin`/`writeEntry`/`end`). The shipped `NodeFileSystem` layer is removed.
- `parseNcNetwork` is removed from public exports; hosts call `NcNetworkSchema.parse()` directly.
- `ExportReturn.zipUrl` / `zipKey` are replaced by `ExportReturn.output: OutputResult` (host-defined).
- `ExportFailure` is now a tagged union with `kind: "generation" | "protocol-missing" | "session-processing"`.
- `FileStorageError`, `FileSystemError`, and `ArchiveError` are collapsed into a single `OutputError`.
- The `archiving` and `uploading` stage event values are replaced by a single `outputting` value.

Hosts that previously wrapped the package as in the README's `S3Storage` example migrate by replacing the `FileStorage` Layer with `makeZipOutput(s3Sink)`, splitting protocol joins out of `InterviewRepository.getForExport`, and adding a small `ProtocolRepository` Layer that batch-fetches protocols by hash.
```

### Task 42: Final verification

- [ ] **Step 1: Run the full check**

```bash
pnpm --filter @codaco/network-exporters lint
pnpm --filter @codaco/network-exporters typecheck
pnpm --filter @codaco/network-exporters test
pnpm --filter @codaco/network-exporters build
```

Expected: all clean.

- [ ] **Step 2: Verify no `node:*` imports remain in core (excluding `node:os` in `generateOutputFiles.ts`)**

```bash
grep -rn '"node:' packages/network-exporters/src \
  --include='*.ts' \
  --exclude-dir=__tests__
```

Expected: only matches in `session/generateOutputFiles.ts` for `node:os`. If anything else remains in core paths, fix it before continuing.

- [ ] **Step 3: Verify no `archiver` or removed types remain anywhere**

```bash
grep -rn 'archiver\|FileStorage\|FileSystem\|NodeFileSystem\|parseNcNetwork\|ArchiveError\|FileStorageError\|FileSystemError' \
  packages/network-exporters/src
```

Expected: no matches.

### Task 43: Phase-7 commit

- [ ] **Step 1: Stage and commit Phase 7**

```bash
git add packages/network-exporters/README.md \
        .changeset/network-exporters-runtime-agnostic.md
git commit -m "docs(network-exporters): rewrite README and add changeset for runtime-agnostic redesign"
```

---

## Final state

After all 43 tasks:

- Core `src/` has no `node:fs`, `node:os` (except guarded fallback in `generateOutputFiles.ts`), `node:stream`, `node:path`, or `archiver` imports.
- Three Tags compose the package: `InterviewRepository`, `ProtocolRepository`, `Output`.
- `makeZipOutput(sink)` ships at `@codaco/network-exporters/layers/ZipOutput`.
- Per-session failures (missing protocol, processing, generation) all surface in a single `failedExports` array with a `kind` discriminator.
- The pipeline emits four stage events plus per-entry progress events for `generating` and `outputting`.
- Tests cover: per-session error routing, missing-protocol handling, Output lifecycle ordering, ZipOutput round-trip, end-to-end pipeline.
- Build config externalises `fflate`, drops `archiver`, and emits the new entry points.
- README, spec, and changeset are aligned.
