import "@codaco/tailwind-config/fonts/inclusive-sans.css";
import "@codaco/tailwind-config/fonts/nunito.css";
import { ThemedRegion } from "@codaco/fresco-ui/ThemedRegion";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import { DocsContainer, type DocsContainerProps } from "@storybook/addon-docs/blocks";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/react-vite";
import { type PropsWithChildren, StrictMode } from "react";
import "./preview.css";
import Providers from "./Providers";

// Wrap each docs page in <ThemedRegion theme="interview"> so chrome rendered
// outside the per-story decorator tree (notably `.sbdocs-preview`) inherits
// the interview palette and the portal container — e.g. `bg-background` on
// the docs preview container resolves to the interview --background instead
// of the default theme. This package's stories are interview-only, so the
// theme is hardcoded.
const ThemedDocsContainer = ({ children, context }: PropsWithChildren<DocsContainerProps>) => (
	<ThemedRegion theme="interview" className="bg-background text-text publish-colors">
		<DocsContainer context={context}>{children}</DocsContainer>
	</ThemedRegion>
);

export default definePreview({
	addons: [addonDocs(), addonA11y(), addonVitest()],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		docs: {
			container: ThemedDocsContainer,
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
					<ThemedRegion theme="interview" className="root h-full">
						<Providers disableAnimations={disableAnimations}>
							<Story />
						</Providers>
					</ThemedRegion>
				</StrictMode>
			);
		},
	],
});
