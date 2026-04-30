import { Effect, Fiber, Layer } from "effect";
import { Zip, ZipPassThrough } from "fflate";
import { OutputError } from "../errors";
import type { OutputResult } from "../output";
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
		try {
			for await (const chunk of data) {
				passThrough.push(chunk);
			}
			passThrough.push(new Uint8Array(0), true);
		} catch (cause) {
			// Finalise the entry so fflate's internal state isn't left half-written,
			// then propagate so the Effect.tryPromise wrapper maps to OutputError.
			passThrough.push(new Uint8Array(0), true);
			throw cause;
		}
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
				// Forking keeps sink failures inside the Effect runtime so they propagate
				// through the join in `end` instead of becoming detached promise rejections.
				const sinkFiber = Effect.runFork(sink(handle.iterable, fileName));
				return { handle, sinkFiber };
			}),

		writeEntry: (rawHandle, entry) => {
			const { handle } = rawHandle as { handle: ZipStreamHandle };
			return Effect.tryPromise({
				try: () => handle.appendEntry(entry.name, entry.data),
				catch: (cause) => {
					handle.abort(cause);
					return new OutputError({ cause });
				},
			});
		},

		end: (rawHandle) => {
			const { handle, sinkFiber } = rawHandle as {
				handle: ZipStreamHandle;
				sinkFiber: Fiber.RuntimeFiber<OutputResult, OutputError>;
			};
			return Effect.tryPromise({
				try: () => handle.finalize(),
				catch: (cause) => {
					handle.abort(cause);
					return new OutputError({ cause });
				},
			}).pipe(
				Effect.flatMap(() =>
					Fiber.join(sinkFiber).pipe(
						Effect.catchAll((cause) =>
							cause instanceof OutputError ? Effect.fail(cause) : Effect.fail(new OutputError({ cause })),
						),
					),
				),
			);
		},
	});
