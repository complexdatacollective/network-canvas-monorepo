import "@codaco/fresco-ui/styles.css";
import "@codaco/tailwind-config/fresco/interview-theme.css";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/react-vite";
import { StrictMode } from "react";
import Providers from "./Providers";

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
	decorators: [
		(Story) => {
			// Disable Base UI animations whenever Storybook is being driven
			// by automation (vitest browser mode / play-function runner).
			// Manual browsing keeps animations.
			const disableAnimations = typeof navigator !== "undefined" && navigator.webdriver === true;

			return (
				<StrictMode>
					{/*
					 * Required by Base UI's portal-based dialogs/popovers:
					 * https://base-ui.com/react/overview/quick-start#portals
					 */}
					<div className="root h-full">
						<Providers disableAnimations={disableAnimations}>
							<Story />
						</Providers>
					</div>
				</StrictMode>
			);
		},
	],
});
