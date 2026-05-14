import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "org.complexdatacollective.networkcanvas.modernInterviewer",
	appName: "Network Canvas Interviewer",
	webDir: "dist",
	// `capacitor://localhost` keeps origin stable across launches so
	// IndexedDB-backed storage persists between sessions.
	server: {
		androidScheme: "https",
	},
	ios: {
		contentInset: "always",
		// Tablet-orientation experience; the Shell already adapts to portrait.
		limitsNavigationsToAppBoundDomains: true,
	},
	android: {
		allowMixedContent: false,
	},
};

export default config;
