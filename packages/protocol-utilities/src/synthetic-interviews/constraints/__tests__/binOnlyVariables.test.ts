import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { collectBinOnlyVariables } from '../binOnlyVariables';

/**
 * Which node variables a protocol assigns ONLY through a binning stage's
 * prompt — the variables whose declared validation rules the interview
 * therefore never puts in front of a participant.
 *
 * "Only" is the whole of the claim, so most of what follows is about the ways
 * a variable EARNS its rules back: another writer, a form field of its own, a
 * different node type. Getting that wrong in the permissive direction strips
 * rules a participant is actually held to.
 */

const asStages = (stages: Record<string, unknown>[]): Stage[] =>
  stages as unknown as Stage[];

const ordinalBin = ({
  id = 'bin',
  type = 'person',
  variable = 'closeness',
}: { id?: string; type?: string; variable?: string } = {}) => ({
  id,
  type: 'OrdinalBin',
  label: 'Closeness',
  subject: { entity: 'node', type },
  prompts: [
    { id: `${id}-p1`, text: 'How close?', variable, color: 'ord-color-seq-1' },
  ],
});

const categoricalBin = ({
  id = 'cat',
  variable = 'context',
  otherVariable,
}: { id?: string; variable?: string; otherVariable?: string } = {}) => ({
  id,
  type: 'CategoricalBin',
  label: 'Context',
  subject: { entity: 'node', type: 'person' },
  prompts: [
    {
      id: `${id}-p1`,
      text: 'Where from?',
      variable,
      ...(otherVariable
        ? {
            otherVariable,
            otherVariablePrompt: 'Where else?',
            otherOptionLabel: 'Other',
          }
        : {}),
    },
  ],
});

const alterForm = (fields: string[]) => ({
  id: 'form',
  type: 'AlterForm',
  label: 'About them',
  subject: { entity: 'node', type: 'person' },
  form: {
    fields: fields.map((variable) => ({
      variable,
      prompt: `Tell us ${variable}`,
    })),
  },
  introductionPanel: { title: 'About them', text: 'Some detail.' },
});

/** The variable ids collected for one node type, as a sorted array. */
const forType = (stages: Stage[], type = 'person'): string[] =>
  [...(collectBinOnlyVariables(stages).get(type) ?? [])].toSorted();

describe('collectBinOnlyVariables', () => {
  it('collects a variable only an ordinal bin assigns', () => {
    expect(forType(asStages([ordinalBin()]))).toEqual(['closeness']);
  });

  it('collects a variable only a categorical bin assigns', () => {
    expect(forType(asStages([categoricalBin()]))).toEqual(['context']);
  });

  it('collects nothing from a protocol with no binning stages', () => {
    const stages = asStages([alterForm(['closeness'])]);

    expect(collectBinOnlyVariables(stages).size).toBe(0);
  });

  it('collects nothing from a protocol with no stages at all', () => {
    expect(collectBinOnlyVariables([]).size).toBe(0);
  });

  describe('a variable something else also writes', () => {
    it('keeps its rules when a form collects it too', () => {
      // The form field is where a participant would be shown the error, so the
      // rules are enforced somewhere and must hold for every value.
      const stages = asStages([ordinalBin(), alterForm(['closeness'])]);

      expect(forType(stages)).toEqual([]);
    });

    it('keeps its rules when another bin prompt is not its only writer', () => {
      const stages = asStages([
        ordinalBin({ variable: 'closeness' }),
        alterForm(['closeness', 'age']),
      ]);

      expect(forType(stages)).toEqual([]);
    });

    it('strips only the variable the other writer does not touch', () => {
      const stages = asStages([
        ordinalBin({ id: 'bin-a', variable: 'closeness' }),
        ordinalBin({ id: 'bin-b', variable: 'frequency' }),
        alterForm(['closeness']),
      ]);

      expect(forType(stages)).toEqual(['frequency']);
    });

    it('keeps a quick-add variable’s rules', () => {
      // A quick-add field IS a form field: the participant types into it and
      // is held to its rules.
      const stages = asStages([
        ordinalBin({ variable: 'name' }),
        {
          id: 'ngqa',
          type: 'NameGeneratorQuickAdd',
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          prompts: [{ id: 'p1', text: 'Who do you know?' }],
        },
      ]);

      expect(forType(stages)).toEqual([]);
    });
  });

  describe('references that are not a bin prompt’s own variable', () => {
    it('keeps the rules on a categorical prompt’s other-variable', () => {
      // The "other" follow-up renders a real field with a real validation
      // message, unlike the bins beside it.
      const stages = asStages([
        categoricalBin({ variable: 'context', otherVariable: 'contextOther' }),
      ]);

      expect(forType(stages)).toEqual(['context']);
    });

    it('leaves a read-only reference out of the reckoning', () => {
      // A stage filter reads the variable; it does not put it in front of
      // anyone, so it neither strips rules nor earns them back.
      const stages = asStages([
        {
          ...ordinalBin(),
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'rule-1',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'closeness',
                  operator: 'GREATER_THAN',
                  value: 1,
                },
              },
            ],
          },
        },
      ]);

      expect(forType(stages)).toEqual(['closeness']);
    });
  });

  describe('subjects other than the binning stage’s own', () => {
    it('keys each node type separately', () => {
      const stages = asStages([
        ordinalBin({ id: 'bin-a', type: 'person', variable: 'closeness' }),
        ordinalBin({ id: 'bin-b', type: 'place', variable: 'distance' }),
      ]);

      expect(forType(stages, 'person')).toEqual(['closeness']);
      expect(forType(stages, 'place')).toEqual(['distance']);
    });

    it('does not let one node type’s writer speak for another’s', () => {
      const stages = asStages([
        ordinalBin({ id: 'bin-a', type: 'person', variable: 'closeness' }),
        ordinalBin({ id: 'bin-b', type: 'place', variable: 'closeness' }),
        alterForm(['closeness']),
      ]);

      // The form is a `person` stage, so only `person` gets its rules back.
      expect(forType(stages, 'person')).toEqual([]);
      expect(forType(stages, 'place')).toEqual(['closeness']);
    });

    it('collects nothing for an edge variable', () => {
      // Both binning interfaces take a node subject, so an edge variable can
      // never be one of their prompt variables.
      const stages = asStages([
        {
          id: 'tie',
          type: 'TieStrengthCensus',
          label: 'Tie strength',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'p1',
              text: 'How strong?',
              createEdge: 'friend',
              edgeVariable: 'strength',
              negativeLabel: 'Not close',
            },
          ],
        },
      ]);

      expect(collectBinOnlyVariables(stages).size).toBe(0);
    });
  });
});
