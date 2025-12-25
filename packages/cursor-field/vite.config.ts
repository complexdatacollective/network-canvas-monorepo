import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
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
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				react: resolve(__dirname, "src/react/index.ts"),
				vanilla: resolve(__dirname, "src/vanilla/index.ts"),
				shared: resolve(__dirname, "src/shared/index.ts"),
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: ["react", "react-dom", "react/jsx-runtime"],
			output: {
				globals: {
					react: "React",
					"react-dom": "ReactDOM",
					"react/jsx-runtime": "jsxRuntime",
				},
			},
		},
	},
	plugins: [
		react(),
		dts({
			insertTypesEntry: true,
		}),
	],
});
