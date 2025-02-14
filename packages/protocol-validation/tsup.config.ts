import { defineConfig } from "tsup";
import { buildSchemas } from "./src/scripts/compileSchemas";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: ["esm", "cjs"],
	target: "es6",
	dts: true,
	sourcemap: true,
	esbuildPlugins: [
		{
			name: "build-schemas",
			setup(build) {
				build.onStart(async () => {
					await buildSchemas();
				});
			},
		},
	],
});
