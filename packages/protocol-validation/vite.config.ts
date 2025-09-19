import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"~": resolve(__dirname, "./src"),
		},
	},
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
		dts({
			rollupTypes: false,
			insertTypesEntry: true,
		}),
	],
});
