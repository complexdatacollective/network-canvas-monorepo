import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react-swc";
import scss from "postcss-scss";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
	plugins: [tsconfigPaths(), react({})],
	// css: {
	// 	preprocessorOptions: {
	// 		scss: {
	// 			quietDeps: true,
	// 			silenceDeprecations: ["mixed-decls", "import", "color-functions", "global-builtin"],
	// 			verbose: false,
	// 		},
	// 	},
	// },
	css: {
		postcss: {
			syntax: scss,
			plugins: [tailwindcss({})],
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
	},
});
