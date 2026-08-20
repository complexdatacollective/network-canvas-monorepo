import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNetwork,
  type NcNode,
  type StageMetadata,
  type StageMetadataEntry,
  type VariableValue,
} from '@codaco/shared-consts';

import { invariant } from '../utils/invariant';
import type { AttributePatch, SyntheticSessionAction } from './actions';
import type { SessionClock } from './clock';

/**
 * The session engine: the ONE place a synthetic interview's state changes.
 * Simulators call these primitives — the runtime's action vocabulary — and the
 * engine folds them with the reducer's exact semantics
 * (`@codaco/interview` `store/modules/session.ts`, cited per rule below).
 * The replay-parity suite dispatches the captured trace through the real
 * store and requires the folded session to match, so any drift between this
 * fold and the reducer is a test failure, not a review claim (spec rule 7).
 */

/** The slice of a codebook the engine validates attribute keys against. */
export type EngineCodebook = {
  node?: Record<string, { variables?: Record<string, unknown> }>;
  edge?: Record<string, { variables?: Record<string, unknown> }>;
  ego?: { variables?: Record<string, unknown> };
};

type PromptRef = { id: string };
type StageRef = { id: string; prompts?: readonly PromptRef[] };

export type SessionDraft = {
  network: NcNetwork;
  stageMetadata: StageMetadata;
  promptIndex: number;
  lastUpdated: string;
};

const isCensusTuple = (entry: unknown): entry is [number, string, string, boolean] =>
  Array.isArray(entry) && entry.length === 4;

/**
 * The runtime strips null/undefined from `set` before applying
 * (`applyEntityAttributePatch`), and refuses a key named in both halves
 * (`validateAttributePatch`). Reproduced verbatim.
 */
const normalisePatch = (patch: AttributePatch): AttributePatch => {
  const set: Record<string, VariableValue> = {};
  for (const [key, value] of Object.entries(patch.set)) {
    if (value !== null && value !== undefined) set[key] = value;
    invariant(
      !patch.unset.includes(key),
      `attribute "${key}" appears in both set and unset`,
    );
  }
  return { set, unset: patch.unset };
};

export class SessionEngine {
  private readonly codebook: EngineCodebook;
  private readonly stages: readonly Stage[];
  private readonly clock: SessionClock;
  private readonly trace: SyntheticSessionAction[] | null;
  /**
   * Prompt `additionalAttributes` looked up by prompt id, for
   * `removeNodeFromPrompt`'s reconciliation (the runtime re-resolves a
   * removed prompt's variables from the node's REMAINING prompts, last
   * declaring prompt winning — session.ts:507-559).
   */
  private readonly promptAttributesById: ReadonlyMap<
    string,
    Readonly<Record<string, boolean>>
  >;

  readonly draft: SessionDraft;

  constructor({
    codebook,
    stages,
    clock,
    egoUid,
    captureTrace,
  }: {
    codebook: EngineCodebook;
    stages: readonly Stage[];
    clock: SessionClock;
    /** Engine-drawn, so the whole session is seed-reproducible. */
    egoUid: string;
    captureTrace: boolean;
  }) {
    this.codebook = codebook;
    this.stages = stages;
    this.clock = clock;
    this.trace = captureTrace ? [] : null;
    this.draft = {
      network: {
        ego: { [entityPrimaryKeyProperty]: egoUid, [entityAttributesProperty]: {} },
        nodes: [],
        edges: [],
      },
      stageMetadata: {},
      promptIndex: 0,
      lastUpdated: clock.startTime,
    };

    const promptAttributes = new Map<string, Record<string, boolean>>();
    for (const stage of stages) {
      if (!('prompts' in stage) || !stage.prompts) continue;
      for (const prompt of stage.prompts) {
        if ('additionalAttributes' in prompt && prompt.additionalAttributes) {
          promptAttributes.set(
            prompt.id,
            Object.fromEntries(
              prompt.additionalAttributes.map(({ variable, value }) => [
                String(variable),
                value,
              ]),
            ),
          );
        }
      }
    }
    this.promptAttributesById = promptAttributes;
  }

  /** The captured trace, when the run asked for one. */
  capturedTrace(): readonly SyntheticSessionAction[] | null {
    return this.trace;
  }

  // -------------------------------------------------------------------------
  // Internals mirroring the runtime's selectors and guards
  // -------------------------------------------------------------------------

  private record(action: SyntheticSessionAction): void {
    this.trace?.push(action);
  }

  private touch(): void {
    // Every network mutation bumps lastUpdated (withLastUpdated,
    // session.ts:44-49); updatePrompt deliberately does not.
    this.draft.lastUpdated = this.clock.now();
  }

  private sessionMeta(currentStep: number): {
    stageId: string;
    promptId: string | null;
  } {
    const stage = this.stages[currentStep] as StageRef | undefined;
    invariant(stage, `no stage at step ${currentStep}`);
    return {
      stageId: stage.id,
      promptId: stage.prompts?.[this.draft.promptIndex]?.id ?? null,
    };
  }

  private variablesFor(entity: 'node' | 'edge', type: string): Record<string, unknown> {
    return this.codebook[entity]?.[type]?.variables ?? {};
  }

  private assertKnownKeys(
    keys: readonly string[],
    variables: Record<string, unknown>,
    what: string,
  ): void {
    const unknown = keys.filter((key) => !(key in variables));
    invariant(
      unknown.length === 0,
      `Invalid ${what}: [${unknown.join(', ')}] do not exist in protocol codebook`,
    );
  }

  private node(nodeId: string): NcNode {
    const node = this.draft.network.nodes.find(
      (candidate) => candidate[entityPrimaryKeyProperty] === nodeId,
    );
    invariant(node, `node "${nodeId}" not found`);
    return node;
  }

  private edge(edgeId: string): NcEdge {
    const edge = this.draft.network.edges.find(
      (candidate) => candidate[entityPrimaryKeyProperty] === edgeId,
    );
    invariant(edge, `edge "${edgeId}" not found`);
    return edge;
  }

  /** The runtime's undirected same-type match (session.ts `edgeExists`). */
  private existingEdgeId(from: string, to: string, edgeType: string): string | null {
    const match = this.draft.network.edges.find(
      (edge) =>
        edge.type === edgeType &&
        ((edge.from === from && edge.to === to) ||
          (edge.from === to && edge.to === from)),
    );
    return match ? match[entityPrimaryKeyProperty] : null;
  }

  private applyPatch(
    attributes: Record<string, VariableValue>,
    patch: AttributePatch,
  ): void {
    const { set, unset } = normalisePatch(patch);
    for (const key of unset) delete attributes[key];
    Object.assign(attributes, set);
  }

  // -------------------------------------------------------------------------
  // The primitives
  // -------------------------------------------------------------------------

  addNode(payload: {
    nodeType: string;
    uid: string;
    attributeData: Readonly<Record<string, VariableValue>>;
    allowUnknownAttributes?: boolean;
    currentStep: number;
  }): NcNode {
    const { nodeType, uid, attributeData, allowUnknownAttributes, currentStep } =
      payload;
    const attributes: Record<string, VariableValue> = {};
    for (const [key, value] of Object.entries(attributeData)) {
      if (value !== null && value !== undefined) attributes[key] = value;
    }
    if (!allowUnknownAttributes) {
      this.assertKnownKeys(
        Object.keys(attributes),
        this.variablesFor('node', nodeType),
        `node attributes for type "${nodeType}"`,
      );
    }
    invariant(
      !this.draft.network.nodes.some(
        (node) => node[entityPrimaryKeyProperty] === uid,
      ),
      `node with id "${uid}" already exists in network`,
    );
    const { stageId, promptId } = this.sessionMeta(currentStep);
    const node: NcNode = {
      [entityPrimaryKeyProperty]: uid,
      type: nodeType,
      [entityAttributesProperty]: attributes,
      promptIDs: promptId ? [promptId] : [],
      stageId,
    };
    this.draft.network.nodes.push(node);
    this.record({ type: 'addNode', payload });
    this.touch();
    return node;
  }

  addNodeToPrompt(payload: {
    nodeId: string;
    promptAttributes: Readonly<Record<string, boolean>>;
    currentStep: number;
  }): void {
    const node = this.node(payload.nodeId);
    const { promptId } = this.sessionMeta(payload.currentStep);
    invariant(promptId, 'addNodeToPrompt on a stage with no prompts');
    node.promptIDs = [...(node.promptIDs ?? []), promptId];
    // The prompt's additionalAttributes OVERWRITE existing values — "the
    // network is the single source of truth" (session.ts:663-668).
    this.applyPatch(node[entityAttributesProperty], {
      set: payload.promptAttributes,
      unset: [],
    });
    this.record({ type: 'addNodeToPrompt', payload });
    this.touch();
  }

  removeNodeFromPrompt(payload: { nodeId: string; currentStep: number }): void {
    const node = this.node(payload.nodeId);
    const { promptId } = this.sessionMeta(payload.currentStep);
    invariant(promptId, 'removeNodeFromPrompt on a stage with no prompts');
    const remaining = (node.promptIDs ?? []).filter((id) => id !== promptId);
    const removedAttributes = this.promptAttributesById.get(promptId) ?? {};

    // Re-resolve each removed-prompt variable from the remaining prompts
    // (last remaining prompt that declares it wins), unsetting the ones no
    // remaining prompt declares (session.ts:530-551).
    const set: Record<string, VariableValue> = {};
    const unset: string[] = [];
    for (const variable of Object.keys(removedAttributes)) {
      let resolved: boolean | undefined;
      for (const remainingPrompt of remaining) {
        const attributes = this.promptAttributesById.get(remainingPrompt);
        if (attributes && variable in attributes) resolved = attributes[variable];
      }
      if (resolved === undefined) unset.push(variable);
      else set[variable] = resolved;
    }

    node.promptIDs = remaining;
    this.applyPatch(node[entityAttributesProperty], { set, unset });
    this.record({ type: 'removeNodeFromPrompt', payload });
    this.touch();
  }

  addEdge(payload: {
    edgeType: string;
    uid: string;
    from: string;
    to: string;
    attributeData?: Readonly<Record<string, VariableValue>>;
    currentStep: number;
  }): NcEdge {
    const attributes: Record<string, VariableValue> = {};
    for (const [key, value] of Object.entries(payload.attributeData ?? {})) {
      if (value !== null && value !== undefined) attributes[key] = value;
    }
    this.assertKnownKeys(
      Object.keys(attributes),
      this.variablesFor('edge', payload.edgeType),
      `edge attributes for type "${payload.edgeType}"`,
    );
    invariant(
      !this.draft.network.edges.some(
        (edge) => edge[entityPrimaryKeyProperty] === payload.uid,
      ),
      `edge with id "${payload.uid}" already exists in network`,
    );
    const edge: NcEdge = {
      [entityPrimaryKeyProperty]: payload.uid,
      type: payload.edgeType,
      from: payload.from,
      to: payload.to,
      [entityAttributesProperty]: attributes,
    };
    this.draft.network.edges.push(edge);
    this.record({ type: 'addEdge', payload });
    this.touch();
    return edge;
  }

  /**
   * The Sociogram/OneToManyDyadCensus semantic: an existing same-type edge in
   * EITHER direction is deleted, otherwise one is created with no attributes.
   * Returns the surviving edge id, or null when the toggle deleted.
   */
  toggleEdge(payload: {
    edgeType: string;
    uid: string;
    from: string;
    to: string;
    currentStep: number;
  }): string | null {
    const existing = this.existingEdgeId(payload.from, payload.to, payload.edgeType);
    if (existing) {
      this.deleteEdge({ edgeId: existing });
      return null;
    }
    this.addEdge({ ...payload, attributeData: {} });
    return payload.uid;
  }

  updateNode(payload: {
    nodeId: string;
    attributePatch: AttributePatch;
    currentStep: number;
  }): void {
    const node = this.node(payload.nodeId);
    const patch = payload.attributePatch;
    this.assertKnownKeys(
      [...Object.keys(patch.set), ...patch.unset],
      this.variablesFor('node', node.type),
      `node attributes for type "${node.type}"`,
    );
    this.applyPatch(node[entityAttributesProperty], patch);
    this.record({ type: 'updateNode', payload });
    this.touch();
  }

  updateEdge(payload: { edgeId: string; attributePatch: AttributePatch }): void {
    const edge = this.edge(payload.edgeId);
    this.assertKnownKeys(
      [...Object.keys(payload.attributePatch.set), ...payload.attributePatch.unset],
      this.variablesFor('edge', edge.type),
      `edge attributes for type "${edge.type}"`,
    );
    this.applyPatch(edge[entityAttributesProperty], payload.attributePatch);
    this.record({ type: 'updateEdge', payload });
    this.touch();
  }

  updateEgo(payload: { attributePatch: AttributePatch }): void {
    const egoVariables = this.codebook.ego?.variables;
    invariant(egoVariables, 'ego variables not defined in protocol codebook');
    this.assertKnownKeys(
      [...Object.keys(payload.attributePatch.set), ...payload.attributePatch.unset],
      egoVariables,
      'ego attributes',
    );
    this.applyPatch(
      this.draft.network.ego[entityAttributesProperty],
      payload.attributePatch,
    );
    this.record({ type: 'updateEgo', payload });
    this.touch();
  }

  toggleNodeAttributes(payload: {
    nodeId: string;
    attributePatch: AttributePatch;
  }): void {
    const node = this.node(payload.nodeId);
    this.assertKnownKeys(
      [...Object.keys(payload.attributePatch.set), ...payload.attributePatch.unset],
      this.variablesFor('node', node.type),
      `node attributes for type "${node.type}"`,
    );
    this.applyPatch(node[entityAttributesProperty], payload.attributePatch);
    this.record({ type: 'toggleNodeAttributes', payload });
    this.touch();
  }

  /**
   * Removes the node, every incident edge, and any census tuples naming it —
   * array-shaped metadata entries only, object entries untouched
   * (session.ts:88-110, 717-737).
   */
  deleteNode(payload: { nodeId: string }): void {
    this.node(payload.nodeId);
    this.draft.network.nodes = this.draft.network.nodes.filter(
      (node) => node[entityPrimaryKeyProperty] !== payload.nodeId,
    );
    this.draft.network.edges = this.draft.network.edges.filter(
      (edge) => edge.from !== payload.nodeId && edge.to !== payload.nodeId,
    );
    for (const [step, entry] of Object.entries(this.draft.stageMetadata)) {
      if (!Array.isArray(entry)) continue;
      this.draft.stageMetadata[step] = entry.filter(
        (item) =>
          !isCensusTuple(item) ||
          (item[1] !== payload.nodeId && item[2] !== payload.nodeId),
      ) as StageMetadataEntry & unknown[];
    }
    this.record({ type: 'deleteNode', payload });
    this.touch();
  }

  deleteEdge(payload: { edgeId: string }): void {
    this.edge(payload.edgeId);
    this.draft.network.edges = this.draft.network.edges.filter(
      (edge) => edge[entityPrimaryKeyProperty] !== payload.edgeId,
    );
    this.record({ type: 'deleteEdge', payload });
    this.touch();
  }

  /** Prompt movement alone never bumps lastUpdated (session.ts:768-773). */
  updatePrompt(payload: { promptIndex: number }): void {
    this.draft.promptIndex = payload.promptIndex;
    this.record({ type: 'updatePrompt', payload });
  }

  transitionStage(): void {
    this.draft.promptIndex = 0;
    this.record({ type: 'transitionStage', payload: {} });
    this.touch();
  }

  /** Keyed by the stringified stage INDEX, matching every runtime writer. */
  updateStageMetadata(payload: {
    currentStep: number;
    metadata: StageMetadataEntry;
  }): void {
    this.draft.stageMetadata[String(payload.currentStep)] = payload.metadata;
    this.record({ type: 'updateStageMetadata', payload });
    this.touch();
  }
}
