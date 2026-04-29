/// <reference types="vitest" />

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: {
				pipeline: resolve(__dirname, "src/pipeline.ts"),
				options: resolve(__dirname, "src/options.ts"),
				input: resolve(__dirname, "src/input.ts"),
				output: resolve(__dirname, "src/output.ts"),
				events: resolve(__dirname, "src/events.ts"),
				errors: resolve(__dirname, "src/errors.ts"),
				"services/InterviewRepository": resolve(__dirname, "src/services/InterviewRepository.ts"),
				"services/FileStorage": resolve(__dirname, "src/services/FileStorage.ts"),
				"services/FileSystem": resolve(__dirname, "src/services/FileSystem.ts"),
				"layers/NodeFileSystem": resolve(__dirname, "src/layers/NodeFileSystem.ts"),
			},
			formats: ["es"],
		},
		rolldownOptions: {
			external: [
				"@codaco/protocol-validation",
				"@codaco/shared-consts",
				"@xmldom/xmldom",
				"archiver",
				"effect",
				"es-toolkit",
				"es-toolkit/compat",
				"ohash",
				"sanitize-filename",
				"zod",
				"zod/mini",
				/^node:/,
			],
		},
	},
	plugins: [
		dts({
			rollupTypes: false,
			insertTypesEntry: false,
		}),
	],
});
