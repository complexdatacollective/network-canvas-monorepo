import type { CurrentProtocol } from "@codaco/protocol-validation";
import { posthog } from "~/analytics";
import { isPreviewMessage, type PreviewPayload } from "./messages";

const HANDSHAKE_TIMEOUT_MS = 10_000;
const POPUP_CLOSED_POLL_MS = 1_000;

type LaunchOptions = {
	protocol: CurrentProtocol;
	startStage: number;
	useSyntheticData: boolean;
};

type LaunchPreviewResult = { kind: "delivered" } | { kind: "popup-blocked" };

export function launchPreview({ protocol, startStage, useSyntheticData }: LaunchOptions): Promise<LaunchPreviewResult> {
	const popup = window.open("/preview", "_blank");
	if (!popup) {
		return Promise.resolve({ kind: "popup-blocked" });
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

	return new Promise<LaunchPreviewResult>((resolve, reject) => {
		// The listener stays registered for the popup's lifetime so a reloaded
		// preview tab can re-request the payload. Cleanup happens when the popup
		// closes or when the initial handshake times out.
		let initialDelivered = false;

		const cleanup = () => {
			window.removeEventListener("message", onMessage);
			clearTimeout(initialTimeoutId);
			clearInterval(closedPollId);
		};

		const onMessage = (event: MessageEvent) => {
			if (event.source !== popup) return;
			if (event.origin !== expectedOrigin) return;
			if (!isPreviewMessage(event.data)) return;
			if (event.data.type !== "preview:ready") return;

			popup.postMessage(payload, expectedOrigin);
			if (!initialDelivered) {
				initialDelivered = true;
				clearTimeout(initialTimeoutId);
				resolve({ kind: "delivered" });
			}
		};

		const initialTimeoutId = setTimeout(() => {
			if (initialDelivered) return;
			cleanup();
			reject(new Error("Preview tab didn't load in time. Close it and try again."));
		}, HANDSHAKE_TIMEOUT_MS);

		const closedPollId = setInterval(() => {
			if (popup.closed) cleanup();
		}, POPUP_CLOSED_POLL_MS);

		window.addEventListener("message", onMessage);
	});
}
