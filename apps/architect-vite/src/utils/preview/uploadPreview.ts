import type { Asset, CurrentProtocol } from "@codaco/protocol-validation";
import { posthog } from "~/analytics";
import { assetDb } from "../assetDB";
import type {
	AbortResponse,
	CompleteResponse,
	InitializeResponse,
	PreviewRequest,
	PreviewResponse,
	ReadyResponse,
} from "./types";

const PREVIEW_API_VERSION = "v1";
const ASSET_UPLOAD_TIMEOUT_MS = 180_000; // 3 minutes per asset (supports large video files on slower connections)
// Grace period after the upload body is sent, waiting for an HTTP response before
// assuming no response will arrive (e.g. UploadThing presigned URL uploads that
// close the connection without a response body). Must be long enough to cover slow
// server processing after receiving a large file, but short enough not to stall
// indefinitely. The main XHR "load" handler cancels this timer, so it only fires
// when truly no HTTP response has been received.
const NO_RESPONSE_GRACE_PERIOD_MS = 5_000;

export type UploadProgress = {
	phase: "preparing" | "uploading-assets" | "processing";
	current?: number;
	total?: number;
};

export function getProgressText(progress: UploadProgress | null): string {
	if (!progress) return "Preview";

	switch (progress.phase) {
		case "preparing":
			return "Preparing...";
		case "uploading-assets":
			if (progress.current !== undefined && progress.total !== undefined) {
				return `Uploading ${progress.current}/${progress.total}...`;
			}
			return "Uploading...";
		case "processing":
			return "Processing...";
		default:
			return "Preview";
	}
}

type UploadProgressCallback = (progress: UploadProgress) => void;

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

	let errorData: { status?: string; message?: string };
	try {
		errorData = await response.json();
	} catch {
		errorData = {};
	}

	if (response.status === 400) {
		throw new Error(errorData.message || "Bad request");
	}

	if (response.status === 500) {
		throw new Error(errorData.message || "Server error occurred");
	}

	throw new Error(`Request failed: ${response.status} ${response.statusText}`);
}

/**
 * Upload an asset using server-provided upload instructions.
 *
 * Uses XHR because some providers (UploadThing) don't always send a response
 * for presigned URLs, so we resolve when the upload completes rather than
 * waiting for a response.
 */
async function uploadAsset(
	uploadUrl: string,
	fileBlob: Blob,
	fileName: string,
	options: { requiresAuth: boolean; apiToken?: string },
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		let settled = false;

		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				fn();
			}
		};

		// Set timeout to prevent hanging forever
		xhr.timeout = ASSET_UPLOAD_TIMEOUT_MS;

		// Some providers don't send a response for presigned URL uploads.
		// After the upload body is fully sent, start a grace period waiting for the
		// HTTP response. If the main XHR "load" event fires first (response received),
		// it clears this timer and handles success/failure. The fallback only resolves
		// when no HTTP response has arrived within the grace period.
		let noResponseTimer: ReturnType<typeof setTimeout> | null = null;

		xhr.upload.addEventListener("load", () => {
			noResponseTimer = setTimeout(() => {
				if (xhr.readyState !== XMLHttpRequest.DONE) {
					settle(resolve);
				}
			}, NO_RESPONSE_GRACE_PERIOD_MS);
		});

		// Determine success/failure from the actual server response when available.
		// Clear the no-response fallback timer so it doesn't race with this handler.
		// status === 0 means the connection was closed without an HTTP response.
		xhr.addEventListener("load", () => {
			if (noResponseTimer !== null) {
				clearTimeout(noResponseTimer);
				noResponseTimer = null;
			}
			if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
				settle(resolve);
			} else {
				settle(() => reject(new Error(`Asset upload failed for ${fileName}: Server returned ${xhr.status}`)));
			}
		});

		xhr.addEventListener("error", () => {
			settle(() => reject(new Error(`Asset upload failed for ${fileName}: Network error`)));
		});

		xhr.addEventListener("abort", () => {
			settle(() => reject(new Error(`Asset upload was aborted for ${fileName}`)));
		});

		xhr.addEventListener("timeout", () => {
			settle(() => reject(new Error(`Asset upload timed out for ${fileName}`)));
		});

		xhr.open("PUT", uploadUrl);

		if (options.requiresAuth && options.apiToken) {
			xhr.setRequestHeader("Authorization", `Bearer ${options.apiToken}`);
		}

		xhr.setRequestHeader("Content-Type", fileBlob.type || "application/octet-stream");
		xhr.send(fileBlob);
	});
}

/**
 * Get asset data and metadata from the local asset database
 */
async function getLocalAssets(protocol: CurrentProtocol): Promise<
	Array<{
		assetId: string;
		name: string;
		type: string;
		data: Blob;
		size: number;
		value?: string;
	}>
> {
	const assets: Array<{
		assetId: string;
		name: string;
		type: string;
		data: Blob;
		size: number;
		value?: string;
	}> = [];

	if (!protocol.assetManifest) {
		return assets;
	}

	for (const [assetId, assetDefinition] of Object.entries(protocol.assetManifest)) {
		// Handle apikey type assets specially - they have a value, not a file
		if (assetDefinition.type === "apikey") {
			assets.push({
				assetId,
				name: assetId,
				type: "apikey",
				data: new Blob([]), // No actual file data
				size: 0,
				value: assetDefinition.value,
			});
			continue;
		}

		try {
			const assetData = await assetDb.assets.get({ id: assetId });

			if (!assetData || typeof assetData.data === "string") {
				continue;
			}

			const blob = assetData.data instanceof Blob ? assetData.data : new Blob([assetData.data]);

			assets.push({
				assetId,
				name: (assetDefinition as Asset & { source: string }).source,
				type: assetDefinition.type,
				data: blob,
				size: blob.size,
			});
		} catch {
			// Skip assets that can't be loaded
		}
	}

	return assets;
}

/**
 * Send a request to the preview endpoint
 */
async function sendPreviewRequest<T extends PreviewResponse>(
	frescoUrl: string,
	apiToken: string | undefined,
	request: PreviewRequest,
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${frescoUrl}/api/${PREVIEW_API_VERSION}/preview`, {
			method: "POST",
			headers: getAuthHeaders(apiToken),
			body: JSON.stringify(request),
		});
	} catch (error) {
		// TypeError is thrown by fetch for network failures (DNS, connection refused, etc.)
		if (error instanceof TypeError) {
			const networkError = new Error(`Could not connect to the preview server at ${frescoUrl}. (${error.message})`);
			networkError.cause = error;
			throw networkError;
		}
		throw error;
	}

	if (!response.ok) {
		await handleFetchError(response);
	}

	return (await response.json()) as T;
}

/**
 * Uploads a protocol to Fresco for preview mode using the single preview endpoint.
 *
 * Flow:
 * 1. Extract assets from local database
 * 2. Call POST /api/preview with type: "initialize-preview"
 *    - Returns "ready" if protocol already exists or has no assets
 *    - Returns "job-created" with presigned URLs if assets need uploading
 * 3. Upload assets directly to UploadThing using presigned URLs
 * 4. Call POST /api/preview with type: "complete-preview" to finalize
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
): Promise<ReadyResponse> {
	const { frescoUrl, apiToken } = getFrescoConfig();

	posthog.capture("protocol_previewed", {
		stage_count: protocol.stages?.length ?? 0,
		start_stage_index: stageIndex,
		asset_count: Object.keys(protocol.assetManifest ?? {}).length,
	});

	// Get local assets and prepare request
	onProgress?.({ phase: "preparing" });
	const localAssets = await getLocalAssets(protocol);

	// Separate file assets from apikey assets (apikey assets don't need presigned URLs)
	const fileAssets = localAssets.filter((a) => a.type !== "apikey");

	// Build asset metadata for the initialize endpoint
	const assetMeta = fileAssets.map((a) => ({
		assetId: a.assetId,
		name: a.name,
		size: a.size,
	}));

	// Step 1: Initialize preview - validates protocol and returns presigned URLs or ready status
	const initRequest: PreviewRequest = {
		type: "initialize-preview",
		protocol: protocol,
		assetMeta,
	};

	const initResponse = await sendPreviewRequest<InitializeResponse>(frescoUrl, apiToken, initRequest);

	// Handle rejected protocol
	if (initResponse.status === "rejected") {
		throw new Error(initResponse.message);
	}

	// Handle error response
	if (initResponse.status === "error") {
		throw new Error(initResponse.message);
	}

	// If ready immediately (protocol exists or no assets), return the response
	if (initResponse.status === "ready") {
		if (stageIndex > 0) {
			const url = new URL(initResponse.previewUrl);
			url.searchParams.set("step", stageIndex.toString());
			return { ...initResponse, previewUrl: url.toString() };
		}
		return initResponse;
	}

	// Status is "job-created" - we have assets to upload
	const { protocolId, presignedUrls } = initResponse;

	// Step 2: Upload assets to presigned URLs (match by assetId, not index)
	// Build a Map for O(1) lookups instead of O(n) find() on each iteration.
	const fileAssetsMap = new Map(fileAssets.map((a) => [a.assetId, a]));

	for (let i = 0; i < presignedUrls.length; i++) {
		const presignedUrl = presignedUrls[i];
		if (!presignedUrl) {
			throw new Error(`Missing presigned URL at index ${i}`);
		}
		const { assetId, url, requiresAuth } = presignedUrl;
		const localAsset = fileAssetsMap.get(assetId);

		if (!localAsset) {
			throw new Error(`No local asset found for assetId: ${assetId}`);
		}

		onProgress?.({
			phase: "uploading-assets",
			current: i + 1,
			total: presignedUrls.length,
		});

		try {
			await uploadAsset(url, localAsset.data, localAsset.name, { requiresAuth, apiToken });
		} catch (uploadError) {
			// If upload fails, abort the preview job
			await sendPreviewRequest<AbortResponse>(frescoUrl, apiToken, {
				type: "abort-preview",
				protocolId,
			});
			throw uploadError;
		}
	}

	// Step 3: Complete the preview
	onProgress?.({ phase: "processing" });

	const completeRequest: PreviewRequest = {
		type: "complete-preview",
		protocolId,
	};

	const completeResponse = await sendPreviewRequest<CompleteResponse>(frescoUrl, apiToken, completeRequest);

	if (completeResponse.status === "error") {
		throw new Error(completeResponse.message);
	}

	// Append stage index to preview URL if needed
	if (stageIndex > 0) {
		const url = new URL(completeResponse.previewUrl);
		url.searchParams.set("step", stageIndex.toString());
		return { ...completeResponse, previewUrl: url.toString() };
	}

	return completeResponse;
}
