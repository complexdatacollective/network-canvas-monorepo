import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "tinyglobby";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

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
	build: {
		lib: {
			// Single nominal entry to satisfy Vite's lib-mode requirement.
			// The real entry set is provided via rolldownOptions.input below;
			// preserveModules walks the dep graph from there.
			entry: resolve(here, "src/_placeholder.ts"),
			formats: ["es"],
		},
		rolldownOptions: {
			input: globSync(["src/**/*.{ts,tsx}", "!src/**/*.{stories,test,spec}.{ts,tsx}", "!src/**/__tests__/**"], {
				cwd: here,
				absolute: true,
			}),
			external: [
				/^react/,
				/^react-dom/,
				/^@radix-ui/,
				/^@base-ui/,
				/^motion/,
				/^@tiptap/,
				/^lucide-react/,
				/^class-variance-authority/,
				/^cva/,
				/^clsx/,
				/^tailwind-merge/,
				/^luxon/,
				/^zustand/,
				/^immer/,
				/^@codaco\//,
				/^react-aria-components/,
				/^react-best-merge-refs/,
				/^react-markdown/,
				/^remark-/,
				/^rehype-/,
				/^comlink/,
				/^fuse\.js/,
				/^nanoid/,
				/^@faker-js\//,
				/^es-toolkit/,
				/^zod/,
				/^tailwindcss/,
			],
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
		dts({
			include: "src",
			exclude: ["**/*.stories.tsx", "**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
		}),
		cssCopyPlugin(),
	],
});
