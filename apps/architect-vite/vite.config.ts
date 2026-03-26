import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [react({}), tailwindcss()],
	css: {
		preprocessorOptions: {
			scss: {
				quietDeps: true,
				silenceDeprecations: ["mixed-decls", "import", "color-functions", "global-builtin"],
				verbose: false,
			},
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
	},
});
