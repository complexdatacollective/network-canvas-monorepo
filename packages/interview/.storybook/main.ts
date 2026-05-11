import { resolve } from "node:path";
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
	stories: ["../src/**/*.stories.@(ts|tsx)"],
	// Static fixtures used by stories — roster JSON for NameGeneratorRoster
	// and geojson layers for Geospatial. Served at `/storybook/<file>`.
	staticDirs: ["./static"],
	viteFinal: async (config) => {
		config.plugins = [...(config.plugins ?? []), tailwindcss()];
		config.resolve = config.resolve ?? {};
		config.resolve.tsconfigPaths = true;
		config.resolve.alias = {
			...(config.resolve.alias ?? {}),
			"@codaco/fresco-ui": resolve(import.meta.dirname, "../../fresco-ui/src"),
		};
		return config;
	},
});
