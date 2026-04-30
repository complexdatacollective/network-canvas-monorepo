import { Effect, Queue, Ref } from "effect";
import type { ExportEvent } from "./events";
import { stageMessages } from "./events";
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

		const {
			grouped,
			protocols,
			failures: formatFailures,
		} = yield* processSessions(sessions, exportOptions).pipe(Effect.withSpan("export.format"));

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
