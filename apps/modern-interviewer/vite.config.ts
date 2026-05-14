import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Vite config shared by the web build, the desktop renderer, and the
// Capacitor (tablet) build. Capacitor wraps `dist/`, so we keep the
// regular Vite build self-contained — no platform-specific entry points.
export default defineConfig({
	root: rootDir,
	// Relative base so the same `dist/` works when loaded via `file://`
	// (Electron production) and `capacitor://localhost/` (iOS/Android).
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"~": resolve(rootDir, "src"),
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true,
	},
	server: {
		port: 5180,
		strictPort: false,
	},
});
