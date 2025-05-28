import { get } from "es-toolkit/compat";
import { useCallback } from "react";
import { useSelector } from "react-redux";
import { getAssetManifest } from "~/selectors/protocol";

const defaultMeta = {
	name: "Interview network",
};

const useExternalDataDownload = () => {
	const assetManifest = useSelector(getAssetManifest);

	const getAssetInfo = useCallback(
		(id) => {
			const source = get(assetManifest, [id, "source"], "");
			const meta = get(assetManifest, id, defaultMeta);
			const assetPath = `assets/${source}`;
			return [assetPath, meta];
		},
		[assetManifest],
	);

	const handleDownload = useCallback((id) => {
		const [assetPath, meta] = getAssetInfo(id);

		console.log("handleDownload not implemented");
	}, []);

	return handleDownload;
};

export default useExternalDataDownload;
