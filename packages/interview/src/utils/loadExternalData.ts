import csv from 'csvtojson';
import { hash } from 'ohash';

// import CSVWorker from './csvDecoder.worker';
import type { Codebook, StageSubject } from '@codaco/protocol-validation';
import {
  type EntityAttributesProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
  VariableValueSchema,
} from '@codaco/shared-consts';

import getParentKeyByNameValue from './getParentKeyByNameValue';

/**
 * Converting data from CSV to our network JSON format is expensive, and so happens
 * inside of a worker to keep the app as responsive as possible.
 *
 * This function takes the result of the platform-specific file load operation,
 * and then initializes the conversion worker, before sending it the file contents
 * to decode.
 */
// const convertCSVToJsonWithWorker = (data) => new Promise((resolve, reject) => {
//   worker.postMessage(data);
//   worker.onerror = (event) => {
//     reject(event);
//   };
//   worker.onmessage = (event) => {
//     resolve(event.data);
//   };
// });

type ExternalNode = Record<string, unknown> & {
  [entityAttributesProperty]?: NcNode[EntityAttributesProperty];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Built with Object.fromEntries, which defines own properties: assigning a
// column called `__proto__` onto a plain object would set its prototype instead.
const parseExternalAttributes = (
  value: unknown,
): Record<string, VariableValue> => {
  if (!isRecord(value)) {
    throw new TypeError('External node attributes must be an object.');
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, attributeValue]) =>
          attributeValue !== null && attributeValue !== undefined,
      )
      .map(([name, attributeValue]) => [
        name,
        VariableValueSchema.parse(attributeValue),
      ]),
  );
};

const parseExternalNode = (value: unknown): ExternalNode => {
  if (!isRecord(value)) {
    throw new TypeError('External network nodes must be objects.');
  }

  const attributes = value[entityAttributesProperty];

  if (attributes === undefined) {
    return { ...value };
  }

  return {
    ...value,
    [entityAttributesProperty]: parseExternalAttributes(attributes),
  };
};

const parseExternalNetwork = (value: unknown): { nodes: ExternalNode[] } => {
  if (!isRecord(value)) {
    throw new TypeError('External network data must be an object.');
  }

  const nodes = value.nodes;

  if (nodes === null || nodes === undefined) {
    return { nodes: [] };
  }

  if (!Array.isArray(nodes)) {
    throw new TypeError('External network nodes must be an array.');
  }

  return { nodes: nodes.map(parseExternalNode) };
};

const columnName = (header: readonly unknown[], index: number) => {
  const name = header[index];
  return typeof name === 'string' && name !== '' ? name : `field${index + 1}`;
};

/**
 * Reads each row as an array of cells and pairs it with the header ourselves.
 * csvtojson's JSON output builds each row by assigning to a plain object, which
 * silently drops a `__proto__` column, and treats a dot in a header as nesting
 * unless `flatKeys` is set. A researcher's variable name may be any text, so a
 * column must keep exactly the name it was given.
 *
 * Mirrors the JSON output otherwise: a blank header is named `field<n>`, and
 * blank lines are not rows.
 */
const parseCSVRows = async (data: string) => {
  const converter = csv({ output: 'csv' }).fromString(data);
  const rows: unknown[] = await converter;
  const header = converter.parseRuntime.headers ?? [];

  return rows.flatMap((row) => {
    if (!Array.isArray(row)) {
      throw new TypeError('CSV rows must be arrays of cells.');
    }

    if (row.length === 0) {
      return [];
    }

    return [
      Object.fromEntries(
        row.map((cell: unknown, index) => [columnName(header, index), cell]),
      ),
    ];
  });
};

const CSVToJSONNetworkFormat = async (
  data: string,
): Promise<ExternalNode[]> => {
  const network = await parseCSVRows(data);

  return network.map((entry) => ({
    [entityAttributesProperty]: parseExternalAttributes(entry),
  }));
};

const convertCSVToJsonWithWorker = async (data: string) => {
  return CSVToJSONNetworkFormat(data);
};

/**
 * Loads network data from assets and appends objectHash uids.
 */
const loadExternalData = async (fileName: string, url: string) => {
  const isCSV = fileName.split('.').pop() === 'csv';

  const data = await fetch(url);

  if (isCSV) {
    const text = await data.text();
    const nodes = await convertCSVToJsonWithWorker(text);
    return { nodes };
  }

  const json: unknown = await data.json();
  return parseExternalNetwork(json);
};

export default loadExternalData;

// Replace string keys with UUIDs in codebook, according to stage subject.
export const makeVariableUUIDReplacer =
  (
    protocolCodebook: Codebook,
    subjectType: Extract<StageSubject, { entity: 'node' }>['type'],
  ) =>
  (node: ExternalNode, index: number): NcNode => {
    const codebookDefinition = protocolCodebook.node?.[subjectType];

    // Salt the content hash with the row's data-file position so byte-identical
    // rows receive distinct (but deterministic) primary keys. Without the index
    // the Collection keyExtractor dedupes identical rows to a single card.
    // Prefix with the subject type so the same asset parsed for two different
    // node types can never collide: a row's identity is scoped to the subject
    // it was parsed for, keeping primary keys unique within a single network.
    const uuid = `${subjectType}_${hash({ node, index })}`;

    const attributes: NcNode[EntityAttributesProperty] = Object.fromEntries(
      Object.entries(node[entityAttributesProperty] ?? {}).map(
        ([attributeKey, attributeValue]) => [
          getParentKeyByNameValue(codebookDefinition?.variables, attributeKey),
          attributeValue,
        ],
      ),
    );

    return {
      type: subjectType,
      [entityPrimaryKeyProperty]: uuid,
      [entityAttributesProperty]: attributes,
    };
  };
