/// <reference types="vitest" />

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "NetworkExporters",
			fileName: "index",
			formats: ["es"],
		},
		rollupOptions: {
			external: [
				"@codaco/protocol-validation",
				"@codaco/shared-consts",
				"@xmldom/xmldom",
				"es-toolkit",
				"es-toolkit/compat",
				"ohash",
				"sanitize-filename",
				"zod",
				"node:stream",
				"node:crypto",
			],
		},
	},
	plugins: [
		dts({
			rollupTypes: false,
			insertTypesEntry: true,
		}),
	],
});
