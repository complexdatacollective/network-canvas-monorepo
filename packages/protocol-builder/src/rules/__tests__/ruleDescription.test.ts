import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';

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

  it('does not read a pattern against a multi-select attribute as prose', () => {
    const description = describeRule({
      rule: {
        id: 'rule-21',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'mood',
          operator: 'CONTAINS',
          value: '.*happy.*',
        },
      },
      codebook,
    });

    // The option labels of a categorical attribute ARE authored prose, but
    // this operand is not one of them: it is a regular expression, and
    // Markdown eats the very characters that make it one.
    expect(description.operand).toEqual({
      items: ['.*happy.*'],
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

  /**
   * The editor no longer offers `EXISTS`/`NOT_EXISTS` against an attribute —
   * an unanswered attribute is already covered by the presence rule above it —
   * but protocols authored before it stopped still hold them, and Architect
   * reads them as "Person where Age" / "Person without Age". The operator IS
   * the word that introduces the attribute here, so writing the connector as
   * well and then repeating the operator after the name produced "Person where
   * Age where".
   */
  describe('a rule about whether an attribute was answered', () => {
    it('reads an alter rule the way Architect does', () => {
      const description = describeRule({
        rule: {
          id: 'rule-13',
          type: 'node',
          options: { type: 'person', attribute: 'age', operator: 'EXISTS' },
        },
        codebook,
      });

      expect(description.text).toBe('Person where Age');
      expect(description.attributePresence).toBe(true);
      expect(description.columns).toBe(false);
      expect(description.problems).toEqual([]);
    });

    it('reads its negative the way Architect does', () => {
      const description = describeRule({
        rule: {
          id: 'rule-14',
          type: 'node',
          options: { type: 'person', attribute: 'age', operator: 'NOT_EXISTS' },
        },
        codebook,
      });

      expect(description.text).toBe('Person without Age');
      expect(description.attributePresence).toBe(true);
    });

    it('addresses the same rule about the ego in the ego voice', () => {
      const description = describeRule({
        rule: {
          id: 'rule-15',
          type: 'ego',
          options: { attribute: 'egoName', operator: 'EXISTS' },
        },
        codebook,
      });

      expect(description.text).toBe('Ego has EgoName');
      expect(description.attributePresence).toBe(true);
    });

    it('leaves a legacy operand out of the sentence', () => {
      const description = describeRule({
        rule: {
          id: 'rule-16',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'age',
            operator: 'EXISTS',
            // Nothing is compared, so an operand a legacy protocol left behind
            // is not part of what the rule says.
            value: 30,
          },
        },
        codebook,
      });

      expect(description.operand).toBeUndefined();
      expect(description.text).toBe('Person where Age');
    });

    it('does not report the operator the schema still accepts as invalid', () => {
      const description = describeRule({
        rule: {
          id: 'rule-17',
          type: 'node',
          options: { type: 'person', attribute: 'note', operator: 'EXISTS' },
        },
        codebook,
      });

      // The editor's own list of offered operators is narrower than the
      // schema's. Marking a rule the schema accepts would send the researcher
      // to fix something that is not broken.
      expect(description.problems).toEqual([]);
    });
  });

  describe('an operator the attribute type does not allow', () => {
    it('reports a rule the schema would reject', () => {
      const description = describeRule({
        rule: {
          id: 'rule-18',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'note',
            operator: 'GREATER_THAN',
            value: 3,
          },
        },
        codebook,
      });

      expect(description.problems).toContainEqual({
        code: 'invalidOperator',
        message:
          'This rule uses an operator that is not valid for its attribute type. Edit or delete the rule.',
      });
    });

    it('says nothing about an operator the attribute type allows', () => {
      const description = describeRule({
        rule: {
          id: 'rule-19',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'age',
            operator: 'GREATER_THAN',
            value: 3,
          },
        },
        codebook,
      });

      expect(description.problems).toEqual([]);
    });

    it('says nothing about an attribute the codebook no longer describes', () => {
      const description = describeRule({
        rule: {
          id: 'rule-20',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'favouriteColour',
            operator: 'GREATER_THAN',
            value: 3,
          },
        },
        codebook,
      });

      // Nothing is known about what a deleted attribute's operator ought to
      // be, and the deletion is already reported. A second message about the
      // same rule would be one more thing to read and nothing more to do.
      expect(description.problems.map((problem) => problem.code)).toEqual([
        'missingAttribute',
      ]);
    });
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

  /**
   * An operator can survive a retype while the operand it was entered for
   * cannot: both `number` and `categorical` accept `EXACTLY`, but a number
   * answers with a number and a categorical answers with a list of the options
   * that were selected. The protocol schema accepts either shape at `value`,
   * so nothing downstream of the builder catches this.
   */
  describe('an operand the attribute type can no longer be compared against', () => {
    const OPERAND_MESSAGE =
      'This rule compares its attribute against a value of the wrong kind for the attribute’s type. Edit or delete the rule.';

    it('reports a scalar operand left behind by a retype to categorical', () => {
      const description = describeRule({
        rule: {
          id: 'rule-22',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'EXACTLY',
            value: 5,
          },
        },
        codebook,
      });

      expect(description.problems).toContainEqual({
        code: 'invalidOperand',
        message: OPERAND_MESSAGE,
      });
    });

    it('reports a list operand left behind by a retype to number', () => {
      const description = describeRule({
        rule: {
          id: 'rule-23',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'age',
            operator: 'EXACTLY',
            value: ['happy'],
          },
        },
        codebook,
      });

      expect(description.problems.map((problem) => problem.code)).toContain(
        'invalidOperand',
      );
    });

    it('says nothing about an operand the attribute type still reads', () => {
      const description = describeRule({
        rule: {
          id: 'rule-24',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'EXACTLY',
            value: ['happy'],
          },
        },
        codebook,
      });

      expect(description.problems).toEqual([]);
    });

    it('says nothing about an option count, which is a number whatever the attribute is', () => {
      const description = describeRule({
        rule: {
          id: 'rule-25',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'OPTIONS_EQUALS',
            value: 2,
          },
        },
        codebook,
      });

      expect(description.problems).toEqual([]);
    });

    it('says nothing about a single option compared with includes', () => {
      const description = describeRule({
        rule: {
          id: 'rule-26',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'INCLUDES',
            // The runtime compares one option against the stored selection, so
            // a rule authored before the editor emitted a list still matches.
            value: 'happy',
          },
        },
        codebook,
      });

      expect(description.problems).toEqual([]);
    });

    it('says nothing about an attribute the codebook no longer describes', () => {
      const description = describeRule({
        rule: {
          id: 'rule-27',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'favouriteColour',
            operator: 'EXACTLY',
            value: ['happy'],
          },
        },
        codebook,
      });

      // Nothing is known about what a deleted attribute's operand ought to
      // look like, and the deletion is already reported.
      expect(description.problems.map((problem) => problem.code)).toEqual([
        'missingAttribute',
      ]);
    });
  });

  /**
   * The same drift one step finer than a retype. The attribute is still there
   * and still answered by choosing from a list; the operand is still an option
   * value. It is only no longer one of the options this attribute offers,
   * because a collaborator renamed or deleted it — and a rule that reads
   * perfectly and can never match is exactly the kind nothing else reports.
   */
  describe('an operand naming an option the attribute no longer offers', () => {
    const MISSING_OPTION_MESSAGE =
      'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.';

    it('reports an option the codebook has lost', () => {
      const description = describeRule({
        rule: {
          id: 'rule-28',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'EXACTLY',
            value: ['retired'],
          },
        },
        codebook,
      });

      expect(description.problems).toContainEqual({
        code: 'missingOption',
        message: MISSING_OPTION_MESSAGE,
      });
    });

    it('reports one stale option inside a list of good ones', () => {
      const description = describeRule({
        rule: {
          id: 'rule-29',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'INCLUDES',
            value: ['happy', 'retired'],
          },
        },
        codebook,
      });

      expect(description.problems.map((problem) => problem.code)).toEqual([
        'missingOption',
      ]);
    });

    it('says nothing about a rule whose options are all still authored', () => {
      const description = describeRule({
        rule: {
          id: 'rule-30',
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

      expect(description.problems).toEqual([]);
    });

    it('still reads the rule back as a sentence', () => {
      // Reporting is not refusing to describe: the researcher has to be able
      // to see the rule they are being asked to fix, and an option the
      // codebook has lost has no label but its own value.
      const description = describeRule({
        rule: {
          id: 'rule-31',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'EXACTLY',
            value: ['retired'],
          },
        },
        codebook,
      });

      expect(description.text).toBe(
        'Person where Mood is exactly equal to retired',
      );
    });
  });

  describe('a definition the codebook holds without a name', () => {
    /**
     * `name` is a required string in the schema but an empty one is legal, and
     * the editor's own type list already falls back to the id for it. A
     * sentence that does not leaves the preview reading "exists" and the row's
     * edit and delete controls named after nothing.
     */
    const sparseCodebook: Readonly<Codebook> = Object.freeze({
      node: {
        person: {
          name: '',
          color: 'node-color-seq-2',
          shape: { default: 'square' },
        },
      },
      edge: { friend: { name: '' } },
    });

    it('names a node type by its id', () => {
      const description = describeRule({
        rule: {
          id: 'rule-28',
          type: 'node',
          options: { type: 'person', operator: 'EXISTS' },
        },
        codebook: sparseCodebook,
      });

      expect(description.entity?.label).toBe('person');
      expect(description.text).toBe('person exists');
    });

    it('names an edge type by its id', () => {
      const description = describeRule({
        rule: {
          id: 'rule-29',
          type: 'edge',
          options: { type: 'friend', operator: 'NOT_EXISTS' },
        },
        codebook: sparseCodebook,
      });

      expect(description.entity?.label).toBe('friend');
      expect(description.text).toBe('friend does not exist');
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
