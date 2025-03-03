import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "rollup";
import del from "rollup-plugin-delete";
import dts from "rollup-plugin-dts";
import size from "rollup-plugin-sizes";

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
		plugins: [
			// clean the dist folder of schema files
			del({ targets: "dist" }),
			typescript({
				declaration: true,
				declarationDir: "./dist/types",
				tsconfig: "./tsconfig.json",
			}),
			nodeResolve(),
			dynamicImportVars({
				include: ["src/**/*.ts"],
				exclude: ["**/*.d.ts"],
			}),
			schemaPlugin(),
			size(),
		],
	},
	// Type definitions bundle
	{
		input: "dist/types/src/index.d.ts",
		output: {
			file: "dist/index.d.ts",
			format: "esm",
		},
		plugins: [
			nodeResolve(), // dts says not to do this, but without it it can't resolve workspace packages
			dts(),
		],
	},
]);

export default config;
