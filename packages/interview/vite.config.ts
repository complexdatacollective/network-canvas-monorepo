import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { globSync } from "tinyglobby";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";
import pkg from "./package.json" with { type: "json" };

// Tailwind v4 source CSS (`@source` directives, `@theme`, etc.) is meant to
// reach the consumer's Tailwind compile untouched — routing it through Vite's
// PostCSS pipe risks stripping or rewriting the directives. Mirror the
// approach in @codaco/fresco-ui and @codaco/tailwind-config: copy each
// `src/**/*.css` file verbatim into `dist/`.
const cssCopyPlugin = (): Plugin => ({
	name: "interview-css-copy",
	async closeBundle() {
		const here = __dirname;
		const files = globSync(["src/**/*.css"], { cwd: here });
		for (const rel of files) {
			const out = rel.replace(/^src\//, "dist/");
			const absOut = resolve(here, out);
			await mkdir(dirname(absOut), { recursive: true });
			await copyFile(resolve(here, rel), absOut);
		}
	},
});

// Skip dts emission for non-library consumers of this config (Storybook builds
// the preview app; Vitest just runs tests). Storybook's CLI sets STORYBOOK=true;
// Vitest sets VITEST=true.
const isLibraryBuild = !process.env.STORYBOOK && !process.env.VITEST;

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		react(),
		isLibraryBuild &&
			dts({
				entryRoot: "src",
				include: ["src/**/*.ts", "src/**/*.tsx"],
				exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.stories.tsx"],
				compilerOptions: { rootDir: resolve(__dirname, "src") },
				rollupTypes: true,
			}),
		cssCopyPlugin(),
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
			external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("~/") && !id.includes("\0"),
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
