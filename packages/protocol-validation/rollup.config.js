import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import dts from "rollup-plugin-dts";

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
