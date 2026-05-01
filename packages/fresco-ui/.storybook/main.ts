import { defineMain } from "@storybook/react-vite/node";
import tailwindcss from "@tailwindcss/vite";

export default defineMain({
	addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest", "@chromatic-com/storybook"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	typescript: {
		check: false,
	},
	stories: ["../src/**/*.stories.tsx"],
	viteFinal: async (config) => {
		config.plugins = [...(config.plugins ?? []), tailwindcss()];
		return config;
	},
});
