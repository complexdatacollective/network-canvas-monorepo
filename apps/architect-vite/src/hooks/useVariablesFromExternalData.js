import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { makeGetGeoJsonAssetVariables, makeGetNetworkAssetVariables } from "~/selectors/assets";
import { getAssetManifest } from "~/selectors/protocol";

const initialState = {
	isVariablesLoading: false,
	variables: [],
	variablesError: null,
};

const useVariablesFromExternalData = (dataSource, asOptions = false, type = "network") => {
	const [state, setState] = useState(initialState);

	// Only select the asset manifest (which is what the functions actually need)
	const assetManifest = useSelector(getAssetManifest);

	// Create a minimal state object containing only what's needed
	const partialState = useMemo(
		() => ({
			protocol: { present: { assetManifest } },
		}),
		[assetManifest],
	);

	useEffect(() => {
		if (!dataSource) {
			return;
		}

		setState({ isVariablesLoading: true, variables: [], variablesError: null });

		// Create the appropriate function based on type
		const getVariablesFn =
			type === "geojson" ? makeGetGeoJsonAssetVariables(partialState) : makeGetNetworkAssetVariables(partialState);

		getVariablesFn(dataSource, asOptions)
			.then((variables) => {
				setState((s) => ({ ...s, isVariablesLoading: false, variables }));
			})
			.catch((e) => {
				setState((s) => ({
					...s,
					isVariablesLoading: false,
					variablesError: e.toString(),
				}));
			});
	}, [dataSource, type, asOptions, partialState]);

	return state;
};

export default useVariablesFromExternalData;
