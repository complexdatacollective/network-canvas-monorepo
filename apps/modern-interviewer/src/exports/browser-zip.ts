import { OutputError } from "@codaco/network-exporters/errors";
import { makeZipOutput } from "@codaco/network-exporters/layers/ZipOutput";
import type { OutputResult } from "@codaco/network-exporters/output";
import { Effect, type Layer } from "effect";

/**
 * Browser ZipOutput layer. The shared ZipOutput layer asks the caller for
 * a "sink" that consumes the async iterable of zip chunks produced by
 * fflate. In a browser we collect the chunks into a single Blob and hand
 * the Blob back via the OutputResult so the page can offer it as a
 * download (or save it via the Capacitor Filesystem on tablet).
 *
 * The result type `OutputResult` is intentionally `Record<string, unknown>`
 * at the public-API layer, so passing the blob through there is sound.
 */
export const browserZipOutputLayer = (): Layer.Layer<import("@codaco/network-exporters/services/Output").Output> =>
	makeZipOutput((zipStream, fileName) =>
		Effect.tryPromise({
			try: async (): Promise<OutputResult> => {
				const chunks: Uint8Array[] = [];
				let total = 0;
				for await (const chunk of zipStream) {
					chunks.push(chunk);
					total += chunk.byteLength;
				}
				const merged = new Uint8Array(total);
				let offset = 0;
				for (const chunk of chunks) {
					merged.set(chunk, offset);
					offset += chunk.byteLength;
				}
				const blob = new Blob([merged as BlobPart], { type: "application/zip" });
				return {
					key: fileName,
					fileName,
					bytes: merged,
					blob,
					size: total,
				};
			},
			catch: (cause) => new OutputError({ cause }),
		}),
	);
