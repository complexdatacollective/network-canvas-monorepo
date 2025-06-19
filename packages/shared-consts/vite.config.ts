
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "SharedConsts",
			fileName: "index",
			formats: ["es", "cjs"],
		},
		rollupOptions: {
			external: ["zod"],
			output: {
				globals: {
					zod: "zod",
				},
			},
		},
	},
	plugins: [
		dts({
			rollupTypes: true,
		}),
	],
});