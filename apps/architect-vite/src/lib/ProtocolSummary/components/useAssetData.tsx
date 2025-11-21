import { get } from "es-toolkit/compat";
import { useContext, useEffect, useState } from "react";
import { getAssetPath, makeGetNetworkAssetVariables } from "~/selectors/assets";
import SummaryContext from "./SummaryContext";

const stubState = (assetManifest: Record<string, unknown>, workingPath: string) => ({
	session: { workingPath },
	protocol: { present: { assetManifest } },
});

type AssetData = {
	type?: string;
	name?: string;
	source?: string;
	[key: string]: unknown;
};

const useAssetData = (id: string) => {
	const { protocol, workingPath } = useContext(SummaryContext);

	const data = get(protocol.assetManifest, id) as AssetData | undefined;
	const [variables, setVariables] = useState<string | null>(null);

	const stubbedState = stubState(protocol.assetManifest ?? {}, workingPath);
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

	if (!data) {
		return {};
	}

	// TODO: When assets are stored remotely, this will be:
	// const url = `https://assets.example.com/${encodeURIComponent(assetPath)}`;

	// For now, return a placeholder URL that won't cause errors
	const url = data.source ? `/assets/${data.source}` : "#";

	return {
		name: data.name,
		type: data.type,
		variables,
		assetPath,
		url,
	};
};

export default useAssetData;
