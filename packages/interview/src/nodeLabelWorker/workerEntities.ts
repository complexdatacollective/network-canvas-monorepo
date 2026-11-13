import type { Codebook, Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcEgo,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import type { WorkerEntity, WorkerNetwork } from './messages';

type EntityDefinition =
  | Readonly<{ name?: string; variables?: Record<string, Variable> }>
  | undefined;

/**
 * An entity's attributes by variable name, as a worker reads them. An
 * attribute the codebook does not define (a roster's own column) keeps its
 * key.
 *
 * Encrypted answers are left out. A worker never sees ciphertext it could
 * mistake for a value, and plaintext never leaves the key's decryption scope.
 */
const namedAttributes = (
  entity: NcNode | NcEdge | NcEgo,
  definition: EntityDefinition,
): [string, unknown][] => {
  const secure = entity[entitySecureAttributesMeta];
  return Object.entries(entity[entityAttributesProperty]).flatMap(
    ([variableId, value]): [string, unknown][] => {
      const variable =
        definition?.variables && Object.hasOwn(definition.variables, variableId)
          ? definition.variables[variableId]
          : undefined;
      if (
        variable?.encrypted ||
        (secure && Object.hasOwn(secure, variableId))
      ) {
        return [];
      }
      return [[variable?.name ?? variableId, value]];
    },
  );
};

// The identifying properties come first, so an attribute of the same name
// takes precedence, as it did in Interviewer Classic. `Object.fromEntries`
// defines each as the entity's own property, whatever it is called.
const toWorkerEntity = (
  entity: NcNode | NcEdge | NcEgo,
  definition: EntityDefinition,
  identity: [string, unknown][],
): WorkerEntity =>
  Object.fromEntries([...identity, ...namedAttributes(entity, definition)]);

const definitionOf = (
  definitions: Codebook['node'] | Codebook['edge'],
  type: string,
): EntityDefinition =>
  definitions && Object.hasOwn(definitions, type)
    ? definitions[type]
    : undefined;

export function toWorkerNode(
  node: NcNode,
  codebook: Codebook | undefined,
): WorkerEntity {
  const definition = definitionOf(codebook?.node, node.type);
  return toWorkerEntity(node, definition, [
    ['networkCanvasId', node[entityPrimaryKeyProperty]],
    ['networkCanvasType', definition?.name ?? node.type],
  ]);
}

const toWorkerEdge = (
  edge: NcEdge,
  codebook: Codebook | undefined,
): WorkerEntity => {
  const definition = definitionOf(codebook?.edge, edge.type);
  return toWorkerEntity(edge, definition, [
    ['networkCanvasId', edge[entityPrimaryKeyProperty]],
    ['networkCanvasType', definition?.name ?? edge.type],
    ['from', edge.from],
    ['to', edge.to],
  ]);
};

export function toWorkerNetwork(
  network: NcNetwork,
  codebook: Codebook | undefined,
): WorkerNetwork {
  return {
    nodes: network.nodes.map((node) => toWorkerNode(node, codebook)),
    edges: network.edges.map((edge) => toWorkerEdge(edge, codebook)),
    ego: toWorkerEntity(network.ego, codebook?.ego, [
      ['networkCanvasId', network.ego[entityPrimaryKeyProperty]],
    ]),
  };
}
