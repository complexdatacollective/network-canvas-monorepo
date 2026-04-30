import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: [resolve(here, "src/test-setup.ts")],
		include: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/__tests__/**/*.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		css: false,
	},
});
