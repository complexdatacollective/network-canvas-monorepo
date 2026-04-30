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
		const defaultConcurrency =
			typeof navigator !== "undefined" && "hardwareConcurrency" in navigator
				? navigator.hardwareConcurrency
				: typeof globalThis.process !== "undefined"
					? os.cpus().length
					: 4;
		const concurrency = exportOptions.concurrency ?? defaultConcurrency;
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
