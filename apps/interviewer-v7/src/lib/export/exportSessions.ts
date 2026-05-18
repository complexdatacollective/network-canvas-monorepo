import { DatabaseError } from "@codaco/network-exporters/errors";
import type { ExportEvent } from "@codaco/network-exporters/events";
import type { InterviewExportInput, ProtocolExportInput } from "@codaco/network-exporters/input";
import { makeZipOutput } from "@codaco/network-exporters/layers/ZipOutput";
import type { ExportOptions } from "@codaco/network-exporters/options";
import type { ExportReturn, OutputResult } from "@codaco/network-exporters/output";
import { exportPipeline } from "@codaco/network-exporters/pipeline";
import { InterviewRepository } from "@codaco/network-exporters/services/InterviewRepository";
import { ProtocolRepository } from "@codaco/network-exporters/services/ProtocolRepository";
import { Effect, Layer, Queue, Stream } from "effect";
import { getProtocolsByHashes, getSessionsByIds } from "../db/api";

const APP_VERSION = "0.1.0";

export type ExportProgress = ExportEvent;

const interviewRepoLayer = Layer.succeed(InterviewRepository, {
	getForExport: (ids) =>
		Effect.tryPromise({
			try: async () => {
				const records = await getSessionsByIds(ids);
				const inputs: InterviewExportInput[] = records.map((record) => ({
					id: record.id,
					participantIdentifier: record.caseId,
					startTime: new Date(record.startedAt),
					finishTime: record.finishedAt ? new Date(record.finishedAt) : null,
					network: record.network,
					protocolHash: record.protocolHash,
				}));
				return inputs;
			},
			catch: (cause) => new DatabaseError({ cause }),
		}),
});

const protocolRepoLayer = Layer.succeed(ProtocolRepository, {
	getProtocols: (hashes) =>
		Effect.tryPromise({
			try: async () => {
				const protocols = await getProtocolsByHashes(hashes);
				const out: Record<string, ProtocolExportInput> = {};
				for (const stored of protocols) {
					out[stored.hash] = {
						hash: stored.hash,
						name: stored.name,
						codebook: stored.codebook,
					};
				}
				return out;
			},
			catch: (cause) => new DatabaseError({ cause }),
		}),
});

function makeBlobSink() {
	let result: { blob: Blob; url: string; fileName: string } | null = null;
	const sink = (iterable: AsyncIterable<Uint8Array>, fileName: string) =>
		Effect.tryPromise({
			try: async (): Promise<OutputResult> => {
				const chunks: BlobPart[] = [];
				for await (const chunk of iterable) {
					chunks.push(new Uint8Array(chunk));
				}
				const blob = new Blob(chunks, { type: "application/zip" });
				const url = URL.createObjectURL(blob);
				result = { blob, url, fileName };
				return { key: fileName, url };
			},
			catch: (cause) => {
				throw cause;
			},
		});
	return {
		sink,
		getResult: () => result,
	};
}

export type ExportInvocation = {
	options: ExportOptions;
	sessionIds: string[];
	onEvent?: (event: ExportEvent) => void;
};

export type ExportRun = {
	result: ExportReturn;
	blob: Blob | null;
	url: string | null;
	fileName: string | null;
};

export async function runExport({ options, sessionIds, onEvent }: ExportInvocation): Promise<ExportRun> {
	const { sink, getResult } = makeBlobSink();
	const outputLayer = makeZipOutput(sink);

	const program = Effect.gen(function* () {
		const queue = yield* Queue.unbounded<ExportEvent>();

		const drain = Effect.forkScoped(
			Stream.fromQueue(queue).pipe(
				Stream.runForEach((event) =>
					Effect.sync(() => {
						onEvent?.(event);
					}),
				),
			),
		);

		yield* drain;

		const result = yield* exportPipeline(sessionIds, options, queue);
		yield* Queue.shutdown(queue);
		return result;
	});

	const result = await Effect.runPromise(
		Effect.scoped(program).pipe(Effect.provide(Layer.mergeAll(interviewRepoLayer, protocolRepoLayer, outputLayer))),
	);

	const sinkResult = getResult();
	return {
		result,
		blob: sinkResult?.blob ?? null,
		url: sinkResult?.url ?? null,
		fileName: sinkResult?.fileName ?? null,
	};
}

export function buildExportOptions(args: {
	exportGraphML: boolean;
	exportCSV: boolean;
	useScreenLayoutCoordinates: boolean;
	screenLayoutHeight: number;
	screenLayoutWidth: number;
}): ExportOptions {
	return {
		exportGraphML: args.exportGraphML,
		exportCSV: args.exportCSV,
		globalOptions: {
			useScreenLayoutCoordinates: args.useScreenLayoutCoordinates,
			screenLayoutHeight: args.screenLayoutHeight,
			screenLayoutWidth: args.screenLayoutWidth,
		},
		appVersion: APP_VERSION,
		commitHash: "interviewer-v7",
	};
}
