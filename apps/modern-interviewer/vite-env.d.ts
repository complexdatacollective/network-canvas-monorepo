/// <reference types="vite/client" />

type ModernInterviewerNative = {
	platform: "darwin" | "win32" | "linux";
	appVersion: string;
	pickProtocolFile: () => Promise<{ name: string; data: Uint8Array } | null>;
	saveExport: (suggestedName: string, data: Uint8Array) => Promise<{ ok: boolean; path?: string }>;
};

declare global {
	// biome-ignore lint/style/useConsistentTypeDefinitions: augmenting the global Window requires interface declaration merging.
	interface Window {
		modernInterviewerNative?: ModernInterviewerNative;
	}
}

export {};
