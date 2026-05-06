import "@codaco/tailwind-config/fonts/inclusive-sans.css";
import "@codaco/tailwind-config/fonts/nunito.css";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/react-vite";
import { StrictMode, useLayoutEffect } from "react";
import "./preview.css";
import Providers from "./Providers";

// Mirrors what Shell does at runtime: set `data-theme-interview` on
// `<html>` so `:root[data-theme-interview]` matches and the responsive
// font-size override updates `1rem` document-wide. Every story in this
// package is interview-themed, so set unconditionally.
function InterviewThemeRoot({ children }: { children: React.ReactNode }) {
	useLayoutEffect(() => {
		const root = document.documentElement;
		root.setAttribute("data-theme-interview", "");
		return () => {
			root.removeAttribute("data-theme-interview");
		};
	}, []);
	return <>{children}</>;
}

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
					<InterviewThemeRoot>
						{/*
						 * Required by Base UI's portal-based dialogs/popovers:
						 * https://base-ui.com/react/overview/quick-start#portals
						 */}
						<div className="root h-full">
							<Providers disableAnimations={disableAnimations}>
								<Story />
							</Providers>
						</div>
					</InterviewThemeRoot>
				</StrictMode>
			);
		},
	],
});
