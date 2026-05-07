import type { Decorator } from "@storybook/react-vite";
import { ThemedRegion } from "../src/ThemedRegion";
import { cx } from "../src/utils/cva";

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

function ThemeWrapper({ selectedTheme, children }: { selectedTheme: ThemeKey; children: React.ReactNode }) {
	setStoredTheme(selectedTheme);

	if (selectedTheme === "interview") {
		return (
			<ThemedRegion theme="interview" className="bg-background text-text publish-colors">
				{children}
			</ThemedRegion>
		);
	}

	return <div className={cx("bg-background text-text publish-colors")}>{children}</div>;
}

export const withTheme: Decorator = (Story, context) => {
	const selectedTheme =
		(context.parameters.forceTheme as ThemeKey) ?? (context.globals[THEME_KEY] as ThemeKey) ?? "dashboard";

	return (
		<ThemeWrapper selectedTheme={selectedTheme}>
			<Story />
		</ThemeWrapper>
	);
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
