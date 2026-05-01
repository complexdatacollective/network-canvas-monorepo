import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "tinyglobby";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";

const here = dirname(fileURLToPath(import.meta.url));

// Tailwind v4 source CSS uses `@import "tailwindcss"`, `@theme`, `@plugin`,
// `@source` directives intended for the consumer's Tailwind to compile.
// Copy the files verbatim instead of routing them through Vite's PostCSS pipe.
const cssCopyPlugin = () => ({
	name: "fresco-ui-css-copy",
	async closeBundle() {
		const files = globSync(["src/**/*.css"], { cwd: here });
		for (const rel of files) {
			const out = rel.replace(/^src\//, "dist/");
			const absOut = resolve(here, out);
			await mkdir(dirname(absOut), { recursive: true });
			await copyFile(resolve(here, rel), absOut);
		}
	},
});

export default defineConfig({
	oxc: {
		jsx: { runtime: "automatic" },
	},
	build: {
		lib: {
			// Single nominal entry to satisfy Vite's lib-mode requirement.
			// The real entry set is provided via rolldownOptions.input below;
			// preserveModules walks the dep graph from there.
			entry: resolve(here, "src/Alert.tsx"),
			formats: ["es"],
		},
		rolldownOptions: {
			input: globSync(
				["src/**/*.{ts,tsx}", "!src/**/*.{stories,test,spec}.{ts,tsx}", "!src/**/__tests__/**", "!src/test-setup.ts"],
				{
					cwd: here,
					absolute: true,
				},
			),
			output: {
				format: "esm",
				preserveModules: true,
				preserveModulesRoot: "src",
				entryFileNames: "[name].js",
			},
		},
		sourcemap: true,
		minify: false,
		emptyOutDir: true,
	},
	plugins: [
		externalizeDeps(),
		dts({
			include: "src",
			exclude: ["**/*.stories.tsx", "**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/test-setup.ts"],
			// Strip the `src/` prefix so dts outputs land alongside the JS in `dist/`.
			entryRoot: "src",
		}),
		cssCopyPlugin(),
	],
});
