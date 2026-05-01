import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [react()],
	// `fuse.js` is imported lazily by the inlined search worker, so Vite's static
	// scanner doesn't see it before the first browser test starts. Pre-bundling it
	// here keeps Playwright's connection from being torn down by a mid-test
	// page reload when Vite re-bundles on demand.
	optimizeDeps: {
		include: ["fuse.js"],
	},
	test: {
		globals: true,
		exclude: ["**/node_modules/**", "**/dist/**"],
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					environment: "jsdom",
					setupFiles: [resolve(here, "src/test-setup.ts")],
					include: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
					exclude: ["**/node_modules/**", "**/dist/**", "**/*.stories.{ts,tsx}"],
					css: false,
				},
			},
			{
				extends: true,
				plugins: [
					storybookTest({
						configDir: resolve(here, ".storybook"),
						storybookScript: "storybook dev -p 6006 --no-open",
					}),
				],
				test: {
					name: "storybook",
					testTimeout: 60000,
					browser: {
						provider: playwright(),
						enabled: true,
						instances: [{ browser: "chromium" }],
						headless: true,
					},
					exclude: ["**/node_modules/**", "**/dist/**", "**/*.{test,spec}.{ts,tsx}"],
				},
			},
		],
	},
});
