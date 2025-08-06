/// <reference types="vitest" />

import { execSync } from "node:child_process";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

const schemaPlugin = (): Plugin => {
	return {
		name: "schema",

		// watches the schema files for changes
		buildStart() {
			this.addWatchFile(path.resolve("src/schemas/"));
		},
		// runs when a file changes
		watchChange(file) {
			if (file.endsWith("zod.ts")) {
				console.log("🔄 Converting zod schema to json...", file);
				execSync("pnpm run zod-to-json src/schemas/8.zod.ts");
			}

			if (file.endsWith(".json")) {
				console.log("🔄 Recompiling all json schemas...", file);
				execSync("pnpm run compile-schemas");
			}
		},
	};
};

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "ProtocolValidation",
			// the proper extensions will be added
			fileName: "index",
			formats: ["es"],
		},
	},
	plugins: [
		schemaPlugin(),
		dts({
			rollupTypes: false,
			insertTypesEntry: true,
		}),
	],
});
