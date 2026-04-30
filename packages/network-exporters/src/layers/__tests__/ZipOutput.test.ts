import { Effect } from "effect";
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
