import { get } from 'es-toolkit/compat';
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '~/ducks/modules/root';
import { getAssetManifest } from '~/selectors/protocol';
import {
  getGeoJsonVariables,
  getNetworkVariables,
} from '~/utils/protocols/assetTools';
import { reportError } from '~/utils/reportError';

type VariableOption = { label: string; value: string };

type VariablesStateBase = {
  isVariablesLoading: boolean;
  variablesError: string | null;
};

type VariablesStateOptions = VariablesStateBase & {
  variables: VariableOption[];
};
type VariablesStateStrings = VariablesStateBase & { variables: string[] };
type VariablesState = VariablesStateBase & {
  variables: string[] | VariableOption[];
};

const EMPTY_VARIABLES: never[] = [];

/** One completed read, held against the request that produced it. */
type LoadedVariables = {
  dataSource: string;
  type: string;
  asOptions: boolean;
  asset: unknown;
  variables: string[] | VariableOption[];
  variablesError: string | null;
};

const toOptions = (variables: string[]): VariableOption[] =>
  variables.map((v) => ({ label: v, value: v }));

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
  type = 'network',
): VariablesState {
  // The read is held against the request that produced it, and the state this
  // hook reports is derived from whether that request is still the current
  // one. So "loading" is a fact about the request rather than a flag an effect
  // has to set before it starts and unset when it finishes — and a read that
  // resolves after its data source has been replaced can no longer be reported
  // as the new source's variables.
  const [loaded, setLoaded] = useState<LoadedVariables | null>(null);
  const asset = useSelector((s: RootState) =>
    dataSource ? get(getAssetManifest(s), dataSource) : undefined,
  );

  useEffect(() => {
    if (!dataSource || !asset) {
      return undefined;
    }

    const fetchVariables = async (): Promise<string[]> => {
      if (type === 'geojson') {
        return getGeoJsonVariables(dataSource);
      }
      return (await getNetworkVariables(dataSource)) ?? [];
    };

    // A superseded read must not write at all. Keying the stored value by its
    // request stops it being *reported* as the new source's variables, but a
    // late write would still replace the current source's answer with one that
    // no longer matches — and nothing re-runs this effect to correct it, so the
    // hook would stay loading with an empty list until the asset changes again.
    let cancelled = false;

    fetchVariables()
      .then((variables) => {
        if (cancelled) return;
        setLoaded({
          dataSource,
          type,
          asOptions,
          asset,
          variables: asOptions ? toOptions(variables) : variables,
          variablesError: null,
        });
      })
      .catch((e: Error) => {
        reportError(e);
        if (cancelled) return;
        setLoaded({
          dataSource,
          type,
          asOptions,
          asset,
          variables: EMPTY_VARIABLES,
          variablesError: e.toString(),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [dataSource, type, asOptions, asset]);

  const isCurrent =
    loaded !== null &&
    loaded.dataSource === dataSource &&
    loaded.type === type &&
    loaded.asOptions === asOptions &&
    loaded.asset === asset;

  return useMemo(
    () => ({
      // An asset the manifest does not know is not a read in progress: there
      // is nothing to wait for, and the empty list below is the final answer.
      isVariablesLoading: Boolean(dataSource) && Boolean(asset) && !isCurrent,
      variables: isCurrent ? loaded.variables : EMPTY_VARIABLES,
      variablesError: isCurrent ? loaded.variablesError : null,
    }),
    [asset, dataSource, isCurrent, loaded],
  );
}

export default useVariablesFromExternalData;
