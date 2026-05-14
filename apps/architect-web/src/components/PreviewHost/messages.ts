import type { CurrentProtocol } from "@codaco/protocol-validation";

type PreviewReady = { type: "preview:ready" };

export type PreviewPayload = {
	type: "preview:payload";
	protocol: CurrentProtocol;
	startStage: number;
	useSyntheticData: boolean;
};

type PreviewMessage = PreviewReady | PreviewPayload;

export function isPreviewMessage(value: unknown): value is PreviewMessage {
	if (!value || typeof value !== "object") return false;
	const type = (value as { type?: unknown }).type;
	return type === "preview:ready" || type === "preview:payload";
}
