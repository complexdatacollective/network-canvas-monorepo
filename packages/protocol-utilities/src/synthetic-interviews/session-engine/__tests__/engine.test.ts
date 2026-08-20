import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { createSessionClock } from '../clock';
import { type EngineCodebook, SessionEngine } from '../engine';
import { createSessionStreams } from '../streams';

/**
 * The fold the simulators are written against.
 *
 * Each case below pins one of the reducer semantics a simulator relies on
 * being true — the ones where doing the obvious thing instead would produce a
 * session the interview itself could never reach. The replay-parity suite
 * proves the fold agrees with the real store; this proves the simulators are
 * entitled to assume it.
 */

const codebook: EngineCodebook = {
  node: {
    person: { variables: { name: {}, close: {}, band: {} } },
    place: { variables: { name: {} } },
  },
  edge: { knows: { variables: { strength: {} } } },
  ego: { variables: { egoName: {} } },
};

const stages = [
  {
    id: 'generator',
    prompts: [
      {
        id: 'p1',
        additionalAttributes: [{ variable: 'close', value: true }],
      },
      {
        id: 'p2',
        additionalAttributes: [{ variable: 'close', value: false }],
      },
      { id: 'p3' },
    ],
  },
  { id: 'census', prompts: [{ id: 'c1' }] },
  { id: 'information' },
] as unknown as Stage[];

const engineFor = (): SessionEngine =>
  new SessionEngine({
    codebook,
    stages,
    clock: createSessionClock(
      '2026-08-14T12:00:00.000Z',
      createSessionStreams(1234, 0),
    ),
    egoUid: 'ego-uid',
    captureTrace: true,
  });

const addPerson = (engine: SessionEngine, uid: string, currentStep = 0) =>
  engine.addNode({
    nodeType: 'person',
    uid,
    attributeData: { name: uid },
    currentStep,
  });

const nodeById = (engine: SessionEngine, uid: string) => {
  const node = engine.draft.network.nodes.find(
    (candidate) => candidate[entityPrimaryKeyProperty] === uid,
  );
  if (!node) throw new Error(`no node ${uid}`);
  return node;
};

describe('the session engine fold', () => {
  describe('prompt attribution', () => {
    it('stamps a new node with the stage and the prompt it is on', () => {
      const engine = engineFor();
      engine.updatePrompt({ promptIndex: 1 });
      const node = addPerson(engine, 'a');

      expect(node.stageId).toBe('generator');
      expect(node.promptIDs).toEqual(['p2']);
    });

    it('records no prompt on a stage that has none', () => {
      const engine = engineFor();
      const node = addPerson(engine, 'a', 2);

      expect(node.stageId).toBe('information');
      expect(node.promptIDs).toEqual([]);
    });

    it('accumulates prompt ids as a node is re-nominated', () => {
      const engine = engineFor();
      addPerson(engine, 'a');
      engine.updatePrompt({ promptIndex: 1 });
      engine.addNodeToPrompt({
        nodeId: 'a',
        promptAttributes: {},
        currentStep: 0,
      });
      engine.updatePrompt({ promptIndex: 2 });
      engine.addNodeToPrompt({
        nodeId: 'a',
        promptAttributes: {},
        currentStep: 0,
      });

      expect(nodeById(engine, 'a').promptIDs).toEqual(['p1', 'p2', 'p3']);
    });

    it('lets a prompt’s attributes overwrite what the node already held', () => {
      // The network is the single source of truth: a prompt saying `close` is
      // true says so about every node it elicits, whatever an earlier prompt
      // recorded.
      const engine = engineFor();
      engine.addNode({
        nodeType: 'person',
        uid: 'a',
        attributeData: { name: 'a', close: false },
        currentStep: 0,
      });
      engine.updatePrompt({ promptIndex: 1 });
      engine.addNodeToPrompt({
        nodeId: 'a',
        promptAttributes: { close: true },
        currentStep: 0,
      });

      expect(nodeById(engine, 'a')[entityAttributesProperty].close).toBe(true);
    });

    it('re-resolves a removed prompt’s attributes from the ones left', () => {
      // p1 says close is true and p2 says it is false. Dropping p1 leaves p2
      // as the only prompt with an opinion, so the node takes p2's — rather
      // than keeping p1's answer or losing the variable entirely.
      const engine = engineFor();
      engine.addNode({
        nodeType: 'person',
        uid: 'a',
        attributeData: { name: 'a', close: true },
        currentStep: 0,
      });
      engine.updatePrompt({ promptIndex: 1 });
      engine.addNodeToPrompt({
        nodeId: 'a',
        promptAttributes: { close: false },
        currentStep: 0,
      });

      engine.updatePrompt({ promptIndex: 0 });
      engine.removeNodeFromPrompt({ nodeId: 'a', currentStep: 0 });

      const node = nodeById(engine, 'a');
      expect(node.promptIDs).toEqual(['p2']);
      expect(node[entityAttributesProperty].close).toBe(false);
    });

    it('unsets a variable no remaining prompt declares', () => {
      const engine = engineFor();
      engine.addNode({
        nodeType: 'person',
        uid: 'a',
        attributeData: { name: 'a', close: true },
        currentStep: 0,
      });
      engine.updatePrompt({ promptIndex: 2 });
      engine.addNodeToPrompt({
        nodeId: 'a',
        promptAttributes: {},
        currentStep: 0,
      });

      engine.updatePrompt({ promptIndex: 0 });
      engine.removeNodeFromPrompt({ nodeId: 'a', currentStep: 0 });

      expect(
        nodeById(engine, 'a')[entityAttributesProperty].close,
      ).toBeUndefined();
    });
  });

  describe('edges', () => {
    it('treats an existing edge in either direction as the same tie', () => {
      const engine = engineFor();
      addPerson(engine, 'a');
      addPerson(engine, 'b');

      engine.toggleEdge({
        edgeType: 'knows',
        uid: 'e1',
        from: 'a',
        to: 'b',
        currentStep: 0,
      });
      const removed = engine.toggleEdge({
        edgeType: 'knows',
        uid: 'e2',
        // The other way round: still the same tie.
        from: 'b',
        to: 'a',
        currentStep: 0,
      });

      expect(removed).toBeNull();
      expect(engine.draft.network.edges).toEqual([]);
    });

    it('keeps ties of different types between the same pair apart', () => {
      const engine = engineFor();
      addPerson(engine, 'a');
      addPerson(engine, 'b');

      engine.toggleEdge({
        edgeType: 'knows',
        uid: 'e1',
        from: 'a',
        to: 'b',
        currentStep: 0,
      });
      engine.addEdge({
        edgeType: 'knows',
        uid: 'e2',
        from: 'a',
        to: 'b',
        attributeData: { strength: 3 },
        currentStep: 0,
      });

      expect(engine.draft.network.edges).toHaveLength(2);
    });
  });

  describe('deleting a node', () => {
    it('takes its edges and its census tuples with it', () => {
      const engine = engineFor();
      addPerson(engine, 'a');
      addPerson(engine, 'b');
      addPerson(engine, 'c');
      engine.addEdge({
        edgeType: 'knows',
        uid: 'e1',
        from: 'a',
        to: 'b',
        currentStep: 0,
      });
      engine.updateStageMetadata({
        currentStep: 1,
        metadata: [
          [0, 'a', 'b', true],
          [0, 'b', 'c', false],
        ],
      });

      engine.deleteNode({ nodeId: 'a' });

      expect(engine.draft.network.nodes.map((node) => node.type)).toEqual([
        'person',
        'person',
      ]);
      expect(engine.draft.network.edges).toEqual([]);
      expect(engine.draft.stageMetadata['1']).toEqual([[0, 'b', 'c', false]]);
    });

    it('leaves object-shaped metadata alone', () => {
      // Only the census tuple lists name nodes positionally; a pedigree's
      // committed-membership record is an object, and pruning it by position
      // would corrupt it.
      const engine = engineFor();
      addPerson(engine, 'a');
      engine.updateStageMetadata({
        currentStep: 1,
        metadata: { isNetworkCommitted: true },
      });

      engine.deleteNode({ nodeId: 'a' });

      expect(engine.draft.stageMetadata['1']).toEqual({
        isNetworkCommitted: true,
      });
    });
  });

  describe('the clock', () => {
    it('bumps lastUpdated on a write', () => {
      const engine = engineFor();
      const before = engine.draft.lastUpdated;
      addPerson(engine, 'a');

      expect(engine.draft.lastUpdated).not.toBe('');
      expect(Date.parse(engine.draft.lastUpdated)).toBeGreaterThanOrEqual(
        Date.parse(before),
      );
    });

    it('leaves lastUpdated alone when only the prompt moves', () => {
      // Moving between prompts is navigation, not an answer: a session whose
      // last-updated stamp advanced on it would claim the participant wrote
      // something they did not.
      const engine = engineFor();
      addPerson(engine, 'a');
      const before = engine.draft.lastUpdated;

      engine.updatePrompt({ promptIndex: 1 });

      expect(engine.draft.lastUpdated).toBe(before);
      expect(engine.draft.promptIndex).toBe(1);
    });

    it('resets the prompt when the stage is left', () => {
      const engine = engineFor();
      engine.updatePrompt({ promptIndex: 2 });
      engine.transitionStage();

      expect(engine.draft.promptIndex).toBe(0);
    });
  });

  describe('what the fold refuses', () => {
    it('refuses an attribute the codebook does not declare', () => {
      const engine = engineFor();

      expect(() =>
        engine.addNode({
          nodeType: 'person',
          uid: 'a',
          attributeData: { ghost: 1 },
          currentStep: 0,
        }),
      ).toThrow(/do not exist in protocol codebook/);
    });

    it('admits unknown attributes where a source supplies them', () => {
      // A roster carries whatever columns the researcher gave it.
      const engine = engineFor();
      const node = engine.addNode({
        nodeType: 'person',
        uid: 'a',
        attributeData: { ghost: 1 },
        allowUnknownAttributes: true,
        currentStep: 0,
      });

      expect(node[entityAttributesProperty].ghost).toBe(1);
    });

    it('refuses a second node under an id the network already holds', () => {
      const engine = engineFor();
      addPerson(engine, 'a');

      expect(() => addPerson(engine, 'a')).toThrow(/already exists/);
    });

    it('refuses a patch that both sets and unsets a variable', () => {
      const engine = engineFor();
      addPerson(engine, 'a');

      expect(() =>
        engine.updateNode({
          nodeId: 'a',
          attributePatch: { set: { close: true }, unset: ['close'] },
          currentStep: 0,
        }),
      ).toThrow(/appears in both set and unset/);
    });

    it('refuses a null in set rather than diverging from the reducer', () => {
      // The reducer applies `set` VERBATIM — a null would be WRITTEN there,
      // while a fold that silently dropped it would diverge. An unanswered
      // variable is ABSENT (that is what unset is for), so a simulator
      // putting null in set is a bug the engine surfaces immediately.
      const engine = engineFor();
      addPerson(engine, 'a');
      expect(() =>
        engine.updateNode({
          nodeId: 'a',
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          attributePatch: { set: { close: null } as never, unset: [] },
          currentStep: 0,
        }),
      ).toThrow(/use unset/);
    });
  });

  it('captures every write in order when asked for a trace', () => {
    const engine = engineFor();
    addPerson(engine, 'a');
    engine.updatePrompt({ promptIndex: 1 });
    engine.addNodeToPrompt({
      nodeId: 'a',
      promptAttributes: { close: true },
      currentStep: 0,
    });
    engine.transitionStage();

    expect(engine.capturedTrace()?.map((action) => action.type)).toEqual([
      'addNode',
      'updatePrompt',
      'addNodeToPrompt',
      'transitionStage',
    ]);
  });
});

describe('reducer-divergence pins', () => {
  // Each case here pins a semantic where the OBVIOUS fold diverges from the
  // reducer in a way the parity suite cannot currently reach — either the
  // divergent state needs an action sequence no simulator emits yet, or the
  // decision happens before anything lands in the trace. Adversarial review
  // of Phase 2 found each of these as a live or latent divergence; the pin
  // fails on the divergent implementation.

  const engineWith = (customStages: Stage[]): SessionEngine =>
    new SessionEngine({
      codebook,
      stages: customStages,
      clock: createSessionClock(
        '2026-08-14T12:00:00.000Z',
        createSessionStreams(1234, 0),
      ),
      egoUid: 'ego-uid',
      captureTrace: true,
    });

  it('ignores prompt ids from other stages when reconciling a removal', () => {
    // The runtime re-resolves a removed prompt's variables from the CURRENT
    // stage's prompts alone (getPrompts(state, currentStep)) — a promptID
    // the node still carries from ANOTHER stage contributes nothing, however
    // identical its declaration. A protocol-global prompt map gets this
    // wrong: it would keep `close` alive through the other stage's prompt.
    const twoStages = [
      {
        id: 'stage-a',
        prompts: [
          {
            id: 'a1',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
        ],
      },
      {
        id: 'stage-b',
        prompts: [
          {
            id: 'b1',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
        ],
      },
    ] as unknown as Stage[];
    const engine = engineWith(twoStages);

    engine.addNode({
      nodeType: 'person',
      uid: 'n',
      attributeData: { name: 'n' },
      currentStep: 0,
    });
    engine.transitionStage();
    engine.addNodeToPrompt({
      nodeId: 'n',
      promptAttributes: { close: true },
      currentStep: 1,
    });
    engine.removeNodeFromPrompt({ nodeId: 'n', currentStep: 1 });

    const node = engine.draft.network.nodes[0];
    expect(node?.promptIDs).toEqual(['a1']);
    expect(node ? 'close' in node[entityAttributesProperty] : undefined).toBe(
      false,
    );
  });

  it('resolves a removal in stage-authored order, not node order', () => {
    // q1 says true, q2 says false, q3 says true. The node reached q2 first,
    // so its promptIDs order is [q2, q1] after q3 is removed — but the
    // runtime iterates the STAGE's prompts, so the last declaring prompt in
    // AUTHORED order (q2) wins. Node-order iteration would take q1's value.
    const threeDeclaring = [
      {
        id: 'stage-q',
        prompts: [
          {
            id: 'q1',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
          {
            id: 'q2',
            additionalAttributes: [{ variable: 'close', value: false }],
          },
          {
            id: 'q3',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
        ],
      },
    ] as unknown as Stage[];
    const engine = engineWith(threeDeclaring);

    engine.updatePrompt({ promptIndex: 1 });
    engine.addNode({
      nodeType: 'person',
      uid: 'n',
      attributeData: { name: 'n' },
      currentStep: 0,
    });
    engine.updatePrompt({ promptIndex: 0 });
    engine.addNodeToPrompt({
      nodeId: 'n',
      promptAttributes: { close: true },
      currentStep: 0,
    });
    engine.updatePrompt({ promptIndex: 2 });
    engine.addNodeToPrompt({
      nodeId: 'n',
      promptAttributes: { close: true },
      currentStep: 0,
    });
    engine.removeNodeFromPrompt({ nodeId: 'n', currentStep: 0 });

    const node = engine.draft.network.nodes[0];
    expect(node?.promptIDs).toEqual(['q2', 'q1']);
    expect(node?.[entityAttributesProperty].close).toBe(false);
  });

  it('deletes the forwards edge when both directions of a pair exist', () => {
    // The reducer's edgeExists checks forwards before reverse regardless of
    // array position; a first-match-in-array-order fold would delete e1.
    const engine = engineFor();
    addPerson(engine, 'a');
    addPerson(engine, 'b');
    engine.addEdge({
      edgeType: 'knows',
      uid: 'e1',
      from: 'b',
      to: 'a',
      currentStep: 0,
    });
    engine.addEdge({
      edgeType: 'knows',
      uid: 'e2',
      from: 'a',
      to: 'b',
      currentStep: 0,
    });

    engine.toggleEdge({
      edgeType: 'knows',
      uid: 'e3',
      from: 'a',
      to: 'b',
      currentStep: 0,
    });

    expect(
      engine.draft.network.edges.map((edge) => edge[entityPrimaryKeyProperty]),
    ).toEqual(['e1']);
  });

  it('records a toggle as the gesture, not its resolution', () => {
    // Replay must re-resolve through the runtime's own toggleEdge thunk —
    // a trace carrying the resolved addEdge/deleteEdge would make dedupe
    // and tie-break divergences invisible to the parity suite forever.
    const engine = engineFor();
    addPerson(engine, 'a');
    addPerson(engine, 'b');
    engine.toggleEdge({
      edgeType: 'knows',
      uid: 'e1',
      from: 'a',
      to: 'b',
      currentStep: 0,
    });
    engine.toggleEdge({
      edgeType: 'knows',
      uid: 'e2',
      from: 'b',
      to: 'a',
      currentStep: 0,
    });

    expect(engine.capturedTrace()?.map((action) => action.type)).toEqual([
      'addNode',
      'addNode',
      'toggleEdge',
      'toggleEdge',
    ]);
    expect(engine.draft.network.edges).toEqual([]);
  });

  it('prunes metadata tuples of any length naming the node', () => {
    // The reducer destructures every array item positionally with no shape
    // guard — a length-4-only check would keep this three-slot tuple.
    const engine = engineFor();
    addPerson(engine, 'a');
    addPerson(engine, 'b');
    engine.updateStageMetadata({
      currentStep: 1,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      metadata: [[0, 'a', 'b']] as never,
    });

    engine.deleteNode({ nodeId: 'a' });

    expect(engine.draft.stageMetadata['1']).toEqual([]);
  });

  it('collapses duplicate prompt ids on update, as the reducer does', () => {
    // addNodeToPrompt appends unconditionally on both sides, so a repeat
    // nomination on the same prompt is reachable; the reducer folds
    // promptIDs through a Set on every updateNode.
    const engine = engineFor();
    addPerson(engine, 'a', 2);
    engine.addNodeToPrompt({
      nodeId: 'a',
      promptAttributes: {},
      currentStep: 0,
    });
    engine.addNodeToPrompt({
      nodeId: 'a',
      promptAttributes: {},
      currentStep: 0,
    });
    expect(nodeById(engine, 'a').promptIDs).toEqual(['p1', 'p1']);

    engine.updateNode({
      nodeId: 'a',
      attributePatch: { set: { band: 1 }, unset: [] },
      currentStep: 0,
    });

    expect(nodeById(engine, 'a').promptIDs).toEqual(['p1']);
  });
});
