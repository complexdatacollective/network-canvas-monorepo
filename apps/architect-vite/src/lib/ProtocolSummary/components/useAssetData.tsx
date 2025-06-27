import { get } from "es-toolkit/compat";
import { useContext, useEffect, useState } from "react";
import { getAssetPath, makeGetNetworkAssetVariables } from "~/selectors/assets";
import SummaryContext from "./SummaryContext";

const stubState = (assetManifest: Record<string, unknown>, workingPath: string) => ({
	session: { workingPath },
	protocol: { present: { assetManifest } },
});

const useAssetData = (id: string) => {
	const {
		protocol: { assetManifest },
		workingPath,
	} = useContext(SummaryContext);

	const data = get(assetManifest, id);

	if (!data) {
		return {};
	}

	const [variables, setVariables] = useState<string | null>(null);

	const stubbedState = stubState(assetManifest, workingPath);

	const getNetworkAssetVariables = makeGetNetworkAssetVariables(stubbedState);
	const assetPath = getAssetPath(stubbedState, id);

	useEffect(() => {
		if (data.type !== "network") {
			return;
		}

		getNetworkAssetVariables(id).then((v) => {
			if (!v) {
				return;
			}
			setVariables(v.join(", "));
		});
	}, []);

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
