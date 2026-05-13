import containers from "@tailwindcss/container-queries";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";
import fresco from "./tailwind/fresco";

const config: Pick<Config, "content" | "darkMode" | "presets" | "plugins" | "theme"> = {
	darkMode: "class",
	content: [
		...fresco.content,
		"./lib/**/*.{ts,tsx}", // For JSX components in MD
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
	],
	presets: [fresco],
	plugins: [typography, containers],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Quicksand Variable", "Quicksand", "system-ui", "sans-serif"],
			},
		},
	},
};

export default config;
