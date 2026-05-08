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
		// Regex aliases anchor the bare specifier and the styles.css subpath
		// independently. A plain string alias on `@codaco/interview` would
		// prefix-match subpaths and rewrite `@codaco/interview/styles.css` to
		// `<src/index.ts>/styles.css`, which Vite then tries to open as a
		// directory and crashes.
		alias: [
			{ find: /^@codaco\/interview$/, replacement: resolve(__dirname, "../../src/index.ts") },
			{ find: /^@codaco\/interview\/styles\.css$/, replacement: resolve(__dirname, "../../src/styles.css") },
			{
				find: /^@codaco\/fresco-ui\/styles\.css$/,
				replacement: resolve(__dirname, "../../../fresco-ui/src/styles.css"),
			},
			{ find: /^@codaco\/fresco-ui\/(.+)$/, replacement: resolve(__dirname, "../../../fresco-ui/src/$1") },
		],
	},
});
