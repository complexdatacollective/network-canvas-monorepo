import { Effect, Layer } from "effect";
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
