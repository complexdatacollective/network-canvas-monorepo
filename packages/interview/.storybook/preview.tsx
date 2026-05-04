import "@codaco/fresco-ui/styles.css";
import "@codaco/tailwind-config/fresco/interview-theme.css";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
};

export default preview;
