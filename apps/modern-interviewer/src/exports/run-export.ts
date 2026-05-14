import type { ExportEvent } from "@codaco/network-exporters/events";
import type { ExportOptions } from "@codaco/network-exporters/options";
import type { ExportReturn } from "@codaco/network-exporters/output";
import { exportPipeline } from "@codaco/network-exporters/pipeline";
import { Effect, Fiber, Layer, Queue } from "effect";
import { APP_VERSION } from "../env";
import { db } from "../lib/db";
import { browserZipOutputLayer } from "./browser-zip";
import { interviewRepositoryLayer, protocolRepositoryLayer } from "./repositories";

/** @public */
export type RunExportResult = {
	result: ExportReturn;
	bytes: Uint8Array;
	fileName: string;
};

/** @public */
export type ExportProgressListener = (event: ExportEvent) => void;

/** @public */
export type RunExportOptions = {
	interviewIds: string[];
	formats: { csv: boolean; graphml: boolean };
	useScreenLayoutCoordinates: boolean;
	screenLayoutWidth: number;
	screenLayoutHeight: number;
	onProgress?: ExportProgressListener;
};

const DEFAULT_FILE_NAME = (): string => `networkCanvasExport-${Date.now()}.zip`;

/**
 * High-level driver around `@codaco/network-exporters/exportPipeline`.
 *
 * Wires the Dexie-backed repositories + the browser ZipOutput layer,
 * forwards progress events to the caller, and after the pipeline
 * completes flips each successfully-exported interview's `exportTime` to
 * "now" so the dashboard can show it.
 */
export async function runExport(options: RunExportOptions): Promise<RunExportResult> {
	const exportOptions: ExportOptions = {
		exportGraphML: options.formats.graphml,
		exportCSV: options.formats.csv,
		globalOptions: {
			useScreenLayoutCoordinates: options.useScreenLayoutCoordinates,
			screenLayoutHeight: options.screenLayoutHeight,
			screenLayoutWidth: options.screenLayoutWidth,
		},
		concurrency: 2,
		appVersion: APP_VERSION,
		commitHash: "",
	};

	const layers = Layer.mergeAll(interviewRepositoryLayer, protocolRepositoryLayer, browserZipOutputLayer());

	const program = Effect.gen(function* () {
		const queue = yield* Queue.unbounded<ExportEvent>();

		// Drain the queue into the caller's callback on a background fiber.
		const drainer = yield* Effect.fork(
			Effect.gen(function* () {
				while (true) {
					const ev = yield* Queue.take(queue);
					options.onProgress?.(ev);
				}
			}),
		);

		const result = yield* exportPipeline(options.interviewIds, exportOptions, queue);
		yield* Fiber.interrupt(drainer);
		return result;
	});

	const result = await Effect.runPromise(program.pipe(Effect.provide(layers)));

	const output = result.output as { fileName?: string; bytes?: Uint8Array };
	const bytes = output.bytes ?? new Uint8Array(0);
	const fileName = output.fileName ?? DEFAULT_FILE_NAME();

	const successIds = new Set(result.successfulExports.map((s) => s.sessionId));
	if (successIds.size > 0) {
		const now = new Date().toISOString();
		await db.interviews
			.where("id")
			.anyOf([...successIds])
			.modify({ exportTime: now });
	}

	return { result, bytes, fileName };
}
