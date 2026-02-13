import { createAnalytics, mergeConfig } from "@codaco/analytics";

const INSTALLATION_ID_KEY = "network-canvas-architect-installation-id";

function getOrCreateInstallationId(): string {
	const existing = localStorage.getItem(INSTALLATION_ID_KEY);
	if (existing) {
		return existing;
	}

	const id = crypto.randomUUID();
	localStorage.setItem(INSTALLATION_ID_KEY, id);
	return id;
}

export const analytics = createAnalytics(
	mergeConfig({
		app: "ArchitectWeb",
		installationId: getOrCreateInstallationId(),
		disabled: import.meta.env.VITE_DISABLE_ANALYTICS === "true",
		debug: import.meta.env.DEV,
		posthogOptions: {
			capture_pageview: true,
			capture_pageleave: true,
			disable_session_recording: false,
			capture_exceptions: true,
		},
	}),
);
