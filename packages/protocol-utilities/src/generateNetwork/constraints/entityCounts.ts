import type { Stage } from '@codaco/protocol-validation';

import type { GenerationConfig } from '../config';
import type { StageOfType } from '../context';
import { getNodeCountBounds, type NodeCreationStage } from '../nodes';
import { getSubjectType } from '../subject';

type WorstCaseCounts = {
  node: Map<string, number>;
  edge: Map<string, number>;
};

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
 * NetworkComposer use `getNodeCountBounds`'s ceiling, FamilyPedigree uses the
 * configured maximum pedigree size. For edges, DyadCensus, TieStrengthCensus,
 * OneToManyDyadCensus, Sociogram, and NetworkComposer bound each prompt (or
 * edge definition) by the pair count over its subject node type — a run
 * creates at most one edge of a type per unordered node pair per prompt, so
 * bounds accumulate per prompt. FamilyPedigree instead bounds its edge type by
 * `familyPedigreeNodeCount.max - 1`, the parent-child edges it actually
 * creates. Counts sum across stages producing the same type, since a `unique`
 * constraint spans the whole run.
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
        add(node, nodeType, getNodeCountBounds(stage, config).maxNodes);
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
      // Mirrors `handleNetworkComposer`'s read exactly (no `entity` check), so
      // this count can never be lower than what the generator produces.
      for (const edgeDef of stage.edges ?? []) {
        const edgeType = edgeDef.subject?.type;
        if (edgeType !== undefined) add(edge, edgeType, pairs);
      }
      continue;
    }

    if (stage.type === 'FamilyPedigree') {
      const edgeType = stage.edgeConfig?.type;
      if (edgeType) {
        // `handleFamilyPedigree` creates exactly `n - 1` edges (one per node
        // index 1..n-1), never pairwise, so the pair count over-counts by
        // roughly 5x at the default config maximum. Bound it by the true
        // maximum instead.
        add(
          edge,
          edgeType,
          Math.max(config.familyPedigreeNodeCount.max - 1, 0),
        );
      }
    }
  }

  return { node, edge };
}
