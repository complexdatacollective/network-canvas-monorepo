/* eslint-disable import/prefer-default-export */

import { get } from 'es-toolkit/compat';

import {
  findCollidingAttributeNames,
  findRosterCharacterProblems,
  getVariableNamesFromNetwork,
  type Network,
  readRosterCsv,
  type RosterFormat,
  validateNames,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';
import { getAssetById, MissingAssetDataError } from '~/utils/assetUtils';
import { getSupportedAssetType } from '~/utils/protocols/importAsset';
import { RosterCharacterError } from '~/utils/protocols/rosterCharacterError';

type ReaderFunc<Result> = (...args: string[]) => Promise<Result>;

type CodedError = {
  code?: string;
} & Error;

const withExtensionSwitch =
  <Result>(configuration: Record<string, ReaderFunc<Result>>) =>
  (
    filePathOrUrl: string,
    ...rest: string[]
  ): Promise<Result | undefined> | null => {
    if (!filePathOrUrl) {
      return null;
    }
    const extension = filePathOrUrl.split('.').pop()?.toLowerCase() || '';

    const f = Object.hasOwn(configuration, extension)
      ? configuration[extension]
      : undefined;
    return f ? f(...rest) : Promise.resolve(undefined);
  };

const readJsonNetwork = async (assetId: string): Promise<Network> => {
  const asset = await getAssetById(assetId);

  if (!asset) {
    throw new MissingAssetDataError(assetId);
  }

  const text =
    typeof asset.data === 'string' ? asset.data : await asset.data.text();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the researcher's own network file; its shape is checked when the asset is imported (validateNetwork reads its attribute names) and a malformed file fails there
  return JSON.parse(text) as Network;
};

/**
 * A CSV roster as the interview reads it, so the columns Architect offers are
 * the ones the interview holds. A row with more or fewer cells than the header
 * has columns is refused rather than read short.
 */
const parseCsvNetwork = async (text: string) => {
  const { columns, rows } = await readRosterCsv(text);

  if (rows.some(({ cells }) => cells !== columns.length)) {
    const error: CodedError = new Error(
      'A row of this file has more or fewer cells than the header has columns.',
    );
    error.code = 'COLUMN_MISMATCHED';
    throw error;
  }

  const records = rows.map(({ values }) => values);
  const network: Network = {
    nodes: records.map((values) => ({ [entityAttributesProperty]: values })),
    edges: [],
  };
  return { network, records };
};

const readCsvNetwork = async (assetId: string): Promise<Network> => {
  const asset = await getAssetById(assetId);

  if (!asset) {
    throw new MissingAssetDataError(assetId);
  }

  if (typeof asset.data === 'string') {
    throw new Error('Expected Blob data for CSV asset');
  }

  const { network } = await parseCsvNetwork(await asset.data.text());
  return network;
};

export const networkReader = withExtensionSwitch({
  csv: readCsvNetwork,
  json: readJsonNetwork,
});

export const getNetworkVariables = async (assetId: string) => {
  const asset = await getAssetById(assetId);
  if (!asset) {
    throw new MissingAssetDataError(assetId);
  }

  const network = await networkReader(asset.name, assetId);

  if (!network) {
    return null;
  }
  return getVariableNamesFromNetwork(network);
};

type ValidationResult = {
  duplicateCount: number;
};

const countDuplicateRows = (
  rows: readonly Readonly<Record<string, unknown>>[],
): number => {
  const seen = new Set<string>();
  let count = 0;
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      count++;
    } else {
      seen.add(key);
    }
  }
  return count;
};

// First, so a roster is refused for the character itself rather than for a
// parse failure the character caused.
const refuseUnsupportedCharacters = async (
  text: string,
  format: RosterFormat,
) => {
  const { problems, total } = await findRosterCharacterProblems(text, format);
  const [first] = problems;
  if (first !== undefined) {
    throw new RosterCharacterError(first, total);
  }
};

const validateNetwork = async (file: File): Promise<ValidationResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  let network: Network | undefined;
  let duplicateCount = 0;

  if (extension === 'json') {
    const text = await file.text();
    await refuseUnsupportedCharacters(text, 'json');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the researcher's file; the empty check, getVariableNamesFromNetwork and validateNames below read its nodes and edges, and a malformed file fails there
    network = JSON.parse(text) as Network;
  } else if (extension === 'csv') {
    const text = await file.text();
    await refuseUnsupportedCharacters(text, 'csv');
    const parsed = await parseCsvNetwork(text);
    duplicateCount = countDuplicateRows(parsed.records);
    network = parsed.network;
  }

  if (
    network === undefined ||
    (get(network, 'nodes', []).length === 0 &&
      get(network, 'edges', []).length === 0)
  ) {
    // Coded so the message survives to the researcher: an uncoded import
    // failure is replaced with generic copy (see getImportAssetErrorInfo in
    // ducks/modules/protocol/assetManifest.ts) because those are internal.
    const error: CodedError = new Error(
      "This network file doesn't contain any nodes or edges.",
    );
    error.code = 'NETWORK_EMPTY';
    throw error;
  }

  const variableNames = getVariableNamesFromNetwork(network);

  // Checked before validateNames, which reports these too, so they carry
  // their own code and researcher-facing message.
  const collisions = findCollidingAttributeNames(variableNames);

  if (collisions.length > 0) {
    const error: CodedError = new Error(
      `Column headers that are the same name written in different ways: ${collisions.map((group) => group.map((name) => JSON.stringify(name)).join(' and ')).join(', ')}.`,
    );
    error.code = 'DUPLICATE_COLUMN';
    throw error;
  }

  const errorString = validateNames(variableNames);

  if (errorString) {
    const error: CodedError = new Error(errorString);
    error.code = 'VARIABLE_NAME';
    throw error;
  }

  return { duplicateCount };
};

export const validateAsset = async (file: File): Promise<ValidationResult> => {
  const assetType = getSupportedAssetType(file.name);

  if (!assetType) {
    const error: CodedError = new Error(
      'That file type is not supported as a resource.',
    );
    error.code = 'UNSUPPORTED_TYPE';
    throw error;
  }

  if (assetType === 'network') {
    return await validateNetwork(file);
  }

  return { duplicateCount: 0 };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The properties of each feature in a GeoJSON file's text. A feature with no
 * properties (GeoJSON allows that) contributes nothing, and a file with no
 * features contributes no rows.
 */
export const readGeoJsonFeatureProperties = (
  text: string,
): Record<string, unknown>[] => {
  const geoJson: unknown = JSON.parse(text);
  if (!isRecord(geoJson) || !Array.isArray(geoJson.features)) {
    return [];
  }
  return geoJson.features.flatMap((feature: unknown) =>
    isRecord(feature) && isRecord(feature.properties)
      ? [feature.properties]
      : [],
  );
};

export const getGeoJsonVariables = async (assetId: string) => {
  const asset = await getAssetById(assetId);

  if (!asset) {
    throw new MissingAssetDataError(assetId);
  }

  if (typeof asset.data === 'string') {
    throw new Error('Expected Blob data for GeoJSON asset');
  }

  const text = await asset.data.text();

  const keys = new Set<string>();
  for (const properties of readGeoJsonFeatureProperties(text)) {
    for (const key of Object.keys(properties)) {
      keys.add(key);
    }
  }

  return Array.from(keys);
};
