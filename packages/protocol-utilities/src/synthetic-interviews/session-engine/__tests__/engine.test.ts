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

    it('drops a null from a patch rather than writing it', () => {
      // An unanswered variable is ABSENT from attributes, never null.
      const engine = engineFor();
      addPerson(engine, 'a');
      engine.updateNode({
        nodeId: 'a',
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        attributePatch: { set: { close: null } as never, unset: [] },
        currentStep: 0,
      });

      expect('close' in nodeById(engine, 'a')[entityAttributesProperty]).toBe(
        false,
      );
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
