import { describe, expect, it } from 'vitest';

import { describeRule } from '../ruleDescription.ts';
import { testCodebook } from './fixtures.ts';

const codebook = testCodebook;

describe('describeRule', () => {
  it('resolves a presence rule against the codebook', () => {
    const description = describeRule({
      rule: {
        id: 'rule-1',
        type: 'node',
        options: { type: 'person', operator: 'EXISTS' },
      },
      codebook,
    });

    expect(description.entity).toEqual({
      kind: 'node',
      typeId: 'person',
      label: 'Person',
      color: 'node-color-seq-2',
      shape: 'square',
      missing: false,
    });
    expect(description.attribute).toBeUndefined();
    expect(description.operand).toBeUndefined();
    expect(description.operator.text).toBe('exists');
    expect(description.columns).toBe(false);
    expect(description.text).toBe('Person exists');
    expect(description.problems).toEqual([]);
  });

  it('substitutes the authored option labels for stored option values', () => {
    const description = describeRule({
      rule: {
        id: 'rule-2',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'mood',
          operator: 'INCLUDES',
          value: ['happy', 'sad'],
        },
      },
      codebook,
    });

    expect(description.attribute).toEqual({
      id: 'mood',
      label: 'Mood',
      type: 'categorical',
      missing: false,
    });
    expect(description.operand?.items).toEqual(['Happy', 'Sad']);
    expect(description.operand?.authoredLabels).toBe(true);
    expect(description.columns).toBe(true);
    expect(description.text).toBe('Person where Mood includes Happy, Sad');
    expect(description.problems).toEqual([]);
  });

  it('does not read a pattern operand as authored prose', () => {
    const description = describeRule({
      rule: {
        id: 'rule-3',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'note',
          operator: 'CONTAINS',
          value: '.*abc.*',
        },
      },
      codebook,
    });

    expect(description.operand).toEqual({
      items: ['.*abc.*'],
      authoredLabels: false,
    });
  });

  it('reads an option-count operand as a number, not an option label', () => {
    const description = describeRule({
      rule: {
        id: 'rule-4',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'mood',
          operator: 'OPTIONS_GREATER_THAN',
          value: 1,
        },
      },
      codebook,
    });

    expect(description.operand).toEqual({ items: [1], authoredLabels: false });
    expect(description.text).toBe(
      'Person where Mood has selected options greater than 1',
    );
  });

  it('addresses an ego rule in the ego voice', () => {
    const description = describeRule({
      rule: {
        id: 'rule-5',
        type: 'ego',
        options: {
          attribute: 'egoName',
          operator: 'EXACTLY',
          value: 'Alex',
        },
      },
      codebook,
    });

    expect(description.entity).toEqual({
      kind: 'ego',
      label: 'Ego',
      missing: false,
    });
    expect(description.operator.text).toBe('that is exactly equal to');
    expect(description.text).toBe(
      'Ego has EgoName that is exactly equal to Alex',
    );
  });

  it('resolves an edge rule against the edge codebook', () => {
    const description = describeRule({
      rule: {
        id: 'rule-6',
        type: 'edge',
        options: {
          type: 'friend',
          attribute: 'closeness',
          operator: 'GREATER_THAN',
          value: 3,
        },
      },
      codebook,
    });

    expect(description.entity).toMatchObject({
      kind: 'edge',
      label: 'Friend',
      color: 'edge-color-seq-3',
      missing: false,
    });
    expect(description.attribute?.type).toBe('scalar');
    expect(description.text).toBe('Friend where Closeness is greater than 3');
  });

  describe('references the codebook can no longer account for', () => {
    it('reports a deleted attribute rather than throwing', () => {
      const description = describeRule({
        rule: {
          id: 'rule-7',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'favouriteColour',
            operator: 'EXACTLY',
            value: 'blue',
          },
        },
        codebook,
      });

      expect(description.attribute).toEqual({
        id: 'favouriteColour',
        label: 'favouriteColour',
        type: undefined,
        missing: true,
      });
      expect(description.problems).toContainEqual({
        code: 'missingAttribute',
        message:
          'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      });
      // The rest of the sentence still reads, so the researcher can see which
      // rule they have to fix.
      expect(description.text).toBe(
        'Person where favouriteColour is exactly equal to blue',
      );
    });

    it('reports a deleted node type rather than throwing', () => {
      const description = describeRule({
        rule: {
          id: 'rule-8',
          type: 'node',
          options: { type: 'ghost', operator: 'EXISTS' },
        },
        codebook,
      });

      expect(description.entity).toMatchObject({
        kind: 'node',
        label: 'ghost',
        missing: true,
      });
      expect(description.problems.map((problem) => problem.code)).toContain(
        'missingEntityType',
      );
    });

    it('reports a deleted edge type rather than throwing', () => {
      const description = describeRule({
        rule: {
          id: 'rule-9',
          type: 'edge',
          options: { type: 'rival', operator: 'NOT_EXISTS' },
        },
        codebook,
      });

      expect(description.entity).toMatchObject({ kind: 'edge', missing: true });
      expect(description.problems.map((problem) => problem.code)).toContain(
        'missingEntityType',
      );
    });

    it('reports an ego rule in a protocol with no ego attributes', () => {
      const description = describeRule({
        rule: {
          id: 'rule-10',
          type: 'ego',
          options: { attribute: 'egoName', operator: 'EXISTS' },
        },
        codebook: { node: {}, edge: {} },
      });

      expect(description.entity).toMatchObject({ kind: 'ego', missing: true });
      expect(description.problems.map((problem) => problem.code)).toContain(
        'missingEntityType',
      );
    });
  });

  describe('input it cannot trust', () => {
    it.each([
      ['null', null],
      ['a string', 'node'],
      ['an array', []],
      ['an object with no target', { options: {} }],
    ])('describes %s without throwing', (_label, rule) => {
      const description = describeRule({ rule, codebook });
      expect(description.problems.map((problem) => problem.code)).toContain(
        'unknownTarget',
      );
    });

    it('reports an unfinished rule as incomplete', () => {
      const description = describeRule({
        rule: { id: 'rule-11', type: 'node', options: { type: 'person' } },
        codebook,
      });
      expect(description.problems.map((problem) => problem.code)).toContain(
        'incomplete',
      );
    });

    it('survives a codebook entry whose attribute type it does not know', () => {
      const description = describeRule({
        rule: {
          id: 'rule-12',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'age',
            operator: 'EXACTLY',
            value: { nested: true },
          },
        },
        codebook,
      });
      // A non-primitive operand contributes nothing to the sentence rather
      // than being stringified into it.
      expect(description.operand).toBeUndefined();
    });
  });
});
