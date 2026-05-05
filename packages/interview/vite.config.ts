import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	plugins: [
		react(),
		dts({
			entryRoot: "src",
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.stories.tsx"],
			compilerOptions: { rootDir: resolve(__dirname, "src") },
			rollupTypes: true,
		}),
	],
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			formats: ["es"],
		},
		rollupOptions: {
			external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.includes("\0"),
			output: {
				preserveModules: true,
				preserveModulesRoot: "src",
				entryFileNames: "[name].js",
			},
		},
		sourcemap: true,
		minify: false,
	},
});
