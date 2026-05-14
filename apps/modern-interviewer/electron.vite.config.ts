import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Three-process config matching architect-desktop's pattern. The main and
// preload bundles are produced by Vite's library mode (one entry each).
// The renderer reuses the regular web Vite plugin set (React + Tailwind).
export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/main",
			rollupOptions: {
				input: resolve(rootDir, "electron/main.ts"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/preload",
			rollupOptions: {
				input: resolve(rootDir, "electron/preload.ts"),
			},
		},
	},
	renderer: {
		root: rootDir,
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				"~": resolve(rootDir, "src"),
			},
		},
		build: {
			outDir: "out/renderer",
			rollupOptions: {
				input: {
					index: resolve(rootDir, "index.html"),
				},
			},
		},
	},
});
