import { get } from "es-toolkit/compat";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getAssetManifest } from "~/selectors/protocol";
import { getGeoJsonVariables, getNetworkVariables } from "~/utils/protocols/assetTools";

type VariableOption = { label: string; value: string };

type VariablesStateBase = {
	isVariablesLoading: boolean;
	variablesError: string | null;
};

type VariablesStateOptions = VariablesStateBase & { variables: VariableOption[] };
type VariablesStateStrings = VariablesStateBase & { variables: string[] };
type VariablesState = VariablesStateBase & { variables: string[] | VariableOption[] };

const initialState: VariablesState = {
	isVariablesLoading: false,
	variables: [],
	variablesError: null,
};

const toOptions = (variables: string[]): VariableOption[] => variables.map((v) => ({ label: v, value: v }));

function useVariablesFromExternalData(
	dataSource: string | undefined,
	asOptions: true,
	type?: string,
): VariablesStateOptions;
function useVariablesFromExternalData(
	dataSource: string | undefined,
	asOptions?: false,
	type?: string,
): VariablesStateStrings;
function useVariablesFromExternalData(
	dataSource: string | undefined,
	asOptions = false,
	type = "network",
): VariablesState {
	const [state, setState] = useState<VariablesState>(initialState);
	const assetManifest = useSelector(getAssetManifest);

	useEffect(() => {
		if (!dataSource) {
			return;
		}

		setState({ isVariablesLoading: true, variables: [], variablesError: null });

		if (!get(assetManifest, dataSource)) {
			setState((s) => ({ ...s, isVariablesLoading: false, variables: [] }));
			return;
		}

		const fetchVariables = async (): Promise<string[]> => {
			if (type === "geojson") {
				return getGeoJsonVariables(dataSource);
			}
			return (await getNetworkVariables(dataSource)) ?? [];
		};

		fetchVariables()
			.then((variables) => {
				setState((s) => ({
					...s,
					isVariablesLoading: false,
					variables: asOptions ? toOptions(variables) : variables,
				}));
			})
			.catch((e: Error) => {
				setState((s) => ({
					...s,
					isVariablesLoading: false,
					variablesError: e.toString(),
				}));
			});
	}, [dataSource, type, asOptions, assetManifest]);

	return state;
}

export default useVariablesFromExternalData;
