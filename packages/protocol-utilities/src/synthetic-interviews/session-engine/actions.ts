import type { StageMetadataEntry, VariableValue } from '@codaco/shared-consts';

/**
 * The write vocabulary of a synthetic interview, payload-for-payload the
 * interview runtime's own session actions (`@codaco/interview`
 * `store/modules/session.ts`). Simulators may express a participant's work
 * ONLY in these terms — if the real interface cannot dispatch it, a simulator
 * cannot either (spec rule 3) — and the replay-parity suite dispatches a
 * captured trace of them through the real Redux store to prove the fold
 * matches the reducer.
 *
 * Defined here rather than imported from `@codaco/interview` because that
 * import is a proven Turbo `topo` cycle (spec decision 13). The parity suite,
 * which lives in the interview package, is what holds the two vocabularies
 * together.
 *
 * Two deliberate divergences from the runtime thunks, both in the direction
 * of MORE determinism, never different semantics:
 *
 * - Every entity id is engine-supplied (the runtime mints uuids when a caller
 *   passes none; the engine always passes one, drawn from the session's id
 *   stream, and the runtime's `addEdge`/`toggleEdge` gained the same optional
 *   injection channel `addNode` always had so the trace can replay).
 * - `useEncryption` never appears: synthetic sessions are plaintext by
 *   decision 17.
 */

/**
 * The runtime's `AttributePatch`, structurally identical to
 * `entityAttributePatch.ts`: `set` writes values, `unset` deletes keys, and
 * the two never overlap. An unanswered variable is ABSENT from attributes —
 * never null — so clearing means `unset`, not `set: { x: undefined }`.
 */
export type AttributePatch = Readonly<{
  set: Readonly<Record<string, VariableValue>>;
  unset: readonly string[];
}>;

export type AddNodeAction = {
  type: 'addNode';
  payload: {
    nodeType: string;
    /** Engine-drawn primary key (or a roster row's deterministic uid). */
    uid: string;
    attributeData: Readonly<Record<string, VariableValue>>;
    /**
     * Roster and pedigree sources carry attribute keys the codebook does not
     * declare; the runtime admits them through the same flag.
     */
    allowUnknownAttributes?: boolean;
    currentStep: number;
  };
};

export type AddNodeToPromptAction = {
  type: 'addNodeToPrompt';
  payload: {
    nodeId: string;
    /** The prompt's `additionalAttributes`, applied as an overwrite. */
    promptAttributes: Readonly<Record<string, boolean>>;
    currentStep: number;
  };
};

export type RemoveNodeFromPromptAction = {
  type: 'removeNodeFromPrompt';
  payload: { nodeId: string; currentStep: number };
};

export type AddEdgeAction = {
  type: 'addEdge';
  payload: {
    edgeType: string;
    /** Engine-drawn primary key, replayed via the runtime's id channel. */
    uid: string;
    from: string;
    to: string;
    attributeData?: Readonly<Record<string, VariableValue>>;
    currentStep: number;
  };
};

export type ToggleEdgeAction = {
  type: 'toggleEdge';
  payload: {
    edgeType: string;
    /** Used only when the toggle CREATES; a delete ignores it. */
    uid: string;
    from: string;
    to: string;
    currentStep: number;
  };
};

export type UpdateNodeAction = {
  type: 'updateNode';
  payload: { nodeId: string; attributePatch: AttributePatch; currentStep: number };
};

export type UpdateEdgeAction = {
  type: 'updateEdge';
  payload: { edgeId: string; attributePatch: AttributePatch };
};

export type UpdateEgoAction = {
  type: 'updateEgo';
  payload: { attributePatch: AttributePatch };
};

export type ToggleNodeAttributesAction = {
  type: 'toggleNodeAttributes';
  payload: { nodeId: string; attributePatch: AttributePatch };
};

export type DeleteNodeAction = { type: 'deleteNode'; payload: { nodeId: string } };

export type DeleteEdgeAction = { type: 'deleteEdge'; payload: { edgeId: string } };

export type UpdatePromptAction = { type: 'updatePrompt'; payload: { promptIndex: number } };

export type TransitionStageAction = { type: 'transitionStage'; payload: Record<never, never> };

export type UpdateStageMetadataAction = {
  type: 'updateStageMetadata';
  payload: { currentStep: number; metadata: StageMetadataEntry };
};

export type SyntheticSessionAction =
  | AddNodeAction
  | AddNodeToPromptAction
  | RemoveNodeFromPromptAction
  | AddEdgeAction
  | ToggleEdgeAction
  | UpdateNodeAction
  | UpdateEdgeAction
  | UpdateEgoAction
  | ToggleNodeAttributesAction
  | DeleteNodeAction
  | DeleteEdgeAction
  | UpdatePromptAction
  | TransitionStageAction
  | UpdateStageMetadataAction;
