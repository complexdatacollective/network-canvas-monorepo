import type { Decorator } from "@storybook/react-vite";
import { useEffect } from "react";

export const THEME_KEY = "theme";
const STORAGE_KEY = "storybook-theme-preference";

const themes = {
	dashboard: {
		name: "Dashboard",
	},
	interview: {
		name: "Interview",
	},
} as const;

export type ThemeKey = keyof typeof themes;

function getStoredTheme(): ThemeKey | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && stored in themes) {
			return stored as ThemeKey;
		}
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn("Failed to read theme from localStorage:", error);
	}
	return null;
}

function setStoredTheme(theme: ThemeKey) {
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn("Failed to save theme to localStorage:", error);
	}
}

/**
 * Persists the toolbar's selected theme to localStorage on every change so
 * `getInitialTheme()` can restore it on the next preview load. Storybook's
 * `globalTypes` API doesn't expose an onChange hook directly, so this runs
 * the side effect inside a decorator that re-renders whenever `context.globals[THEME_KEY]`
 * changes.
 */
export const persistTheme: Decorator = (Story, context) => {
	const theme = (context.globals[THEME_KEY] as ThemeKey | undefined) ?? "dashboard";
	useEffect(() => {
		setStoredTheme(theme);
	}, [theme]);
	return <Story />;
};

export const globalTypes = {
	[THEME_KEY]: {
		name: "Theme",
		description: "Global theme for components",
		defaultValue: getStoredTheme() ?? "dashboard",
		toolbar: {
			icon: "paintbrush" as const,
			items: Object.entries(themes).map(([key, { name }]) => ({
				value: key,
				title: name,
			})),
			showName: true,
			dynamicTitle: true,
		},
	},
};

export function getInitialTheme(): ThemeKey {
	return getStoredTheme() ?? "dashboard";
}
