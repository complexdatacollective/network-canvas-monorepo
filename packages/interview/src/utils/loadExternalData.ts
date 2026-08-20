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

const parseExternalAttributes = (
  value: unknown,
): Record<string, VariableValue> => {
  if (!isRecord(value)) {
    throw new TypeError('External node attributes must be an object.');
  }

  const attributes: Record<string, VariableValue> = {};

  for (const [name, attributeValue] of Object.entries(value)) {
    if (attributeValue !== null && attributeValue !== undefined) {
      attributes[name] = VariableValueSchema.parse(attributeValue);
    }
  }

  return attributes;
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

const CSVToJSONNetworkFormat = async (
  data: string,
): Promise<ExternalNode[]> => {
  const network: unknown[] = await csv({ flatKeys: true }).fromString(data);

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

    const attributes: NcNode[EntityAttributesProperty] = {};

    for (const [attributeKey, attributeValue] of Object.entries(
      node[entityAttributesProperty] ?? {},
    )) {
      const variableId =
        getParentKeyByNameValue(
          codebookDefinition?.variables ?? {},
          attributeKey,
        ) ?? attributeKey;
      attributes[variableId] = attributeValue;
    }

    return {
      type: subjectType,
      [entityPrimaryKeyProperty]: uuid,
      [entityAttributesProperty]: attributes,
    };
  };
