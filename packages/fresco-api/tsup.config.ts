import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/server.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	splitting: false,
	sourcemap: true,
	external: ["@prisma/client", "@fresco/orchestrator", "better-auth"],
});
