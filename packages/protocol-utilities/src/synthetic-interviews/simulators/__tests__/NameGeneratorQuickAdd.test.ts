import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { simulateNameGeneratorQuickAdd } from '../NameGeneratorQuickAdd';
import type { AssetData } from '../types';
import { harnessFor, type Harness, parseProtocol, rosterRow } from './harness';

type Validation = Record<string, unknown>;

const codebookWith = ({
  validation,
  quickAddName = 'name',
}: { validation?: Validation; quickAddName?: string } = {}) => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: {
          name: quickAddName,
          type: 'text',
          component: 'Text',
          ...(validation ? { validation } : {}),
        },
        age: { name: 'age', type: 'number' },
        close: { name: 'close', type: 'boolean' },
      },
    },
  },
});

/**
 * A stage that ran before the one under test, so the harness can put alters in
 * the network the way a real session does — through the engine, stamped with
 * the stage that elicited them.
 */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Who did you know?' }],
};

const stageWith = ({
  count = 6,
  prompts = [{ id: 'p1', text: 'Who do you know?' }],
  quickAdd = 'name',
  panels,
}: {
  count?: number;
  prompts?: Record<string, unknown>[];
  quickAdd?: string;
  panels?: Record<string, unknown>[];
} = {}) => ({
  id: 'quick-add',
  type: 'NameGeneratorQuickAdd',
  label: 'Quick add',
  subject: { entity: 'node', type: 'person' },
  quickAdd,
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts,
  ...(panels ? { panels } : {}),
});

const setUp = ({
  stage = stageWith(),
  codebook = codebookWith(),
  assetData,
  priorAlters = 0,
  corrupt,
}: {
  stage?: Record<string, unknown>;
  codebook?: unknown;
  assetData?: AssetData;
  priorAlters?: number;
  /**
   * Applied to the PARSED stage, so a fixture the schema itself refuses can
   * still be put in front of the simulator. That is the case the simulator's
   * invariants exist for: a host holding a protocol the parser never saw, or
   * one it mutated afterwards.
   */
  corrupt?: Record<string, unknown>;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [priorStage, stage]);
  if (corrupt) Object.assign(protocol.stages[1] ?? {}, corrupt);
  const harness = harnessFor(protocol, assetData ? { assetData } : {});
  harness.seedAlters(priorAlters, {
    uid: (index) => `prior-${index}`,
    attributes: (index) => ({ name: `Prior ${index}` }),
  });
  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages.find(
    (candidate) => candidate.id === 'quick-add',
  );
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateNameGeneratorQuickAdd(
    stage as Extract<Stage, { type: 'NameGeneratorQuickAdd' }>,
    harness.context,
    promptBound,
  );
};

/** Nodes this stage created, as opposed to any the harness seeded. */
const created = (harness: Harness): NcNode[] =>
  harness.nodes().filter((node) => node.stageId === 'quick-add');

const namesOf = (harness: Harness): string[] =>
  created(harness).map((node) => String(node[entityAttributesProperty].name));

describe('simulateNameGeneratorQuickAdd', () => {
  describe('what a typed-in person carries', () => {
    it('writes the value under the quick-add variable id', () => {
      // Asserting the KEY, not just that some text landed: the fixture calls
      // its variable `name`, so a simulator writing to the wrong id would still
      // look right if the test read `attributes.name` by convention.
      const harness = setUp({ stage: stageWith({ count: 3 }) });
      runStage(harness);

      expect(created(harness)).toHaveLength(3);
      for (const node of created(harness)) {
        expect(Object.keys(node[entityAttributesProperty])).toEqual(['name']);
      }
    });

    it('leaves the node type’s other variables unanswered', () => {
      // The interface asks one thing. `age` and `close` belong to stages that
      // ask for them; filling them here would report data never given.
      const harness = setUp({ stage: stageWith({ count: 4 }) });
      runStage(harness);

      for (const node of created(harness)) {
        expect(node[entityAttributesProperty].age).toBeUndefined();
        expect(node[entityAttributesProperty].close).toBeUndefined();
      }
    });

    it('records the stage and prompt that elicited them', () => {
      const harness = setUp({ stage: stageWith({ count: 2 }) });
      runStage(harness);

      for (const node of created(harness)) {
        expect(node.stageId).toBe('quick-add');
        expect(node.promptIDs).toEqual(['p1']);
        expect(node.type).toBe('person');
      }
    });

    it('stamps each prompt’s own id on the people it elicited', () => {
      // The engine reads the prompt off its OWN index, so a simulator that
      // never moved it would file every nomination under the first prompt.
      const harness = setUp({
        stage: stageWith({
          count: 4,
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
          ],
        }),
      });
      runStage(harness);

      const byPrompt = created(harness).map((node) => node.promptIDs?.[0]);
      expect(byPrompt.filter((id) => id === 'p1')).toHaveLength(2);
      expect(byPrompt.filter((id) => id === 'p2')).toHaveLength(2);
    });

    it('always answers the quick-add field', () => {
      // `missingProbability` is deliberately not applied: the interface will
      // not create a node from an empty field.
      const harness = setUp({ stage: stageWith({ count: 8 }) });
      runStage(harness);

      for (const name of namesOf(harness)) {
        expect(name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('a stop-at prompt bound', () => {
    it('leaves a stage the participant only arrived at untouched', () => {
      const harness = setUp({ stage: stageWith({ count: 5 }) });
      runStage(harness, 0);

      expect(created(harness)).toEqual([]);
    });

    it('applies only the prompts below the bound', () => {
      const harness = setUp({
        stage: stageWith({
          count: 4,
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
          ],
        }),
      });
      runStage(harness, 1);

      const byPrompt = created(harness).map((node) => node.promptIDs?.[0]);
      expect(byPrompt).toEqual(['p1', 'p1']);
    });
  });

  describe('codebook validation rules', () => {
    it('respects a maximum length', () => {
      const harness = setUp({
        stage: stageWith({ count: 12 }),
        codebook: codebookWith({ validation: { maxLength: 5 } }),
      });
      runStage(harness);

      expect(namesOf(harness).filter((name) => name.length > 5)).toEqual([]);
    });

    it('respects a minimum length', () => {
      const harness = setUp({
        stage: stageWith({ count: 12 }),
        codebook: codebookWith({ validation: { minLength: 25 } }),
      });
      runStage(harness);

      expect(namesOf(harness).filter((name) => name.length < 25)).toEqual([]);
    });

    it('issues a unique name only once', () => {
      const harness = setUp({
        stage: stageWith({ count: 12 }),
        codebook: codebookWith({ validation: { unique: true } }),
      });
      runStage(harness);

      const names = namesOf(harness);
      expect(new Set(names).size).toBe(names.length);
    });

    it('draws a person’s name however the variable is named', () => {
      // A quick-add variable IS the node's label by construction, so it is
      // treated as a person label rather than inferred from its name — which
      // would otherwise give a variable called `alias` filler words.
      const harness = setUp({
        stage: stageWith({ count: 4 }),
        codebook: codebookWith({ quickAddName: 'alias' }),
      });
      runStage(harness);

      for (const name of namesOf(harness)) {
        expect(name).toMatch(/^[A-Z][^ ]* [A-Z]/);
      }
    });
  });

  describe('prompt additionalAttributes', () => {
    const prompts = [
      {
        id: 'p1',
        text: 'Close ties',
        additionalAttributes: [{ variable: 'close', value: true }],
      },
    ];

    it('writes them onto people the participant types in', () => {
      const harness = setUp({ stage: stageWith({ count: 3, prompts }) });
      runStage(harness);

      expect(created(harness)).toHaveLength(3);
      for (const node of created(harness)) {
        expect(node[entityAttributesProperty].close).toBe(true);
      }
    });

    it('writes them onto people taken from a roster', () => {
      const roster: NcNode[] = Array.from({ length: 6 }, (_, index) =>
        rosterRow(`r-${index}`, { name: `Roster ${index}` }),
      );

      const harness = setUp({
        stage: stageWith({
          count: 6,
          prompts,
          panels: [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }],
        }),
        assetData: { rosterNodes: { 'quick-add': roster } },
      });
      runStage(harness);

      const taken = created(harness).filter((node) =>
        node[entityPrimaryKeyProperty].startsWith('r-'),
      );
      expect(taken.length).toBeGreaterThan(0);
      for (const node of taken) {
        expect(node[entityAttributesProperty].close).toBe(true);
      }
    });

    it('writes them onto alters re-nominated from the existing network', () => {
      const harness = setUp({
        stage: stageWith({
          count: 0,
          prompts,
          panels: [{ id: 'e', title: 'Previously', dataSource: 'existing' }],
        }),
        priorAlters: 30,
      });
      runStage(harness);

      const renominated = harness
        .nodes()
        .filter((node) => (node.promptIDs ?? []).includes('p1'));
      expect(renominated.length).toBeGreaterThan(0);
      for (const node of renominated) {
        expect(node[entityAttributesProperty].close).toBe(true);
      }
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a subject the codebook does not define', () => {
      const harness = setUp({
        stage: stageWith({ count: 2 }),
        corrupt: { subject: { entity: 'node', type: 'ghost' } },
      });

      expect(() => runStage(harness)).toThrow(/node type "ghost"/);
    });

    it('refuses a quick-add variable that is not text', () => {
      const harness = setUp({
        stage: stageWith({ count: 2 }),
        corrupt: { quickAdd: 'age' },
      });

      expect(() => runStage(harness)).toThrow(/not a text variable/);
    });
  });
});
