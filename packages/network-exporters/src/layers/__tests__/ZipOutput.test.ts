import { Effect } from "effect";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { OutputError } from "../../errors";
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
				catch: (cause) => new OutputError({ cause }),
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
		const bytes = captured.bytes;
		if (bytes === null) throw new Error("captured.bytes was null");
		const unzipped = unzipSync(bytes);
		const helloFile = unzipped["hello.txt"];
		if (!helloFile) throw new Error("hello.txt missing from zip");
		expect(new TextDecoder().decode(helloFile)).toBe("world");
		expect(result.key).toBe(captured.fileName);
	});

	it("round-trips two entries through the sink", async () => {
		const captured: { bytes: Uint8Array | null } = { bytes: null };

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
					captured.bytes = bytes;
					return { key: fileName };
				},
				catch: (cause) => new OutputError({ cause }),
			});

		const program = Effect.gen(function* () {
			const out = yield* Output;
			const handle = yield* out.begin();
			yield* out.writeEntry(handle, { name: "a.txt", data: bytesOf("alpha") });
			yield* out.writeEntry(handle, { name: "b.txt", data: bytesOf("bravo") });
			return yield* out.end(handle);
		});

		await Effect.runPromise(program.pipe(Effect.provide(makeZipOutput(sink))));

		expect(captured.bytes).not.toBeNull();
		const bytes = captured.bytes;
		if (bytes === null) throw new Error("captured.bytes was null");
		const unzipped = unzipSync(bytes);
		const aFile = unzipped["a.txt"];
		if (!aFile) throw new Error("a.txt missing from zip");
		const bFile = unzipped["b.txt"];
		if (!bFile) throw new Error("b.txt missing from zip");
		expect(new TextDecoder().decode(aFile)).toBe("alpha");
		expect(new TextDecoder().decode(bFile)).toBe("bravo");
	});

	it("propagates a sink failure as OutputError", async () => {
		const sink = () => Effect.fail(new OutputError({ cause: new Error("sink rejected") }));

		const program = Effect.gen(function* () {
			const out = yield* Output;
			const handle = yield* out.begin();
			yield* out.writeEntry(handle, { name: "hello.txt", data: bytesOf("world") });
			return yield* out.end(handle);
		});

		const exit = await Effect.runPromise(program.pipe(Effect.provide(makeZipOutput(sink)), Effect.either));

		expect(exit._tag).toBe("Left");
		if (exit._tag === "Left") {
			expect(exit.left).toBeInstanceOf(OutputError);
		}
	});

	it("surfaces a throwing source iterable as OutputError without hanging end()", async () => {
		// Sink that drains chunks until the stream rejects (or completes).
		const sink = (stream: AsyncIterable<Uint8Array>, fileName: string) =>
			Effect.tryPromise({
				try: async () => {
					try {
						for await (const _chunk of stream) {
							// drain
						}
					} catch {
						// swallow - we want end() failure to come from writeEntry's error,
						// not from the sink rejecting first.
					}
					return { key: fileName };
				},
				catch: (cause) => new OutputError({ cause }),
			});

		async function* throwingSource(): AsyncIterable<Uint8Array> {
			yield encoder.encode("first");
			throw new Error("source exploded");
		}

		const program = Effect.gen(function* () {
			const out = yield* Output;
			const handle = yield* out.begin();
			const writeExit = yield* Effect.either(out.writeEntry(handle, { name: "boom.txt", data: throwingSource() }));
			expect(writeExit._tag).toBe("Left");
			if (writeExit._tag === "Left") {
				expect(writeExit.left).toBeInstanceOf(OutputError);
			}
			// end() must still complete (not hang) even though the stream was aborted.
			return yield* Effect.either(out.end(handle));
		});

		const endExit = await Effect.runPromise(program.pipe(Effect.provide(makeZipOutput(sink))));
		// We don't care whether end() succeeds or fails - only that it resolves promptly.
		expect(["Left", "Right"]).toContain(endExit._tag);
	});
});
