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
			getForExport: () => Effect.fail(new DatabaseError({ cause: new Error("connection refused") })),
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
				Effect.catchAll((error) => Effect.succeed({ status: "error" as const, error: describeExportError(error) })),
			);
			const allEvents = yield* Queue.takeAll(queue);
			return { result: pipelineResult, events: [...allEvents] };
		}).pipe(Effect.provide(layer), Effect.runPromise);

		const stageOrder = events.filter((e) => e.type === "stage").map((e) => (e.type === "stage" ? e.stage : ""));
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
