import sharedConfig from "@codaco/tailwind-config/fresco";
import type { Config } from "tailwindcss";

const config: Pick<Config, "content" | "darkMode" | "presets" | "plugins" | "theme"> = {
	content: [
		...sharedConfig.content,
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
		"../../packages/ui/src/**/*.{ts,tsx}", // UI package
	],
	presets: [sharedConfig],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
			},
		},
	},
};

export default config;
