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

// Asset info sent to the prepare endpoint
type PrepareAssetInfo = {
	assetId: string;
	name: string;
	size: number;
};

// Upload info returned from the prepare endpoint
type AssetUploadInfo = {
	assetId: string;
	uploadUrl: string;
	fileKey: string;
	fileUrl: string;
	expiresAt: number;
};

// Existing asset info returned from prepare (already in DB, no upload needed)
type ExistingAssetInfo = {
	assetId: string;
	fileKey: string;
	fileUrl: string;
};

type PrepareResponse = {
	success: boolean;
	existing: ExistingAssetInfo[];
	uploads: AssetUploadInfo[];
	error?: string;
	details?: string;
};

// Asset info sent to the confirm endpoint (includes file info from uploads)
type ConfirmAssetInfo = {
	assetId: string;
	name: string;
	size: number;
	type: string;
	fileKey: string;
	fileUrl: string;
	value?: string; // For apikey type assets
};

type ConfirmResponse = {
	success: boolean;
	protocolId: string;
	redirectUrl: string;
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
 * 2. Call POST /api/preview/prepare to get presigned URLs
 * 3. Upload assets directly to UploadThing using presigned URLs
 * 4. Call POST /api/preview/confirm to create DB records
 * 5. Redirect to preview
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

		// Separate file assets from apikey assets
		const fileAssets = localAssets.filter((a) => a.type !== "apikey");
		const apikeyAssets = localAssets.filter((a) => a.type === "apikey");

		// Build asset list for the prepare endpoint (only file assets need presigned URLs)
		const prepareAssets: PrepareAssetInfo[] = fileAssets.map((a) => ({
			assetId: a.assetId,
			name: a.name,
			size: a.size,
		}));

		// Step 1: Call prepare endpoint to get presigned URLs and existing assets
		let uploads: AssetUploadInfo[] = [];
		let existing: ExistingAssetInfo[] = [];

		if (prepareAssets.length > 0) {
			const prepareResponse = await fetch(`${frescoUrl}/api/preview/prepare`, {
				method: "POST",
				headers: getAuthHeaders(apiToken),
				body: JSON.stringify({ assets: prepareAssets }),
			});

			if (!prepareResponse.ok) {
				await handleFetchError(prepareResponse);
			}

			const prepareData = (await prepareResponse.json()) as PrepareResponse;

			if (!prepareData.success) {
				throw new Error(prepareData.error || "Failed to prepare upload");
			}

			uploads = prepareData.uploads || [];
			existing = prepareData.existing || [];
		}

		// Step 2: Upload only new assets to UploadThing (skip existing ones)
		if (uploads.length > 0) {
			for (let i = 0; i < uploads.length; i++) {
				const uploadInfo = uploads[i];
				if (!uploadInfo) continue;

				onProgress?.({ phase: "uploading-assets", current: i + 1, total: uploads.length });

				const localAsset = fileAssets.find((a) => a.assetId === uploadInfo.assetId);
				if (!localAsset) {
					throw new Error(`Asset ${uploadInfo.assetId} not found in local assets`);
				}

				await uploadAssetToPresignedUrl(uploadInfo.uploadUrl, localAsset.data, localAsset.name);
			}
		}

		// Step 3: Build confirm assets list (merge existing + uploaded + apikey assets)
		const confirmAssets: ConfirmAssetInfo[] = [
			// Existing assets (already in DB)
			...existing.map((asset) => {
				const localAsset = fileAssets.find((a) => a.assetId === asset.assetId);
				return {
					assetId: asset.assetId,
					name: localAsset?.name ?? asset.assetId,
					size: localAsset?.size ?? 0,
					type: localAsset?.type ?? "unknown",
					fileKey: asset.fileKey,
					fileUrl: asset.fileUrl,
				};
			}),
			// Newly uploaded assets
			...uploads.map((uploadInfo) => {
				const localAsset = fileAssets.find((a) => a.assetId === uploadInfo.assetId);
				if (!localAsset) {
					throw new Error(`Local asset not found for ${uploadInfo.assetId}`);
				}
				return {
					assetId: uploadInfo.assetId,
					name: localAsset.name,
					size: localAsset.size,
					type: localAsset.type,
					fileKey: uploadInfo.fileKey,
					fileUrl: uploadInfo.fileUrl,
				};
			}),
			// Apikey assets (no file upload needed)
			...apikeyAssets.map((asset) => ({
				assetId: asset.assetId,
				name: asset.name,
				size: 0,
				type: "apikey",
				fileKey: asset.assetId,
				fileUrl: "",
				value: asset.value,
			})),
		];

		// Remove app state props from protocol before sending
		const { name, isValid, lastSavedAt, lastSavedTimeline, ...cleanProtocol } = protocol as CurrentProtocol & {
			name?: string;
			isValid?: boolean;
			lastSavedAt?: string;
			lastSavedTimeline?: string;
		};

		// Step 4: Call confirm endpoint to create DB records
		onProgress?.({ phase: "processing" });

		const confirmResponse = await fetch(`${frescoUrl}/api/preview/confirm`, {
			method: "POST",
			headers: getAuthHeaders(apiToken),
			body: JSON.stringify({
				protocol: cleanProtocol,
				protocolName,
				assets: confirmAssets,
			}),
		});

		if (!confirmResponse.ok) {
			await handleFetchError(confirmResponse);
		}

		const confirmData = (await confirmResponse.json()) as ConfirmResponse;

		if (!confirmData.success || !confirmData.redirectUrl || !confirmData.protocolId) {
			throw new Error(confirmData.error || "Failed to confirm preview: Invalid response");
		}

		// Append stage index to preview URL if needed
		let previewUrl = confirmData.redirectUrl;
		if (stageIndex > 0) {
			const url = new URL(previewUrl);
			url.searchParams.set("step", stageIndex.toString());
			previewUrl = url.toString();
		}

		return { previewUrl, protocolId: confirmData.protocolId };
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
