import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAP_DEV_SERVER_URL;

const config: CapacitorConfig = {
	appId: "org.complexdatacollective.networkcanvas.interviewer",
	appName: "Network Canvas Interviewer v7",
	webDir: "dist",
	server: {
		androidScheme: "https",
		...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
	},
	ios: {
		contentInset: "always",
	},
	android: {
		allowMixedContent: Boolean(devServerUrl),
	},
};

export default config;
