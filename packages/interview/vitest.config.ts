import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [react()],
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
	},
	test: {
		globals: true,
		exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/specs/**", "**/storybook-static/**"],
		projects: [
			{
				extends: true,
				test: {
					name: "units",
					environment: "jsdom",
					include: [
						"src/**/*.{test,spec}.{ts,tsx}",
						"src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
						"e2e/host/src/**/*.{test,spec}.{ts,tsx}",
					],
					exclude: ["**/*.stories.{ts,tsx}"],
				},
			},
			{
				extends: true,
				plugins: [
					storybookTest({
						configDir: path.join(dirname, ".storybook"),
						storybookScript: "storybook dev -p 6006 --no-open",
					}),
				],
				// d3-force is not reachable by Vite's static import scanner (it is
				// only pulled in at runtime via the virtual project-annotations
				// module). Without this, Vite discovers it as a new dependency
				// mid-run, re-optimises the bundle, changes the `browserv` hash and
				// invalidates in-flight fetches of setup-file-with-project-
				// annotations.js — producing "Failed to fetch dynamically imported
				// module" errors on every cold-cache run.
				optimizeDeps: {
					include: ["d3-force"],
				},
				test: {
					name: "storybook",
					testTimeout: 60_000,
					browser: {
						provider: playwright(),
						enabled: true,
						instances: [{ browser: "chromium" }],
						headless: true,
					},
					exclude: ["**/*.test.{ts,tsx}"],
				},
			},
		],
	},
});
