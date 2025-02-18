import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: ["esm", "cjs"],
	target: "es6",
	dts: true,
	clean: true,
	sourcemap: true,
	esbuildPlugins: [
		// {
		// 	name: "build-schemas",
		// 	setup(build) {
		// 		build.onStart(async () => {
		// 			await buildSchemas();
		// 		});
		// 	},
		// },
	],
});
