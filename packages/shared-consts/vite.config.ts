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
	server: {
		cors: {
			origin: process.env.NODE_ENV === "development" ? true : false,
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
		},
	},
	plugins: [
		dts({
			rollupTypes: true,
		}),
	],
});
