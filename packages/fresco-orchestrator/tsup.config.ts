import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	splitting: false,
	sourcemap: true,
	external: ["@prisma/client", "dockerode", "pg"],
});
