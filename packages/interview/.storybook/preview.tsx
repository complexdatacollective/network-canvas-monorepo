import "@codaco/fresco-ui/styles.css";
import "@codaco/tailwind-config/fresco/interview-theme.css";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/react-vite";

export default definePreview({
	addons: [addonDocs(), addonA11y(), addonVitest()],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
});
