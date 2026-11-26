import { edgeIdentityKey } from '@codaco/shared-consts/edge-identity';

import type { EndpointRule } from '../schemas/9/codebook/definitions.ts';

/**
 * The parts of a codebook the edge type rules read. Every consumer asks these
 * helpers rather than reading `directed` or `endpointRules` itself, so the
 * meaning of an absent setting is decided here once.
 */
export type EdgeRulesCodebook = {
  node?: Record<string, unknown>;
  edge?: Record<
    string,
    { directed?: true; endpointRules?: readonly EndpointRule[] }
  >;
};

type TypedNode = { _uid: string; type: string };

export type EndpointRuleProblem =
  | { kind: 'selfLoop'; edgeIndex: number; edgeType: string }
  | {
      kind: 'duplicate';
      edgeIndex: number;
      edgeType: string;
      duplicateOfIndex: number;
    }
  | {
      kind: 'missingEndpoint';
      edgeIndex: number;
      edgeType: string;
      end: 'from' | 'to';
    }
  | {
      kind: 'endpointTypesNotAllowed';
      edgeIndex: number;
      edgeType: string;
      sourceType: string;
      targetType: string;
    };

const edgeDefinition = (codebook: EdgeRulesCodebook, edgeType: string) =>
  codebook.edge && Object.hasOwn(codebook.edge, edgeType)
    ? codebook.edge[edgeType]
    : undefined;

export const isDirectedEdgeType = (
  codebook: EdgeRulesCodebook,
  edgeType: string,
): boolean => edgeDefinition(codebook, edgeType)?.directed === true;

export const getEndpointRules = (
  codebook: EdgeRulesCodebook,
  edgeType: string,
): readonly EndpointRule[] | undefined =>
  edgeDefinition(codebook, edgeType)?.endpointRules;

/**
 * Whether an edge of `edgeType` may join a node of `sourceNodeType` to one of
 * `targetNodeType`. Node identity is not judged: refusing a self-loop is the
 * caller's concern.
 */
export const edgeTypeAllowsEndpoints = (
  codebook: EdgeRulesCodebook,
  edgeType: string,
  sourceNodeType: string,
  targetNodeType: string,
): boolean => {
  const rules = getEndpointRules(codebook, edgeType);
  if (!rules) return true;
  const directed = isDirectedEdgeType(codebook, edgeType);
  return rules.some(
    ({ sourceType, targetType }) =>
      (sourceType === sourceNodeType && targetType === targetNodeType) ||
      (!directed &&
        sourceType === targetNodeType &&
        targetType === sourceNodeType),
  );
};

/**
 * Whether some pair of node types drawn from `nodeTypes` may be joined by an
 * edge of `edgeType`. A type paired with itself counts, on the assumption that
 * the stage can supply two nodes of it.
 */
export const edgeTypeAllowsAnyPair = (
  codebook: EdgeRulesCodebook,
  edgeType: string,
  nodeTypes: readonly string[],
): boolean =>
  nodeTypes.some((source) =>
    nodeTypes.some((target) =>
      edgeTypeAllowsEndpoints(codebook, edgeType, source, target),
    ),
  );

/**
 * The pairs of `nodes` an edge of `edgeType` may join, as `[source, target]`.
 * For a directed type every allowed ordered pair, ordered by the source's then
 * the target's position in `nodes`, so the two directions of one pair are not
 * adjacent. For an undirected type each allowed pair once, as
 * `[earlier, later]`.
 */
export const getEligibleOrderedPairs = <N extends TypedNode>(
  codebook: EdgeRulesCodebook,
  edgeType: string,
  nodes: readonly N[],
): Array<[N, N]> => {
  const directed = isDirectedEdgeType(codebook, edgeType);
  const pairs: Array<[N, N]> = [];
  nodes.forEach((source, sourceIndex) => {
    nodes.forEach((target, targetIndex) => {
      if (sourceIndex === targetIndex || source._uid === target._uid) return;
      if (!directed && targetIndex < sourceIndex) return;
      if (edgeTypeAllowsEndpoints(codebook, edgeType, source.type, target.type))
        pairs.push([source, target]);
    });
  });
  return pairs;
};

/**
 * Checks a network's edges against the edge type rules. Networks whose nodes
 * are untyped or carry no `_uid` (a network asset) are judged only as far as
 * they can be: self-loops and duplicates always, missing endpoints only when
 * every node carries `_uid`, and endpoint types only when the edge type and
 * both nodes' types are in the codebook.
 */
export const validateNetworkAgainstEndpointRules = (
  network: {
    nodes: readonly { _uid?: string; type?: string }[];
    edges: readonly { _uid?: string; from: string; to: string; type: string }[];
  },
  codebook: EdgeRulesCodebook,
): EndpointRuleProblem[] => {
  const problems: EndpointRuleProblem[] = [];
  const nodeTypeByUid = new Map<string, string | undefined>();
  let everyNodeHasUid = true;
  for (const node of network.nodes) {
    if (node._uid === undefined) everyNodeHasUid = false;
    else nodeTypeByUid.set(node._uid, node.type);
  }
  const knownNodeType = (type: string | undefined): type is string =>
    type !== undefined &&
    codebook.node !== undefined &&
    Object.hasOwn(codebook.node, type);

  const firstIndexByKey = new Map<string, number>();
  network.edges.forEach((edge, edgeIndex) => {
    const edgeType = edge.type;
    if (edge.from === edge.to) {
      problems.push({ kind: 'selfLoop', edgeIndex, edgeType });
    }

    const key = edgeIdentityKey(edge, isDirectedEdgeType(codebook, edgeType));
    const duplicateOfIndex = firstIndexByKey.get(key);
    if (duplicateOfIndex === undefined) firstIndexByKey.set(key, edgeIndex);
    else
      problems.push({
        kind: 'duplicate',
        edgeIndex,
        edgeType,
        duplicateOfIndex,
      });

    if (everyNodeHasUid) {
      for (const end of ['from', 'to'] as const) {
        if (!nodeTypeByUid.has(edge[end])) {
          problems.push({ kind: 'missingEndpoint', edgeIndex, edgeType, end });
        }
      }
    }

    const sourceType = nodeTypeByUid.get(edge.from);
    const targetType = nodeTypeByUid.get(edge.to);
    if (
      edgeDefinition(codebook, edgeType) !== undefined &&
      knownNodeType(sourceType) &&
      knownNodeType(targetType) &&
      !edgeTypeAllowsEndpoints(codebook, edgeType, sourceType, targetType)
    ) {
      problems.push({
        kind: 'endpointTypesNotAllowed',
        edgeIndex,
        edgeType,
        sourceType,
        targetType,
      });
    }
  });
  return problems;
};
