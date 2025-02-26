import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: ["esm", "cjs"],
	target: "es6",
	dts: true,
	clean: false,
	sourcemap: true,
});
