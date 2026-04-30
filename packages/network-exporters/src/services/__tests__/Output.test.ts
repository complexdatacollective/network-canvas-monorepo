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
