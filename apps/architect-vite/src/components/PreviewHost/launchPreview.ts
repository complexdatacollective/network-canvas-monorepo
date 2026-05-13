import type { CurrentProtocol } from "@codaco/protocol-validation";
import { posthog } from "~/analytics";
import { isPreviewMessage, type PreviewPayload } from "./messages";

const HANDSHAKE_TIMEOUT_MS = 10_000;

type LaunchOptions = {
	protocol: CurrentProtocol;
	startStage: number;
	useSyntheticData: boolean;
};

export function launchPreview({ protocol, startStage, useSyntheticData }: LaunchOptions): Promise<void> {
	const popup = window.open("/preview.html", "_blank");
	if (!popup) {
		return Promise.reject(
			new Error("Your browser blocked the preview popup. Allow popups for this site and try again."),
		);
	}

	posthog.capture("protocol_previewed", {
		stage_count: protocol.stages?.length ?? 0,
		start_stage_index: startStage,
		asset_count: Object.keys(protocol.assetManifest ?? {}).length,
		use_synthetic_data: useSyntheticData,
	});

	const expectedOrigin = window.location.origin;
	const payload: PreviewPayload = {
		type: "preview:payload",
		protocol,
		startStage,
		useSyntheticData,
	};

	return new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			window.removeEventListener("message", onMessage);
			clearTimeout(timeoutId);
		};

		const onMessage = (event: MessageEvent) => {
			if (event.source !== popup) return;
			if (event.origin !== expectedOrigin) return;
			if (!isPreviewMessage(event.data)) return;
			if (event.data.type !== "preview:ready") return;

			popup.postMessage(payload, expectedOrigin);
			cleanup();
			resolve();
		};

		const timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error("Preview tab didn't load in time. Close it and try again."));
		}, HANDSHAKE_TIMEOUT_MS);

		window.addEventListener("message", onMessage);
	});
}
