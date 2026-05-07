import "@codaco/tailwind-config/fonts/inclusive-sans.css";
import "@codaco/tailwind-config/fonts/nunito.css";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/react-vite";
import isChromatic from "chromatic/isChromatic";
import { StrictMode } from "react";
import "./preview.css";
import Providers from "./Providers";
import { getInitialTheme, globalTypes, withTheme } from "./theme-switcher";

// @chromatic-com/storybook is not included here because it doesn't export a
// CSF Next compatible preview addon. It only provides server-side preset
// functionality and manager UI, so it's configured in main.ts only.
// See: https://github.com/chromaui/addon-visual-tests/pull/404

export default definePreview({
	addons: [addonDocs(), addonA11y(), addonVitest()],
	parameters: {
		options: {
			storySort: {
				order: [
					"Design System",
					["Colors", "Elevation", "Type Scale", "Typography"],
					"UI",
					"Systems",
					["Form", "Dialogs", "DragAndDrop"],
					"*",
				],
			},
		},
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		a11y: {
			// 'todo' - show a11y violations in the test UI only
			// 'error' - fail CI on a11y violations
			// 'off' - skip a11y checks entirely
			test: "todo",
			/**
			 * base-ui dialog adds focus guards which are picked up by a11y tests
			 * but are necessary for proper focus management within the dialog,
			 * and compatible with WCAG guidelines, so we disable this rule here.
			 */
			config: {
				rules: [
					{
						id: "aria-hidden-focus",
						selector: "[data-base-ui-focus-guard]",
						enabled: false,
					},
				],
			},
		},
	},

	decorators: [
		// withTheme must be the outermost decorator so that <ThemedRegion>
		// (and the <PortalContainerProvider> it bundles) wraps Providers —
		// that puts <Toaster />, the DialogProvider's dialog map, and any
		// Base UI portals inside the themed subtree, so they inherit the
		// interview palette and route portals through the provider's
		// container instead of escaping to document.body.
		withTheme,
		(Story) => {
			// Disable Base UI animations whenever the browser is being driven by
			// automation (Playwright in vitest browser mode, or Storybook's
			// play-function runner). This makes Base UI dialog open/close flows
			// deterministic: they no longer wait on `getAnimations()` so sequences
			// like "click Cancel → confirm dialog opens → click Continue editing"
			// don't race the form store against CSS animation completion.
			//
			// Also togglable via `?disableAnimations=1` on the URL for interactive
			// debugging of the animation-disabled code path.
			//
			// Manual browsing has `navigator.webdriver === false`, so interactive
			// development still gets the full animations by default.
			const disableAnimationsFromAutomation = typeof navigator !== "undefined" && navigator.webdriver === true;
			const disableAnimations = disableAnimationsFromAutomation || isChromatic();

			return (
				<StrictMode>
					{/**
					 * required by base-ui: https://base-ui.com/react/overview/quick-start#portals
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

	globalTypes,

	initialGlobals: {
		theme: getInitialTheme(),
	},
});
