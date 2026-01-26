import { get } from "es-toolkit/compat";
import { useContext, useEffect, useState } from "react";
import { getAssetPath, makeGetNetworkAssetVariables } from "~/selectors/assets";
import { getAssetBlobUrl, revokeBlobUrl } from "~/utils/assetUtils";
import SummaryContext from "./SummaryContext";

const stubState = (assetManifest: Record<string, unknown>) => ({
	activeProtocol: { present: { assetManifest } },
});

type AssetData = {
	type?: string;
	name?: string;
	source?: string;
	[key: string]: unknown;
};

const useAssetData = (id: string) => {
	const { protocol } = useContext(SummaryContext);

	const data = get(protocol.assetManifest, id) as AssetData | undefined;
	const [variables, setVariables] = useState<string | null>(null);
	const [url, setUrl] = useState<string | undefined>(undefined);

	const stubbedState = stubState(protocol.assetManifest ?? {});
	const getNetworkAssetVariables = makeGetNetworkAssetVariables(stubbedState);
	const assetPath = getAssetPath(stubbedState, id);

	useEffect(() => {
		if (!data || data.type !== "network") {
			return;
		}

		void getNetworkAssetVariables(id).then((v) => {
			if (!v) {
				return;
			}
			setVariables(v.join(", "));
		});
	}, [data, data?.type, getNetworkAssetVariables, id]);

	useEffect(() => {
		let isMounted = true;
		let currentUrl: string | null = null;

		const loadAsset = async () => {
			if (!id) return;

			try {
				const blobUrl = await getAssetBlobUrl(id);

				if (!isMounted) return;

				if (blobUrl) {
					currentUrl = blobUrl;
					setUrl(blobUrl);
				}
			} catch (_err) {}
		};

		void loadAsset();

		return () => {
			isMounted = false;
			if (currentUrl) {
				revokeBlobUrl(currentUrl);
			}
		};
	}, [id]);

	if (!data) {
		return {};
	}

	return {
		name: data.name,
		type: data.type,
		value: data.value,
		variables,
		assetPath,
		url,
	};
};

export default useAssetData;
