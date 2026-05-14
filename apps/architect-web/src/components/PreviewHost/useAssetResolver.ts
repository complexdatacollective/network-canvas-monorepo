import type { AssetRequestHandler } from "@codaco/interview";
import { useCallback, useEffect, useRef } from "react";
import { assetDb } from "~/utils/assetDB";

export function useAssetResolver(): AssetRequestHandler {
	const cache = useRef<Map<string, string>>(new Map());

	useEffect(() => {
		const owned = cache.current;
		return () => {
			for (const url of owned.values()) {
				URL.revokeObjectURL(url);
			}
			owned.clear();
		};
	}, []);

	return useCallback(async (assetId: string) => {
		const cached = cache.current.get(assetId);
		if (cached) return cached;

		const entry = await assetDb.assets.get({ id: assetId });
		if (!entry || typeof entry.data === "string") {
			throw new Error(`Asset ${assetId} not found in local store`);
		}

		const blob = entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
		const url = URL.createObjectURL(blob);
		cache.current.set(assetId, url);
		return url;
	}, []);
}
