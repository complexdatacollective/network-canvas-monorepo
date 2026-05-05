import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "../../package.json" with { type: "json" };

export default defineConfig({
	root: __dirname,
	plugins: [react(), tailwindcss()],
	server: { port: 4101, strictPort: true },
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		alias: {
			"@codaco/interview": resolve(__dirname, "../../src/index.ts"),
		},
	},
});
