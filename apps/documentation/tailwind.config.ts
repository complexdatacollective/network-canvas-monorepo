import sharedConfig from "@codaco/tailwind-config/fresco";
import containers from "@tailwindcss/container-queries";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Pick<Config, "content" | "darkMode" | "presets" | "plugins" | "theme"> = {
	darkMode: "class",
	content: [
		...sharedConfig.content,
		"./lib/**/*.{ts,tsx}", // For JSX components in MD
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"../../packages/ui/src/**/*.{ts,tsx}", // UI package
	],
	presets: [sharedConfig],
	plugins: [typography, containers],
};

export default config;
