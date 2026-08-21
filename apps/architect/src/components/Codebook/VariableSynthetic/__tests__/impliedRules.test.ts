import { describe, expect, it } from 'vitest';

import {
  missingProbabilityDisabledReason,
  selectionCountDisabledReason,
  variableImpliedRules,
} from '../impliedRules';

/**
 * The implied rules and their provenance, against the REAL collector.
 *
 * The rules themselves are the schema's to decide; what this file guards is
 * that the editor asks it correctly, and that it can name the stage a rule
 * came from — which it derives by running the same collector over one stage at
 * a time rather than by knowing which interfaces impose what.
 */

const PERSON = { entity: 'node' as const, type: 'person' };

const quickAddStage = (label: string) => ({
  id: 'qa',
  type: 'NameGeneratorQuickAdd',
  label,
  subject: PERSON,
  quickAdd: 'name',
});

const categoricalBinStage = (label: string) => ({
  id: 'bin',
  type: 'CategoricalBin',
  label,
  subject: PERSON,
  prompts: [
    {
      id: 'p1',
      variable: 'hobbies',
      text: 'Sort them',
      bucketSortOrder: [],
      binSortOrder: [],
    },
  ],
});

const ordinalBinStage = (label: string) => ({
  id: 'obin',
  type: 'OrdinalBin',
  label,
  subject: PERSON,
  prompts: [
    {
      id: 'p2',
      variable: 'rank',
      text: 'Rank them',
      color: 'ord-color-seq-1',
    },
  ],
});

const formStage = (label: string, variable: string) => ({
  id: 'form',
  type: 'AlterForm',
  label,
  subject: PERSON,
  form: { fields: [{ variable }] },
});

describe('what a protocol’s interfaces imply about a variable', () => {
  it('names the quick-add generator that answers a variable on every node', () => {
    const implied = variableImpliedRules(
      { stages: [quickAddStage('Quick Add Name Generator')] },
      PERSON,
      'name',
    );

    expect(implied.rules).toEqual({ required: true });
    expect(implied.alwaysAnsweredBy).toEqual(['Quick Add Name Generator']);
    expect(implied.selectionPinnedBy).toEqual([]);
  });

  it('names the categorical bin that fixes both the answer and its size', () => {
    const implied = variableImpliedRules(
      { stages: [categoricalBinStage('Contact Types')] },
      PERSON,
      'hobbies',
    );

    expect(implied.rules).toEqual({ maxSelected: 1, required: true });
    expect(implied.alwaysAnsweredBy).toEqual(['Contact Types']);
    expect(implied.selectionPinnedBy).toEqual(['Contact Types']);
    expect(implied.binOnly).toBe(true);
  });

  it('reads an ordinal bin as answering without fixing a selection size', () => {
    const implied = variableImpliedRules(
      { stages: [ordinalBinStage('Closeness')] },
      PERSON,
      'rank',
    );

    expect(implied.rules).toEqual({ required: true });
    expect(implied.alwaysAnsweredBy).toEqual(['Closeness']);
    expect(implied.selectionPinnedBy).toEqual([]);
  });

  it('stops calling a variable bin-only once a form also writes it', () => {
    const implied = variableImpliedRules(
      {
        stages: [
          categoricalBinStage('Contact Types'),
          formStage('About them', 'hobbies'),
        ],
      },
      PERSON,
      'hobbies',
    );

    expect(implied.rules).toEqual({ maxSelected: 1, required: true });
    expect(implied.binOnly).toBe(false);
  });

  it('collects every stage that implies the same rule', () => {
    const implied = variableImpliedRules(
      {
        stages: [
          quickAddStage('First names'),
          { ...quickAddStage('Nicknames'), id: 'qa2' },
        ],
      },
      PERSON,
      'name',
    );

    expect(implied.alwaysAnsweredBy).toEqual(['First names', 'Nicknames']);
  });

  it('implies nothing about a variable no interface writes', () => {
    const implied = variableImpliedRules(
      { stages: [quickAddStage('Quick Add')] },
      PERSON,
      'religion',
    );

    expect(implied.rules).toEqual({});
    expect(implied.alwaysAnsweredBy).toEqual([]);
  });

  it('implies nothing about a variable of a different type', () => {
    const implied = variableImpliedRules(
      { stages: [quickAddStage('Quick Add')] },
      { entity: 'node', type: 'place' },
      'name',
    );

    expect(implied.rules).toEqual({});
  });

  it('implies nothing where there is no protocol, or no variable', () => {
    expect(variableImpliedRules(undefined, PERSON, 'name').rules).toEqual({});
    expect(
      variableImpliedRules({ stages: [quickAddStage('Q')] }, PERSON, undefined)
        .rules,
    ).toEqual({});
  });
});

describe('the sentence a disabled missingness control shows', () => {
  it('says nothing where missingness is authorable', () => {
    expect(missingProbabilityDisabledReason(false, [])).toBeUndefined();
  });

  it('names one stage where one stage is responsible', () => {
    expect(
      missingProbabilityDisabledReason(true, ['Quick Add Name Generator']),
    ).toBe(
      'Always answered — ‘Quick Add Name Generator’ cannot leave this attribute blank, so it is never missing.',
    );
  });

  it('speaks of the stages where several are responsible', () => {
    expect(missingProbabilityDisabledReason(true, ['One', 'Two'])).toBe(
      'Always answered — the stages that collect this attribute cannot leave it blank, so it is never missing.',
    );
  });

  it('falls back to the variable’s own rule where no stage implies it', () => {
    expect(missingProbabilityDisabledReason(true, [])).toBe(
      'Always answered — this attribute is required, so it is never missing.',
    );
  });
});

describe('the sentence a disabled selection-count control shows', () => {
  it('says nothing where more than one size is reachable', () => {
    expect(
      selectionCountDisabledReason(undefined, ['Contact Types']),
    ).toBeUndefined();
  });

  it('names the bin that assigns exactly one option', () => {
    expect(selectionCountDisabledReason(1, ['Contact Types'])).toBe(
      'Single choice — ‘Contact Types’ assigns exactly one option, so the number of selections cannot vary.',
    );
  });

  it('describes a fixed size that is not one', () => {
    expect(selectionCountDisabledReason(2, ['Contact Types'])).toBe(
      'Fixed selection — ‘Contact Types’ always assigns the same number of options, so the number of selections cannot vary.',
    );
  });

  it('falls back to the variable’s own rules where no stage pins the size', () => {
    expect(selectionCountDisabledReason(1, [])).toBe(
      'Single choice — this attribute’s own rules allow exactly one option to be selected, so the number of selections cannot vary.',
    );
  });
});
