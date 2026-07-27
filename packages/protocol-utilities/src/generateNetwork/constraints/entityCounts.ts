import type { Stage } from '@codaco/protocol-validation';

import type { GenerationConfig } from '../config';
import type { StageOfType } from '../context';
import { getSubjectType } from '../subject';

type WorstCaseCounts = {
  node: Map<string, number>;
  edge: Map<string, number>;
};

/**
 * Node-subject stages that fabricate nodes: the three name-generator variants
 * and NetworkComposer (a from-scratch builder). Mirrors `NodeCreationStage` in
 * `../nodes`.
 */
type NodeCreationStage = StageOfType<
  | 'NameGenerator'
  | 'NameGeneratorQuickAdd'
  | 'NameGeneratorRoster'
  | 'NetworkComposer'
>;

/**
 * Stages whose prompts each name a single edge type to create for every
 * subject-node pair considered.
 */
type PairEdgeStage = StageOfType<
  'DyadCensus' | 'OneToManyDyadCensus' | 'TieStrengthCensus'
>;

function isNodeCreationStage(stage: Stage): stage is NodeCreationStage {
  return (
    stage.type === 'NameGenerator' ||
    stage.type === 'NameGeneratorQuickAdd' ||
    stage.type === 'NameGeneratorRoster' ||
    stage.type === 'NetworkComposer'
  );
}

function isPairEdgeStage(stage: Stage): stage is PairEdgeStage {
  return (
    stage.type === 'DyadCensus' ||
    stage.type === 'OneToManyDyadCensus' ||
    stage.type === 'TieStrengthCensus'
  );
}

function add(counts: Map<string, number>, key: string, value: number): void {
  counts.set(key, (counts.get(key) ?? 0) + value);
}

// `behaviours` differs in shape across the four node-creating stage types
// (only the three name-generator variants declare `maxNodes`), so the nested
// `in` check below is required even though `stage` is already narrowed to
// `NodeCreationStage`. Mirrors `getNodeCountBounds` in `../nodes`.
function maxNodesFor(
  stage: NodeCreationStage,
  config: GenerationConfig,
): number {
  const behaviours = 'behaviours' in stage ? stage.behaviours : undefined;
  if (
    behaviours &&
    'maxNodes' in behaviours &&
    behaviours.maxNodes !== undefined
  ) {
    return behaviours.maxNodes;
  }
  return config.nodeCount.max;
}

/** The largest number of unordered pairs a subject node type could ever reach. */
function pairsFor(
  nodeType: string | undefined,
  node: Map<string, number>,
): number {
  if (nodeType === undefined) return 0;
  const count = node.get(nodeType) ?? 0;
  return (count * (count - 1)) / 2;
}

/**
 * Worst-case entity counts per node/edge type across a protocol's stages, used
 * to decide `unique` feasibility. Every stage's contribution is an upper
 * bound, not its actual random draw: name-generator variants and
 * NetworkComposer use their configured `maxNodes` (or the config default) as
 * the ceiling, FamilyPedigree uses the configured maximum pedigree size, and
 * every edge-creating stage (DyadCensus, TieStrengthCensus,
 * OneToManyDyadCensus, Sociogram, NetworkComposer, FamilyPedigree) is bounded
 * by the pair count over its subject node type — no run creates more than one
 * edge of a type per unordered node pair. Counts sum across stages producing
 * the same type, since a `unique` constraint spans the whole run.
 */
export function worstCaseEntityCounts(
  stages: Stage[],
  config: GenerationConfig,
): WorstCaseCounts {
  const node = new Map<string, number>();
  const edge = new Map<string, number>();

  for (const stage of stages) {
    if (isNodeCreationStage(stage)) {
      const nodeType = getSubjectType(stage.subject, 'node');
      if (nodeType !== undefined) {
        add(node, nodeType, maxNodesFor(stage, config));
      }
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      const nodeType = stage.nodeConfig?.type;
      if (nodeType) {
        add(node, nodeType, config.familyPedigreeNodeCount.max);
      }
    }
  }

  for (const stage of stages) {
    if (isPairEdgeStage(stage)) {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const prompt of stage.prompts) {
        const edgeType = prompt.createEdge;
        if (edgeType) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'Sociogram') {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const prompt of stage.prompts) {
        const edgeType = prompt.edges?.create;
        if (edgeType) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'NetworkComposer') {
      const pairs = pairsFor(getSubjectType(stage.subject, 'node'), node);
      for (const edgeDef of stage.edges ?? []) {
        const edgeType = getSubjectType(edgeDef.subject, 'edge');
        if (edgeType !== undefined) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      const edgeType = stage.edgeConfig?.type;
      if (edgeType) {
        add(edge, edgeType, pairsFor(stage.nodeConfig?.type, node));
      }
    }
  }

  return { node, edge };
}
