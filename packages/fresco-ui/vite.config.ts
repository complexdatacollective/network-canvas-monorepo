import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "tinyglobby";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const here = dirname(fileURLToPath(import.meta.url));

// Build a regex array of every dep + peerDep so rolldown leaves them external.
// Inline (vs. vite-plugin-externalize-deps) because the plugin returns a
// function-form `external`, which Storybook's rolldown integration rejects
// when it merges its own externals array (`external.1 Function-type` error).
const pkg: {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
} = createRequire(import.meta.url)("./package.json");
const externalPackages = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
const externalRegex = new RegExp(
	`^(?:${externalPackages.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:/.+)?$`,
);

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
			external: [externalRegex, /^node:/],
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
		// Skip dts emission when this config is loaded by Storybook (preview
		// build) or Vitest. Storybook's CLI sets STORYBOOK=true; Vitest sets
		// VITEST=true.
		!process.env.STORYBOOK &&
			!process.env.VITEST &&
			dts({
				include: "src",
				exclude: ["**/*.stories.tsx", "**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/test-setup.ts"],
				// Strip the `src/` prefix so dts outputs land alongside the JS in `dist/`.
				entryRoot: "src",
			}),
		cssCopyPlugin(),
	],
});
