import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/main",
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/main/index.js"),
				},
			},
		},
	},
	preload: {
		build: {
			outDir: "out/preload",
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/preload/index.js"),
				},
			},
		},
	},
	renderer: {
		root: resolve(__dirname, "src/renderer"),
		define: {
			// Provide module shim for libraries that check module.hot (like redux-form)
			"module.hot": "undefined",
		},
		build: {
			outDir: resolve(__dirname, "out/renderer"),
			commonjsOptions: {
				include: [/node_modules/],
				transformMixedEsModules: true,
			},
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
		plugins: [
			react({
				include: ["src/**/*.js", "src/**/*.jsx"],
				babel: {
					babelrc: false,
					configFile: false,
					presets: [["@babel/preset-react", { runtime: "automatic" }]],
				},
			}),
		],
		resolve: {
			alias: {
				"@": resolve(__dirname, "src"),
				"~": resolve(__dirname, "node_modules"),
				// Shim for react-resize-aware which has a broken build (uses jsx without importing it)
				"react-resize-aware": resolve(__dirname, "src/shims/react-resize-aware.js"),
			},
		},
		worker: {
			format: "es",
		},
		esbuild: {
			jsx: "automatic",
			jsxImportSource: "react",
		},
		optimizeDeps: {
			include: ["react-resize-aware", "@codaco/ui"],
			esbuildOptions: {
				loader: {
					".js": "jsx",
				},
				jsx: "automatic",
				jsxImportSource: "react",
			},
		},
		css: {
			preprocessorOptions: {
				scss: {
					api: "modern-compiler",
					silenceDeprecations: [
						"import",
						"global-builtin",
						"legacy-js-api",
						"color-functions",
						"mixed-decls",
						"slash-div",
						"if-function",
					],
					loadPaths: [resolve(__dirname, "src/styles"), resolve(__dirname, "node_modules")],
				},
			},
		},
		server: {
			port: 3000,
		},
	},
});
