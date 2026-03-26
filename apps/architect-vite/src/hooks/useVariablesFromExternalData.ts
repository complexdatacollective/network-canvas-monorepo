import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "~/ducks/modules/root";
import { makeGetGeoJsonAssetVariables, makeGetNetworkAssetVariables } from "~/selectors/assets";

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

	const rootState = useSelector((s: RootState) => s);

	useEffect(() => {
		if (!dataSource) {
			return;
		}

		setState({ isVariablesLoading: true, variables: [], variablesError: null });

		const getVariablesFn =
			type === "geojson" ? makeGetGeoJsonAssetVariables(rootState) : makeGetNetworkAssetVariables(rootState);

		getVariablesFn(dataSource, asOptions)
			.then((variables) => {
				setState((s) => ({ ...s, isVariablesLoading: false, variables: variables ?? [] }));
			})
			.catch((e: Error) => {
				setState((s) => ({
					...s,
					isVariablesLoading: false,
					variablesError: e.toString(),
				}));
			});
	}, [dataSource, type, asOptions, rootState]);

	return state;
}

export default useVariablesFromExternalData;
