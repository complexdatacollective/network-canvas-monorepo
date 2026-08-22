import { describe, expect, it } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { simulateNameGenerator } from '../NameGenerator';
import type { AssetData } from '../types';
import { harnessFor, type Harness, parseProtocol, rosterRow } from './harness';

const codebook = ({
  variables,
}: { variables?: Record<string, unknown> } = {}) => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: variables ?? {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: {
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 18, maxValue: 90 },
        },
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
      },
    },
  },
});

const stageWith = ({
  count = 5,
  fields = [{ variable: 'name', prompt: 'Their name' }],
  prompts = [{ id: 'p1', text: 'Who do you know?' }],
  panels,
}: {
  count?: number;
  fields?: Record<string, unknown>[];
  prompts?: Record<string, unknown>[];
  panels?: Record<string, unknown>[];
} = {}) => ({
  id: 'name-generator',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'About this person', fields },
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts,
  ...(panels ? { panels } : {}),
});

const setUp = ({
  stage = stageWith(),
  book = codebook(),
  assetData,
  corrupt,
  after,
}: {
  stage?: Record<string, unknown>;
  book?: unknown;
  assetData?: AssetData;
  /**
   * Applied to the PARSED stage, so a fixture the schema itself refuses can
   * still be put in front of the simulator — the case its invariants exist
   * for.
   */
  corrupt?: Record<string, unknown>;
  after?: (protocol: CurrentProtocol) => void;
} = {}): Harness => {
  const protocol = parseProtocol(book, [stage]);
  if (corrupt) Object.assign(protocol.stages[0] ?? {}, corrupt);
  after?.(protocol);
  return harnessFor(protocol, assetData ? { assetData } : {});
};

const runStage = (harness: Harness): void => {
  const stage = harness.context.protocol.stages[0];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateNameGenerator(
    stage as Extract<Stage, { type: 'NameGenerator' }>,
    harness.context,
    undefined,
  );
};

describe('simulateNameGenerator', () => {
  it('answers every field its form collects', () => {
    const harness = setUp({
      stage: stageWith({
        count: 4,
        fields: [
          { variable: 'name', prompt: 'Their name' },
          { variable: 'age', prompt: 'Their age' },
        ],
      }),
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(4);
    for (const node of harness.nodes()) {
      expect(Object.keys(node[entityAttributesProperty]).toSorted()).toEqual([
        'age',
        'name',
      ]);
    }
  });

  it('leaves variables the form does not ask for unanswered', () => {
    // `nickname` is in the codebook but not on this form, so the participant
    // was never asked.
    const harness = setUp({ stage: stageWith({ count: 3 }) });
    runStage(harness);

    for (const node of harness.nodes()) {
      expect(node[entityAttributesProperty].nickname).toBeUndefined();
      expect(node[entityAttributesProperty].age).toBeUndefined();
    }
  });

  it('respects validation rules across the form', () => {
    const harness = setUp({
      stage: stageWith({
        count: 10,
        fields: [
          { variable: 'name', prompt: 'Their name' },
          { variable: 'age', prompt: 'Their age' },
        ],
      }),
    });
    runStage(harness);

    for (const node of harness.nodes()) {
      const age = Number(node[entityAttributesProperty].age);
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(90);
    }
  });

  it('honours a comparator between two fields of the same person', () => {
    // The engine draws `retired` against the `age` this same node was given,
    // which a per-variable draw could not do.
    const harness = setUp({
      book: codebook({
        variables: {
          age: {
            name: 'age',
            type: 'number',
            component: 'Number',
            validation: { minValue: 18, maxValue: 60 },
          },
          retired: {
            name: 'retired',
            type: 'number',
            component: 'Number',
            validation: { greaterThanVariable: 'age', maxValue: 90 },
          },
        },
      }),
      stage: stageWith({
        count: 10,
        fields: [
          { variable: 'age', prompt: 'Age' },
          { variable: 'retired', prompt: 'Retired at' },
        ],
      }),
    });
    runStage(harness);

    for (const node of harness.nodes()) {
      const { age, retired } = node[entityAttributesProperty];
      expect(Number(retired)).toBeGreaterThan(Number(age));
    }
  });

  it('draws a real name for a name-like text field', () => {
    const harness = setUp({ stage: stageWith({ count: 4 }) });
    runStage(harness);

    for (const node of harness.nodes()) {
      expect(String(node[entityAttributesProperty].name)).toMatch(
        /^[A-Z][^ ]* [A-Z]/,
      );
    }
  });

  it('draws around a value the prompt fixes rather than over it', () => {
    // `alsoClose` must differ from `close`, and the prompt settles `close` at
    // true. A simulator that drew the whole form and then merged the prompt's
    // value in would draw `alsoClose` against whatever `close` happened to
    // come out as, and half the nodes would end up holding two equal values —
    // the rule broken on the finished person.
    const harness = setUp({
      book: codebook({
        variables: {
          close: { name: 'close', type: 'boolean', component: 'Toggle' },
          alsoClose: {
            name: 'alsoClose',
            type: 'boolean',
            component: 'Toggle',
            validation: { differentFrom: 'close' },
          },
        },
      }),
      stage: stageWith({
        count: 8,
        fields: [
          { variable: 'close', prompt: 'Close?' },
          { variable: 'alsoClose', prompt: 'Also close?' },
        ],
        prompts: [
          {
            id: 'p1',
            text: 'Who do you know?',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
        ],
      }),
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(8);
    for (const node of harness.nodes()) {
      expect(node[entityAttributesProperty].close).toBe(true);
      expect(node[entityAttributesProperty].alsoClose).toBe(false);
    }
  });

  it('shares the nomination behaviour with the quick-add generator', () => {
    // Panels, the split budget and roster hiding all come from the shared
    // module; this checks the wiring reaches them rather than re-testing them.
    const roster: NcNode[] = Array.from({ length: 8 }, (_, index) =>
      rosterRow(`r-${index}`, { name: `Roster ${index}` }),
    );

    const harness = setUp({
      stage: stageWith({
        count: 6,
        panels: [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }],
      }),
      assetData: { rosterNodes: { 'name-generator': roster } },
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(6);
    expect(
      harness
        .nodes()
        .filter((node) => node[entityPrimaryKeyProperty].startsWith('r-'))
        .length,
    ).toBeGreaterThan(0);
  });

  it('creates bare people when the codebook names no variables for them', () => {
    // A subject the codebook defines but gives no variables leaves the form
    // with nothing it can collect. The people are still named — the stage's
    // job — rather than the stage failing on a lookup that returned nothing.
    //
    // The codebook is emptied AFTER parsing, because the schema's own
    // cross-reference check refuses a form field naming a variable that does
    // not exist: this is the shape a host reaches generation with when its
    // protocol was never parsed, or was edited afterwards.
    const harness = setUp({
      stage: stageWith({ count: 3 }),
      after: (protocol) => {
        delete protocol.codebook.node?.person?.variables;
      },
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(3);
    for (const node of harness.nodes()) {
      expect(node[entityAttributesProperty]).toEqual({});
    }
  });

  it('refuses a subject the codebook does not define', () => {
    const harness = setUp({
      stage: stageWith({ count: 2 }),
      corrupt: { subject: { entity: 'node', type: 'ghost' } },
    });

    expect(() => runStage(harness)).toThrow(/node type "ghost"/);
  });
});
