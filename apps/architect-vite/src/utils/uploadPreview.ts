import type { CurrentProtocol } from "@codaco/protocol-validation";
import axios from "axios";
import { bundleProtocol } from "./bundleProtocol";

export type PreviewResult = {
	previewUrl: string;
	error?: string;
};

/**
 * Uploads a protocol to Fresco for preview mode
 * @param protocol - The current protocol to upload
 * @param stageIndex - The stage index to start the preview at (defaults to 0)
 * @returns Preview URL and optional error message
 */
export async function uploadProtocolForPreview(protocol: CurrentProtocol, stageIndex = 0): Promise<PreviewResult> {
	const frescoUrl = import.meta.env.VITE_FRESCO_PREVIEW_URL;
	if (!frescoUrl) {
		throw new Error(
			"Preview mode is not configured. Please set VITE_FRESCO_PREVIEW_URL in your environment variables.",
		);
	}

	try {
		const blob = await bundleProtocol(protocol);

		// Prepare FormData
		const formData = new FormData();
		const fileName = `${protocol.name || "protocol"}.netcanvas`;
		formData.append("protocol", blob, fileName);

		// Prepare headers
		const headers: Record<string, string> = {};
		const apiToken = import.meta.env.VITE_FRESCO_PREVIEW_API_TOKEN;
		if (apiToken) {
			headers.Authorization = `Bearer ${apiToken}`;
		}

		// Upload to Fresco
		const response = await axios.post<{ success: boolean; redirectUrl?: string; error?: string }>(
			`${frescoUrl}/preview`,
			formData,
			{ headers },
		);

		const data = response.data;

		if (!data.success || !data.redirectUrl) {
			throw new Error(data.error || "Preview upload failed: No redirect URL returned");
		}

		let previewUrl = data.redirectUrl;

		// Append stage index
		if (stageIndex > 0) {
			const url = new URL(previewUrl);
			url.searchParams.set("step", stageIndex.toString());
			previewUrl = url.toString();
		}

		return { previewUrl };
	} catch (error) {
		if (axios.isAxiosError(error)) {
			if (error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK") {
				throw new Error(
					`Could not connect to Fresco at ${frescoUrl}. Please check that Fresco is running and the URL is correct.`,
				);
			}

			if (error.response?.status === 401) {
				throw new Error("Preview authentication failed. Please check your API token configuration.");
			}

			if (error.response?.status === 403) {
				throw new Error("Preview mode is not enabled on Fresco.");
			}

			if (error.response?.status === 400) {
				const message = error.response?.data?.message || "Protocol validation failed";
				throw new Error(`Preview upload failed: ${message}`);
			}

			throw new Error(`Preview upload failed: ${error.response?.statusText || error.message}`);
		}

		if (error instanceof Error) {
			throw error;
		}

		throw new Error(`Failed to upload protocol for preview: ${String(error)}`);
	}
}
