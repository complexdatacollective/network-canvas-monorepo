import type { Asset, CurrentProtocol } from "@codaco/protocol-validation";
import { assetDb } from "./assetDB";

export type PreviewResult = {
	previewUrl: string;
	protocolId: string;
};

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

export type UploadProgressCallback = (progress: UploadProgress) => void;

// Asset info sent to the preview endpoint
type AssetRequestInfo = {
	assetId: string;
	name: string;
	size: number;
	type: string;
	value?: string; // For apikey type assets
};

// Upload info returned from the preview endpoint for new assets
type AssetUploadInfo = {
	assetId: string;
	uploadUrl: string;
	fileKey: string;
	fileUrl: string;
	expiresAt: number;
};

type PreviewResponse = {
	success: boolean;
	protocolId: string;
	redirectUrl: string;
	uploads: AssetUploadInfo[];
	error?: string;
	details?: string;
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
 * Upload an asset directly to UploadThing using the presigned URL
 *
 * Uses XHR because UploadThing doesn't always send a response for presigned URLs,
 * so we resolve when the upload completes rather than waiting for a response.
 */
async function uploadAssetToPresignedUrl(uploadUrl: string, fileBlob: Blob, fileName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();

		// Resolve when upload completes - UploadThing may not send a response
		xhr.upload.addEventListener("load", () => {
			setTimeout(() => resolve(), 500);
		});

		xhr.addEventListener("error", () => {
			reject(new Error(`Asset upload failed for ${fileName}: Network error`));
		});

		xhr.addEventListener("abort", () => {
			reject(new Error(`Asset upload was aborted for ${fileName}`));
		});

		const formData = new FormData();
		formData.append("file", fileBlob, fileName);

		xhr.open("PUT", uploadUrl);
		xhr.send(formData);
	});
}

/**
 * Get asset data and metadata from the local asset database
 */
async function getLocalAssets(
	protocol: CurrentProtocol,
): Promise<Array<{ assetId: string; name: string; type: string; data: Blob; size: number; value?: string }>> {
	const assets: Array<{ assetId: string; name: string; type: string; data: Blob; size: number; value?: string }> = [];

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
 * Uploads a protocol to Fresco for preview mode using direct asset upload.
 *
 * Flow:
 * 1. Extract assets from local database
 * 2. Call POST /api/preview with protocol + asset metadata
 * 3. Upload assets directly to UploadThing using presigned URLs
 * 4. Redirect to preview
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
	const protocolName = "name" in protocol && typeof protocol.name === "string" ? protocol.name : "protocol";

	try {
		// Get local assets and prepare request
		onProgress?.({ phase: "preparing" });
		const localAssets = await getLocalAssets(protocol);

		// Build asset list for the API request
		const assetRequestInfo: AssetRequestInfo[] = localAssets.map((a) => ({
			assetId: a.assetId,
			name: a.name,
			size: a.size,
			type: a.type,
			...(a.type === "apikey" && a.value ? { value: a.value } : {}),
		}));

		// Remove app state props from protocol before sending
		const { name, isValid, lastSavedAt, lastSavedTimeline, ...cleanProtocol } = protocol as CurrentProtocol & {
			name?: string;
			isValid?: boolean;
			lastSavedAt?: string;
			lastSavedTimeline?: string;
		};

		// Call the single preview endpoint
		const response = await fetch(`${frescoUrl}/api/preview`, {
			method: "POST",
			headers: getAuthHeaders(apiToken),
			body: JSON.stringify({
				protocol: cleanProtocol,
				protocolName,
				assets: assetRequestInfo,
			}),
		});

		if (!response.ok) {
			await handleFetchError(response);
		}

		const data = (await response.json()) as PreviewResponse;

		if (!data.success || !data.redirectUrl || !data.protocolId) {
			throw new Error(data.error || "Failed to create preview: Invalid response");
		}

		// Upload assets that need uploading
		const assetsToUpload = data.uploads || [];
		if (assetsToUpload.length > 0) {
			// Filter to only file assets (not apikey)
			const fileAssets = localAssets.filter((a) => a.type !== "apikey");

			for (let i = 0; i < assetsToUpload.length; i++) {
				const uploadInfo = assetsToUpload[i];
				if (!uploadInfo) continue;

				onProgress?.({ phase: "uploading-assets", current: i + 1, total: assetsToUpload.length });

				const localAsset = fileAssets.find((a) => a.assetId === uploadInfo.assetId);
				if (!localAsset) {
					throw new Error(`Asset ${uploadInfo.assetId} not found in local assets`);
				}

				await uploadAssetToPresignedUrl(uploadInfo.uploadUrl, localAsset.data, localAsset.name);
			}
		}

		// Append stage index to preview URL if needed
		onProgress?.({ phase: "processing" });

		let previewUrl = data.redirectUrl;
		if (stageIndex > 0) {
			const url = new URL(previewUrl);
			url.searchParams.set("step", stageIndex.toString());
			previewUrl = url.toString();
		}

		return { previewUrl, protocolId: data.protocolId };
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
