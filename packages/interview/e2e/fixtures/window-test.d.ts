declare global {
	type Window = {
		__test: {
			installProtocol(protocol: Record<string, unknown>): void;
			setAssetUrl(assetId: string, url: string): void;
			createInterview(protocolId: string, participantId: string): string;
			getNetworkState(interviewId: string): unknown;
		};
		__e2eMap?: {
			getSource(id: string): unknown;
			isSourceLoaded(id: string): boolean;
			querySourceFeatures(id: string): unknown[];
			queryRenderedFeatures(options: { layers: string[] }): unknown[];
			once(event: string, fn: () => void): void;
			resize(): void;
			triggerRepaint(): void;
		};
	};
	var __test: Window["__test"];
	var __e2eMap: Window["__e2eMap"];
}

export {};
