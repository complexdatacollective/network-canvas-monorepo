import { filter as getFilter } from '@codaco/network-query';
import type { StructuralCodebook, Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type {
  EdgeCreation,
  NodeCreation,
  StageEffects,
} from '../analyse/stageEffects';
import {
  claimFixedValues,
  generateAttributesForEntity,
  rosterRowIsDrawable,
} from '../attributes';
import type { GenerationContext } from '../context';
import { sampleContinuous, sampleCount } from './distributions';
import { deterministicUuid, type RandomSource } from './random';
import {
  resolveEdgeTopology,
  resolveNodeCount,
  resolveVariableSynthetic,
} from './resolveSynthetic';

/**
 * The plan phase: the target network as it stands when the synthetic
 * interview ends. Populations come from codebook counts, values from resolved
 * distributions (through the constraint machinery), edges from topology
 * targets over the eligible pair domain, and missingness from declared
 * probabilities. The schedule/materialize phases replay this plan through the
 * stage sequence; nothing here consults stage order beyond capacity and
 * domain facts the analysis extracted.
 */

export type PlannedNode = {
  uid: string;
  type: string;
  creationStageIndex: number;
  /** Prompt index under the creating stage (promptIDs, additionalAttributes). */
  promptIndex: number;
  source: NodeCreation['source'];
  /** The roster row this node was drawn from, when source is 'roster'. */
  rosterRow?: NcNode;
  /** Latent final attributes across the whole codebook type. */
  attributes: Record<string, VariableValue>;
  /** Variables whose final state is "unanswered" (stored as null). */
  missing: Set<string>;
};

export type PlannedEdge = {
  uid: string;
  type: string;
  from: string;
  to: string;
  creationStageIndex: number;
  attributes: Record<string, VariableValue>;
  missing: Set<string>;
  /** Structural (pedigree-tree) edges exist below any topology target. */
  mandatory: boolean;
};

export type NetworkPlan = {
  ego: {
    uid: string;
    attributes: Record<string, VariableValue>;
    missing: Set<string>;
  };
  nodes: PlannedNode[];
  edges: PlannedEdge[];
  /** Pedigree child uid → parent uid, for structure-aware materialisation. */
  pedigreeParents: Map<string, string>;
};

type VariablesRecord = Record<string, Variable>;

const variablesOf = (
  definition: { variables?: VariablesRecord } | undefined,
): VariablesRecord => (definition?.variables ?? {}) as VariablesRecord;

/** Per-variable missing probabilities, resolved once per run. */
function missingProbabilities(
  codebook: StructuralCodebook,
): Map<string, number> {
  const probabilities = new Map<string, number>();
  const collect = (variables: VariablesRecord) => {
    for (const [id, variable] of Object.entries(variables)) {
      const resolved = resolveVariableSynthetic(variable);
      if (resolved.kind === 'stageOwned') continue;
      if (resolved.missingProbability > 0) {
        probabilities.set(id, resolved.missingProbability);
      }
    }
  };
  for (const definition of Object.values(codebook.node ?? {})) {
    collect(variablesOf(definition));
  }
  for (const definition of Object.values(codebook.edge ?? {})) {
    collect(variablesOf(definition));
  }
  collect(variablesOf(codebook.ego));
  return probabilities;
}

/**
 * Nulls non-fixed attributes according to their missing probability, each
 * decision drawn from the variable's own missingness stream.
 */
function applyMissingness(
  attributes: Record<string, VariableValue>,
  fixedKeys: ReadonlySet<string>,
  probabilities: Map<string, number>,
  source: RandomSource,
): Set<string> {
  const missing = new Set<string>();
  for (const [variableId, probability] of probabilities) {
    if (!(variableId in attributes)) continue;
    if (fixedKeys.has(variableId)) continue;
    if (source.stream('missing', variableId).bool(probability)) {
      attributes[variableId] = null;
      missing.add(variableId);
    }
  }
  return missing;
}

/**
 * Apportions a type's drawn population across its creating stages: every
 * stage's declared minimum is honoured first (stage requirements outrank the
 * drawn total), then the remainder spreads round-robin across stages with
 * headroom. Capacity that runs out truncates the plan — stage caps constrain
 * the population, never the other way around.
 */
export function apportionCount(
  total: number,
  capacities: { min: number; max: number | null }[],
): number[] {
  const assigned = capacities.map((capacity) => capacity.min);
  let remaining = Math.max(0, total - assigned.reduce((a, b) => a + b, 0));
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let i = 0; i < capacities.length && remaining > 0; i++) {
      const cap = capacities[i]!.max;
      if (cap !== null && assigned[i]! >= cap) continue;
      assigned[i]! += 1;
      remaining -= 1;
      progressed = true;
    }
  }
  return assigned;
}

function plannedNodeToNc(node: PlannedNode): NcNode {
  return {
    [entityPrimaryKeyProperty]: node.uid,
    type: node.type,
    [entityAttributesProperty]: node.attributes,
  };
}

function plannedNetwork(egoUid: string, nodes: PlannedNode[]): NcNetwork {
  return {
    ego: {
      [entityPrimaryKeyProperty]: egoUid,
      [entityAttributesProperty]: {},
    },
    nodes: nodes.map(plannedNodeToNc),
    edges: [],
  };
}

/** Unordered pair key; self-pairs are never eligible. */
const pairKey = (a: string, b: string): string =>
  a < b ? `${a} ${b}` : `${b} ${a}`;

type EligiblePair = { a: string; b: string; firstStageIndex: number };

/**
 * The eligible endpoint domain for one edge type: the union over its creating
 * stages of the unordered subject-node pairs each stage can reach, respecting
 * own-nodes-only restrictions and (when enabled) stage filters. Each pair
 * remembers the earliest stage that could create it, which is where a planned
 * edge materialises.
 */
function eligiblePairs(
  ctx: GenerationContext,
  creations: EdgeCreation[],
  nodes: PlannedNode[],
  egoUid: string,
): Map<string, EligiblePair> {
  const pairs = new Map<string, EligiblePair>();
  const network = plannedNetwork(egoUid, nodes);

  for (const creation of [...creations].toSorted(
    (a, b) => a.stageIndex - b.stageIndex,
  )) {
    let candidates = nodes.filter(
      (node) => node.type === creation.subjectNodeType,
    );
    if (creation.ownNodesOnly) {
      candidates = candidates.filter(
        (node) => node.creationStageIndex === creation.stageIndex,
      );
    }
    if (creation.filter && ctx.respectSkipLogicAndFiltering) {
      const filtered = getFilter(creation.filter)(network);
      const kept = new Set(
        filtered.nodes.map((node) => node[entityPrimaryKeyProperty]),
      );
      candidates = candidates.filter((node) => kept.has(node.uid));
    }
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i]!.uid;
        const b = candidates[j]!.uid;
        const key = pairKey(a, b);
        if (!pairs.has(key)) {
          pairs.set(key, { a, b, firstStageIndex: creation.stageIndex });
        }
      }
    }
  }
  return pairs;
}

/** Deterministic in-place Fisher–Yates over a copy, drawn from `stream`. */
function shuffled<T>(
  values: readonly T[],
  stream: { int(min: number, max: number): number },
): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = stream.int(0, i);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function planNetwork(
  ctx: GenerationContext,
  effects: StageEffects,
): NetworkPlan {
  const source = ctx.valueGen.randomSource;
  const missing = missingProbabilities(ctx.codebook);

  // --- Ego -----------------------------------------------------------------
  const egoUid = deterministicUuid(source.stream('id', 'ego'));
  const egoAttributes = generateAttributesForEntity(ctx, { entity: 'ego' }, 0);
  const egoMissing = applyMissingness(
    egoAttributes,
    new Set(),
    missing,
    source,
  );

  // --- Node populations ----------------------------------------------------
  const nodes: PlannedNode[] = [];
  const pedigreeParents = new Map<string, string>();
  const creationsByType = new Map<string, NodeCreation[]>();
  for (const summary of effects.stages) {
    for (const creation of summary.nodeCreations) {
      const list = creationsByType.get(creation.nodeType) ?? [];
      list.push(creation);
      creationsByType.set(creation.nodeType, list);
    }
  }

  for (const [type, definition] of Object.entries(ctx.codebook.node ?? {})) {
    const creations = creationsByType.get(type) ?? [];
    const creatable = effects.creatableNodeTypes.has(type);
    const total = sampleCount(
      resolveNodeCount(definition, { creatable }),
      source.stream('count', type),
    );
    if (creations.length === 0) continue;

    // Roster pools cap their stage's share: an explicit empty pool means
    // "roster known to be empty" and admits nobody, while an absent pool
    // leaves the stage fabricating as usual.
    const capacities = creations.map((creation) => {
      const capacity = { ...creation.capacity };
      if (creation.rosterStageId !== undefined) {
        const pool = ctx.externalData?.[creation.rosterStageId];
        if (pool !== undefined) {
          capacity.max =
            capacity.max === null
              ? pool.length
              : Math.min(capacity.max, pool.length);
          capacity.min = Math.min(capacity.min, capacity.max);
        }
      }
      return capacity;
    });
    const assigned = apportionCount(total, capacities);

    let typeIndex = 0;
    creations.forEach((creation, creationIndex) => {
      const share = assigned[creationIndex]!;
      if (share === 0) return;
      const promptCount = Math.max(1, creation.promptFixedValues.length);
      const ref = { entity: 'node' as const, type };

      // Roster stages draw real rows without replacement across the run.
      let rosterRows: NcNode[] = [];
      if (creation.rosterStageId !== undefined) {
        const pool = ctx.externalData?.[creation.rosterStageId];
        if (pool !== undefined) {
          rosterRows = shuffled(
            pool.filter(
              (row) => !ctx.usedRosterUids.has(row[entityPrimaryKeyProperty]),
            ),
            source.stream('roster', creation.rosterStageId),
          );
        }
      }

      for (let i = 0; i < share; i++) {
        const promptIndex = i % promptCount;
        const promptFixed = creation.promptFixedValues[promptIndex] ?? {};

        let rosterRow: NcNode | undefined;
        let fixed: Record<string, VariableValue> = { ...promptFixed };
        if (rosterRows.length > 0) {
          // The prompt's value wins a collision with the row's own, exactly
          // as the interview writes it.
          while (rosterRows.length > 0) {
            const candidate = rosterRows.shift()!;
            const merged = {
              ...candidate[entityAttributesProperty],
              ...promptFixed,
            };
            if (rosterRowIsDrawable(ctx, ref, merged)) {
              rosterRow = candidate;
              fixed = merged;
              break;
            }
          }
          if (creation.source === 'roster' && rosterRow === undefined) {
            // Pool exhausted (or nothing drawable): a roster stage cannot
            // fabricate, so its share ends here.
            break;
          }
        }

        if (creation.source === 'pedigree') {
          // The first family member is the participant; the rest are not.
          const pedigree = effects.stages[creation.stageIndex]?.pedigree;
          if (pedigree) fixed[pedigree.egoVariable] = i === 0;
        }

        const uid = rosterRow
          ? rosterRow[entityPrimaryKeyProperty]
          : deterministicUuid(source.stream('id', 'node', type));
        if (rosterRow) ctx.usedRosterUids.add(uid);

        const generated = generateAttributesForEntity(ctx, ref, typeIndex, {
          existing: fixed,
        });
        claimFixedValues(ctx, ref, fixed);
        const attributes = { ...generated, ...fixed };
        const fixedKeys = new Set(Object.keys(fixed));
        const missingSet = applyMissingness(
          attributes,
          fixedKeys,
          missing,
          source,
        );

        nodes.push({
          uid,
          type,
          creationStageIndex: creation.stageIndex,
          promptIndex,
          source: creation.source,
          ...(rosterRow ? { rosterRow } : {}),
          attributes,
          missing: missingSet,
        });
        typeIndex += 1;
      }
    });
  }

  // --- Edges ---------------------------------------------------------------
  const edges: PlannedEdge[] = [];
  for (const [type, definition] of Object.entries(ctx.codebook.edge ?? {})) {
    const creations = effects.edgeCreationsByType.get(type) ?? [];
    if (creations.length === 0) continue;
    const ref = { entity: 'edge' as const, type };
    const edgeStream = source.stream('edges', type);
    let edgeIndex = 0;

    const buildEdge = (
      from: string,
      to: string,
      creationStageIndex: number,
      fixed: Record<string, VariableValue>,
      mandatory: boolean,
    ): PlannedEdge => {
      const generated = generateAttributesForEntity(ctx, ref, edgeIndex, {
        existing: fixed,
      });
      claimFixedValues(ctx, ref, fixed);
      const attributes = { ...generated, ...fixed };
      const missingSet = applyMissingness(
        attributes,
        new Set(Object.keys(fixed)),
        missing,
        source,
      );
      edgeIndex += 1;
      return {
        uid: deterministicUuid(source.stream('id', 'edge', type)),
        type,
        from,
        to,
        creationStageIndex,
        attributes,
        missing: missingSet,
        mandatory,
      };
    };

    // Structural pedigree edges first: each family member after the first
    // gets a parent among the members created before it.
    const mandatoryKeys = new Set<string>();
    for (const creation of creations) {
      if (creation.structured !== 'pedigree') continue;
      const pedigree = effects.stages[creation.stageIndex]?.pedigree;
      if (!pedigree) continue;
      const familyNodes = nodes.filter(
        (node) =>
          node.creationStageIndex === creation.stageIndex &&
          node.type === creation.subjectNodeType,
      );
      const treeStream = source.stream('pedigree', creation.stageIndex);
      for (let i = 1; i < familyNodes.length; i++) {
        const child = familyNodes[i]!;
        const parent = familyNodes[treeStream.int(0, i - 1)]!;
        pedigreeParents.set(child.uid, parent.uid);
        mandatoryKeys.add(pairKey(parent.uid, child.uid));
        edges.push(
          buildEdge(
            parent.uid,
            child.uid,
            creation.stageIndex,
            pedigree.edgeFixedValues as Record<string, VariableValue>,
            true,
          ),
        );
      }
    }

    // Topology target over the eligible pair domain.
    const topologyCreations = creations.filter(
      (creation) => creation.structured === null,
    );
    if (topologyCreations.length === 0) continue;
    const pairs = eligiblePairs(ctx, topologyCreations, nodes, egoUid);
    if (pairs.size === 0) continue;

    const topology = resolveEdgeTopology(definition);
    const metricValue = sampleContinuous(
      topology.distribution,
      topology.metric === 'density' ? { min: 0, max: 1 } : { min: 0 },
      source.stream('topology', type),
    );
    const eligibleNodeCount = new Set(
      [...pairs.values()].flatMap((pair) => [pair.a, pair.b]),
    ).size;
    const target = Math.min(
      pairs.size,
      Math.round(
        topology.metric === 'density'
          ? metricValue * pairs.size
          : (metricValue * eligibleNodeCount) / 2,
      ),
    );

    const selectable = [...pairs.entries()].filter(
      ([key]) => !mandatoryKeys.has(key),
    );
    const extra = Math.max(0, target - mandatoryKeys.size);
    for (const [, pair] of shuffled(selectable, edgeStream).slice(0, extra)) {
      edges.push(buildEdge(pair.a, pair.b, pair.firstStageIndex, {}, false));
    }
  }

  return {
    ego: { uid: egoUid, attributes: egoAttributes, missing: egoMissing },
    nodes,
    edges,
    pedigreeParents,
  };
}
