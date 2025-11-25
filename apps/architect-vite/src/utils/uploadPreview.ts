import type { CurrentProtocol } from "@codaco/protocol-validation";
import { bundleProtocol } from "./bundleProtocol";

export type PreviewResult = {
	previewUrl: string;
	protocolId: string;
};

export type UploadProgress = {
	phase: "bundling" | "requesting-url" | "uploading" | "processing";
};

export function getProgressText(progress: UploadProgress | null): string {
	if (!progress) return "Preview";

	switch (progress.phase) {
		case "bundling":
			return "Bundling...";
		case "requesting-url":
			return "Preparing...";
		case "uploading":
			return "Uploading...";
		case "processing":
			return "Processing...";
		default:
			return "Preview";
	}
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

type UploadUrlResponse = {
	success: boolean;
	uploadUrl: string;
	fileKey: string;
	expiresAt: number;
	error?: string;
	details?: string;
};

type ProcessResponse = {
	success: boolean;
	protocolId: string;
	redirectUrl: string;
	error?: string;
	validationErrors?: string[];
};

function getFrescoConfig(): { frescoUrl: string; apiToken?: string } {
	const frescoUrl = import.meta.env.VITE_FRESCO_PREVIEW_URL;
	if (!frescoUrl) {
		throw new Error(
			"Preview mode is not configured. Please set VITE_FRESCO_PREVIEW_URL in your environment variables.",
		);
	}

	const apiToken = import.meta.env.VITE_FRESCO_PREVIEW_API_TOKEN;
	return { frescoUrl, apiToken };
}

function getAuthHeaders(apiToken?: string): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (apiToken) {
		headers.Authorization = `Bearer ${apiToken}`;
	}

	return headers;
}

async function handleFetchError(response: Response): Promise<never> {
	if (response.status === 401) {
		throw new Error("Preview authentication failed. Please check your API token configuration.");
	}

	if (response.status === 403) {
		throw new Error("Preview mode is not enabled on this Fresco instance.");
	}

	let errorData: { error?: string; details?: string; validationErrors?: string[] };
	try {
		errorData = await response.json();
	} catch {
		errorData = {};
	}

	if (response.status === 400 && errorData.validationErrors) {
		throw new Error(`Protocol validation failed:\n${errorData.validationErrors.join("\n")}`);
	}

	if (response.status === 400) {
		throw new Error(errorData.error || "Bad request");
	}

	if (response.status === 500) {
		throw new Error(errorData.error || "Server error occurred");
	}

	throw new Error(`Request failed: ${response.status} ${response.statusText}`);
}

/**
 * Step 1: Request a presigned upload URL from Fresco
 */
async function requestPresignedUploadUrl(
	frescoUrl: string,
	fileName: string,
	fileSize: number,
	apiToken?: string,
): Promise<{ uploadUrl: string; fileKey: string }> {
	const response = await fetch(`${frescoUrl}/api/preview/upload-url`, {
		method: "POST",
		headers: getAuthHeaders(apiToken),
		body: JSON.stringify({
			fileName,
			fileSize,
			fileType: "application/octet-stream",
		}),
	});

	if (!response.ok) {
		await handleFetchError(response);
	}

	const data = (await response.json()) as UploadUrlResponse;

	if (!data.success || !data.uploadUrl || !data.fileKey) {
		throw new Error(data.error || "Failed to get upload URL: Invalid response");
	}

	return {
		uploadUrl: data.uploadUrl,
		fileKey: data.fileKey,
	};
}

/**
 * Step 2: Upload file directly to UploadThing using the presigned URL
 *
 * Uses XHR because UploadThing doesn't always send a response for presigned URLs,
 * so we resolve when the upload completes rather than waiting for a response.
 */
async function uploadFileToPresignedUrl(uploadUrl: string, fileBlob: Blob, fileName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();

		// Resolve when upload completes - UploadThing may not send a response
		xhr.upload.addEventListener("load", () => {
			setTimeout(() => resolve(), 500);
		});

		xhr.addEventListener("error", () => {
			reject(new Error("File upload failed: Network error"));
		});

		xhr.addEventListener("abort", () => {
			reject(new Error("File upload was aborted"));
		});

		const formData = new FormData();
		formData.append("file", fileBlob, fileName);

		xhr.open("PUT", uploadUrl);
		xhr.send(formData);
	});
}

/**
 * Step 3: Tell Fresco to process the uploaded protocol
 */
async function processUploadedProtocol(
	frescoUrl: string,
	fileKey: string,
	fileName: string,
	apiToken?: string,
): Promise<{ protocolId: string; redirectUrl: string }> {
	const response = await fetch(`${frescoUrl}/api/preview/process`, {
		method: "POST",
		headers: getAuthHeaders(apiToken),
		body: JSON.stringify({
			fileKey,
			fileName,
		}),
	});

	if (!response.ok) {
		await handleFetchError(response);
	}

	const data = (await response.json()) as ProcessResponse;

	if (!data.success || !data.redirectUrl || !data.protocolId) {
		throw new Error(data.error || "Failed to process protocol: Invalid response");
	}

	return {
		protocolId: data.protocolId,
		redirectUrl: data.redirectUrl,
	};
}

/**
 * Uploads a protocol to Fresco for preview mode using presigned URLs.
 *
 * 1. Request a presigned upload URL from Fresco
 * 2. Upload the file directly to UploadThing storage
 * 3. Tell Fresco to process the uploaded file
 *
 * @param protocol - The current protocol to upload
 * @param stageIndex - The stage index to start the preview at (defaults to 0)
 * @param onProgress - Optional callback for upload progress updates
 * @returns Preview URL and protocol ID
 */
export async function uploadProtocolForPreview(
	protocol: CurrentProtocol,
	stageIndex = 0,
	onProgress?: UploadProgressCallback,
): Promise<PreviewResult> {
	const { frescoUrl, apiToken } = getFrescoConfig();

	try {
		// Phase 1: Bundle the protocol
		onProgress?.({ phase: "bundling" });
		const originalBlob = await bundleProtocol(protocol);
		const blob = new Blob([originalBlob], { type: "application/octet-stream" });
		const fileName = `${"name" in protocol && typeof protocol.name === "string" ? protocol.name : "protocol"}.netcanvas`;

		// Phase 2: Request presigned upload URL
		onProgress?.({ phase: "requesting-url" });
		const { uploadUrl, fileKey } = await requestPresignedUploadUrl(frescoUrl, fileName, blob.size, apiToken);

		// Phase 3: Upload file directly to UploadThing
		onProgress?.({ phase: "uploading" });
		await uploadFileToPresignedUrl(uploadUrl, blob, fileName);

		// Phase 4: Process the uploaded protocol
		onProgress?.({ phase: "processing" });
		const { protocolId, redirectUrl } = await processUploadedProtocol(frescoUrl, fileKey, fileName, apiToken);

		// Append stage index to preview URL if needed
		let previewUrl = redirectUrl;
		if (stageIndex > 0) {
			const url = new URL(previewUrl);
			url.searchParams.set("step", stageIndex.toString());
			previewUrl = url.toString();
		}

		return { previewUrl, protocolId };
	} catch (error) {
		// Handle fetch errors (network issues)
		if (error instanceof TypeError && error.message.includes("fetch")) {
			throw new Error(
				`Could not connect to Fresco at ${frescoUrl}. Please check that Fresco is running and the URL is correct.`,
			);
		}
		throw error;
	}
}
