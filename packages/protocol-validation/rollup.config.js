import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "rollup";
import dts from "rollup-plugin-dts";

const schemaPlugin = () => {
	return {
		name: "schema",

		// watches the schema files for changes
		buildStart() {
			this.addWatchFile(path.resolve("src/schemas/"));
		},
		// runs when a file changes
		watchChange(file) {
			if (file.endsWith("zod.ts")) {
				console.log("🔄 Converting zod schema to json...", file);
				execSync("pnpm run zod-to-json src/schemas/8.zod.ts");
			}

			if (file.endsWith(".json")) {
				console.log("🔄 Recompiling all json schemas...", file);
				execSync("pnpm run compile-schemas");
			}
		},
	};
};

const config = defineConfig([
	{
		cache: false,
		input: "src/index.ts",
		output: [
			{
				dir: "dist",
				format: "esm",
				sourcemap: true,
			},
		],
		external: ["ajv"], // Add ajv as an external dependency
		plugins: [
			schemaPlugin(),

			// Order matters here - TypeScript should process files first
			typescript({
				declaration: true,
				declarationDir: "./dist/types",
				// Make sure TypeScript handles the type imports
				tsconfig: "./tsconfig.json",
			}),
			nodeResolve(),
			// Configure dynamicImportVars to exclude type-only imports
			dynamicImportVars({
				include: ["src/**/*.ts"],
				exclude: ["**/*.d.ts"],
			}),
		],
	},
	// Type definitions bundle
	{
		input: "dist/types/src/index.d.ts",
		output: {
			file: "dist/index.d.ts",
			format: "esm",
		},
		plugins: [nodeResolve(), dts()],
	},
]);

export default config;
