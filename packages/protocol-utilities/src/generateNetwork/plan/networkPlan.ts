import { filter as getFilter } from '@codaco/network-query';
import type { StructuralCodebook, Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  type EdgeCreation,
  isRewrittenAfter,
  type NodeCreation,
  scopeKeyFor,
  type StageEffects,
  writtenVariables,
} from '../analyse/stageEffects';
import {
  claimFixedValues,
  constraintsFor,
  generateAttributesForEntity,
  reserveFixedValues,
  rosterRowIsDrawable,
  unreserveFixedValues,
} from '../attributes';
import { completionCheckFor } from '../constraints/generateEntityAttributes';
import type { GenerationContext } from '../context';
import { ruleBrokenByFixedValues } from '../nodes';
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
  /** Latent final attributes: every variable a stage writes on this entity. */
  attributes: Record<string, VariableValue>;
  /**
   * What the creating interaction writes, before any later stage overwrites
   * it. Equal to the final value except where a later stage rewrites the
   * variable, where this is the intermediate the participant first sees.
   */
  fixedAtCreation: Record<string, VariableValue>;
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
  fixedAtCreation: Record<string, VariableValue>;
  missing: Set<string>;
  /** Structural (pedigree-tree) edges exist below any topology target. */
  mandatory: boolean;
};

export type NetworkPlan = {
  ego: {
    uid: string;
    attributes: Record<string, VariableValue>;
    fixedAtCreation: Record<string, VariableValue>;
    missing: Set<string>;
  };
  nodes: PlannedNode[];
  edges: PlannedEdge[];
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

/**
 * Separates the values a creating interaction writes into those that survive
 * to the end of the interview and those a later stage overwrites.
 *
 * A prompt's `additionalAttributes`, a roster row's data and a pedigree's
 * fixed edge values are all written by the interaction that creates the
 * entity. Where no later stage writes the same variable that value IS the
 * entity's final state, and the draw must work around it. Where a later stage
 * does write it — an AlterEdgeForm over a pedigree's relationship type, say —
 * the fixed value is only the intermediate the participant first sees, and
 * the final value is drawn freely so the last writer lands it. Feasibility
 * models exactly this when it declines to count a pin a later stage redraws.
 */
function splitFixedValues(
  fixed: Record<string, VariableValue>,
  effects: StageEffects,
  scope: string,
  stageIndex: number,
  alwaysFinal?: ReadonlySet<string>,
): {
  fixedFinal: Record<string, VariableValue>;
  fixedAtCreation: Record<string, VariableValue>;
} {
  const fixedFinal: Record<string, VariableValue> = {};
  for (const [variableId, value] of Object.entries(fixed)) {
    if (
      alwaysFinal?.has(variableId) === true ||
      !isRewrittenAfter(effects, scope, variableId, stageIndex)
    ) {
      fixedFinal[variableId] = value;
    }
  }
  return { fixedFinal, fixedAtCreation: fixed };
}

/**
 * The variables an entity's draw produces: those some stage writes, less
 * those already fixed to their final value.
 *
 * Narrowing to written variables keeps the plan to what an interview can
 * actually answer. A variable no stage writes is never asked, so drawing one
 * would claim a `unique` value the network never holds — and feasibility,
 * which exempts unwritten variables from its counting, would accept protocols
 * whose plan then ran out of values.
 */
const drawableVariables = (
  written: ReadonlySet<string>,
  fixedFinal: Record<string, VariableValue>,
): Set<string> =>
  new Set([...written].filter((variableId) => !(variableId in fixedFinal)));

/**
 * Whether a roster row can be built into a node, judged by the assignment the
 * node would actually be written with.
 *
 * Three halves, all of which feasibility already applies when it counts which
 * rows a roster can contribute: the registry (no `unique` value the network
 * has issued), the row's own plausibility (its values break no rule of their
 * own and none between them), and completability (what it fixes still leaves
 * the rest of the entity's draw a solution). Judging only the registry would
 * draw rows whose finished node contradicts the protocol's own validation,
 * and would disagree with the counting that decided the protocol was
 * generatable at all.
 *
 * Built once per node type: `completionCheckFor` resolves a whole type's
 * generation order and solves its tractable components, which is far too much
 * work to repeat for every row.
 */
function rowJudgeFor(
  ctx: GenerationContext,
  ref: { entity: 'node'; type: string },
): (fixed: Record<string, VariableValue>) => boolean {
  const constraints = constraintsFor(ctx, ref);
  const canComplete = completionCheckFor(constraints);
  return (fixed) =>
    rosterRowIsDrawable(ctx, ref, fixed) &&
    ruleBrokenByFixedValues(constraints, fixed) === undefined &&
    canComplete(fixed);
}

type EligiblePair = { a: string; b: string; firstStageIndex: number };

/**
 * The eligible endpoint domain for one edge type: the union over its creating
 * stages of the unordered subject-node pairs each stage can reach, respecting
 * own-nodes-only restrictions and (when enabled) stage filters. Each pair
 * remembers the earliest stage that could create it, which is where a planned
 * edge materialises.
 *
 * A stage can only link nodes that exist by the time it runs, so each
 * creation sees the population as of its own point in the interview. Pairing
 * across the whole final network instead would plan edges onto endpoints a
 * later stage has yet to introduce — an anachronistic session, and a domain
 * wider than the stage-time populations feasibility counts, so protocols it
 * accepted could exhaust their values mid-plan.
 */
function eligiblePairs(
  ctx: GenerationContext,
  creations: EdgeCreation[],
  nodes: PlannedNode[],
  egoUid: string,
): Map<string, EligiblePair> {
  const pairs = new Map<string, EligiblePair>();

  for (const creation of [...creations].toSorted(
    (a, b) => a.stageIndex - b.stageIndex,
  )) {
    const existing = nodes.filter(
      (node) => node.creationStageIndex <= creation.stageIndex,
    );
    const network = plannedNetwork(egoUid, existing);
    let candidates = existing.filter(
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
  const egoAttributes = generateAttributesForEntity(ctx, { entity: 'ego' }, 0, {
    only: writtenVariables(effects, 'ego'),
  });
  const egoMissing = applyMissingness(
    egoAttributes,
    new Set(),
    missing,
    source,
  );

  // --- Node populations ----------------------------------------------------
  const nodes: PlannedNode[] = [];
  const creationsByType = new Map<string, NodeCreation[]>();
  for (const summary of effects.stages) {
    for (const creation of summary.nodeCreations) {
      // A family pedigree builds its own people and links through the
      // specialist generator at materialisation, because a family has to hold
      // together as a structure rather than be sized as a population. The
      // plan leaves its entities alone; the node type's declared count still
      // bounds how large a family may grow.
      if (creation.source === 'pedigree') continue;
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

    // A roster pool caps its stage's share: an explicit empty pool means
    // "roster known to be empty" and admits nobody, while an absent pool
    // leaves the stage fabricating as usual. A name generator's panel is not
    // a ceiling — it can always add someone the panel does not list — so only
    // a roster interface's pool binds.
    const capacities = creations.map((creation) => {
      const capacity = { ...creation.capacity };
      if (
        creation.source === 'roster' &&
        creation.rosterStageId !== undefined
      ) {
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

    const ref = { entity: 'node' as const, type };
    const scope = scopeKeyFor('node', type);
    const written = writtenVariables(effects, 'node', type);

    // Roster stages draw real rows without replacement across the run. Built
    // before any draw so the values they carry can be held back from it.
    const rosterPools = creations.map((creation) => {
      if (creation.rosterStageId === undefined) return undefined;
      const pool = ctx.externalData?.[creation.rosterStageId];
      if (pool === undefined) return undefined;
      return shuffled(
        pool.filter(
          (row) => !ctx.usedRosterUids.has(row[entityPrimaryKeyProperty]),
        ),
        source.stream('roster', creation.rosterStageId),
      );
    });

    // Hold every value this type will be given from outside the registry, so
    // a free draw at an earlier stage leaves alone what a later prompt fixes
    // or a roster row carries. Each hold is released as it is consumed.
    for (const creation of creations) {
      for (const fixed of creation.promptFixedValues) {
        reserveFixedValues(ctx, ref, fixed);
      }
    }
    for (const pool of rosterPools) {
      for (const row of pool ?? []) {
        reserveFixedValues(ctx, ref, row[entityAttributesProperty]);
      }
    }
    // Only built where rows actually have to be judged: resolving a type's
    // generation order to answer that is expensive.
    const rowIsDrawable = rosterPools.some((pool) => pool !== undefined)
      ? rowJudgeFor(ctx, ref)
      : undefined;

    let typeIndex = 0;
    creations.forEach((creation, creationIndex) => {
      const share = assigned[creationIndex]!;
      if (share === 0) return;
      const promptCount = Math.max(1, creation.promptFixedValues.length);
      const rosterRows = rosterPools[creationIndex];

      for (let i = 0; i < share; i++) {
        const promptIndex = i % promptCount;
        const promptFixed = creation.promptFixedValues[promptIndex] ?? {};

        let rosterRow: NcNode | undefined;
        let fixed: Record<string, VariableValue> = { ...promptFixed };
        if (rosterRows !== undefined) {
          while (rosterRows.length > 0) {
            const candidate = rosterRows.shift()!;
            const rowValues = candidate[entityAttributesProperty];
            // Consumed either way: a row passed over is never drawn, so its
            // hold must not keep constraining the draws that follow.
            unreserveFixedValues(ctx, ref, rowValues);
            // Each stage's pool is taken before any of them draws, so a row
            // two stages share sits in both. One person is never added twice.
            if (ctx.usedRosterUids.has(candidate[entityPrimaryKeyProperty])) {
              continue;
            }
            const merged = creation.rosterValuesWin
              ? { ...promptFixed, ...rowValues }
              : { ...rowValues, ...promptFixed };
            if (rowIsDrawable?.(merged) ?? true) {
              rosterRow = candidate;
              fixed = merged;
              break;
            }
          }
          // A roster stage cannot fabricate. Its share ends when the pool has
          // nothing left to give — including a pool an earlier stage sharing
          // the same roster already emptied, which leaves nothing to loop over
          // here at all.
          if (creation.source === 'roster' && rosterRow === undefined) break;
        }

        const uid = rosterRow
          ? rosterRow[entityPrimaryKeyProperty]
          : deterministicUuid(source.stream('id', 'node', type));
        if (rosterRow) ctx.usedRosterUids.add(uid);

        // A roster row is external data bound to this person: a later form
        // pass displays what the roster already knows rather than asking the
        // participant to invent it again, and a node whose name no longer
        // matches the row it was drawn from is incoherent. So row-settled
        // values stay final even where a later stage writes the variable —
        // unlike a prompt's assertion, which such a stage genuinely re-asks.
        const rowSettled = new Set<string>();
        if (rosterRow) {
          for (const key of Object.keys(rosterRow[entityAttributesProperty])) {
            if (creation.rosterValuesWin || !(key in promptFixed)) {
              rowSettled.add(key);
            }
          }
        }

        const { fixedFinal, fixedAtCreation } = splitFixedValues(
          fixed,
          effects,
          scope,
          creation.stageIndex,
          rowSettled.size > 0 ? rowSettled : undefined,
        );
        const generated = generateAttributesForEntity(ctx, ref, typeIndex, {
          existing: fixedFinal,
          only: drawableVariables(written, fixedFinal),
        });
        claimFixedValues(ctx, ref, fixedFinal);
        unreserveFixedValues(ctx, ref, promptFixed);
        const attributes = { ...generated, ...fixedFinal };
        const missingSet = applyMissingness(
          attributes,
          new Set(Object.keys(fixedFinal)),
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
          fixedAtCreation,
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
    const scope = scopeKeyFor('edge', type);
    const written = writtenVariables(effects, 'edge', type);
    const edgeStream = source.stream('edges', type);
    let edgeIndex = 0;

    const buildEdge = (
      from: string,
      to: string,
      creationStageIndex: number,
      fixed: Record<string, VariableValue>,
      mandatory: boolean,
    ): PlannedEdge => {
      const { fixedFinal, fixedAtCreation } = splitFixedValues(
        fixed,
        effects,
        scope,
        creationStageIndex,
      );
      const generated = generateAttributesForEntity(ctx, ref, edgeIndex, {
        existing: fixedFinal,
        only: drawableVariables(written, fixedFinal),
      });
      claimFixedValues(ctx, ref, fixedFinal);
      const attributes = { ...generated, ...fixedFinal };
      const missingSet = applyMissingness(
        attributes,
        new Set(Object.keys(fixedFinal)),
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
        fixedAtCreation,
        missing: missingSet,
        mandatory,
      };
    };

    // A pedigree's own parent/partner links come from the specialist
    // generator alongside its people, so nothing structural is planned here.
    const mandatoryKeys = new Set<string>();

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
    ego: {
      uid: egoUid,
      attributes: egoAttributes,
      // Nothing creates ego, so nothing is fixed on it at creation.
      fixedAtCreation: {},
      missing: egoMissing,
    },
    nodes,
    edges,
  };
}
