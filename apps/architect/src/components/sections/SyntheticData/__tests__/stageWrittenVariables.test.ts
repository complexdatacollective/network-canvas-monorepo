import { describe, expect, it } from 'vitest';

import { stagePrimaryWrittenVariables } from '../stageWrittenVariables';

/**
 * Which attributes a stage writes through a slot of its own — the list the
 * Synthetic data section embeds a variable sub-editor for.
 *
 * Every fixture here is a stage the editor could actually hold, and the
 * assertions are about the SHAPE of the answer rather than about stage types:
 * a slot the stage carries in its own right is in, and everything further down
 * (form fields, additional attributes, layout) is out.
 */

const SUBJECT = { entity: 'node', type: 'person' } as const;

const quickAddStage = {
  id: 'stage-1',
  type: 'NameGeneratorQuickAdd',
  label: 'Add people',
  subject: SUBJECT,
  quickAdd: 'name-variable',
  prompts: [{ id: 'p1', text: 'Who do you know?' }],
};

const ordinalBinStage = {
  id: 'stage-2',
  type: 'OrdinalBin',
  label: 'How close?',
  subject: SUBJECT,
  prompts: [
    {
      id: 'p1',
      text: 'How close are they?',
      variable: 'closeness-variable',
      color: 'ord-color-seq-1',
      bucketSortOrder: [],
      binSortOrder: [],
    },
  ],
};

const nameGeneratorStage = {
  id: 'stage-3',
  type: 'NameGenerator',
  label: 'Name people',
  subject: SUBJECT,
  form: {
    title: 'Add a person',
    fields: [{ variable: 'name-variable', prompt: 'Their name' }],
  },
  prompts: [
    {
      id: 'p1',
      text: 'Who do you know?',
      additionalAttributes: [{ variable: 'is-close-variable', value: true }],
    },
  ],
};

const sociogramStage = {
  id: 'stage-4',
  type: 'Sociogram',
  label: 'Position people',
  subject: SUBJECT,
  background: { concentricCircles: 4, skewedTowardCenter: true },
  prompts: [
    {
      id: 'p1',
      text: 'Position them',
      layout: { layoutVariable: 'layout-variable' },
      highlight: [{ variable: 'is-close-variable', allowHighlighting: true }],
    },
  ],
};

const ids = (stage: Record<string, unknown>) =>
  stagePrimaryWrittenVariables(stage).map((entry) => entry.variableId);

describe('stagePrimaryWrittenVariables', () => {
  it('finds a quick-add stage’s own attribute', () => {
    expect(stagePrimaryWrittenVariables(quickAddStage)).toEqual([
      { variableId: 'name-variable', subject: SUBJECT, path: 'quickAdd' },
    ]);
  });

  it('finds a bin prompt’s bound attribute', () => {
    expect(stagePrimaryWrittenVariables(ordinalBinStage)).toEqual([
      {
        variableId: 'closeness-variable',
        subject: SUBJECT,
        path: 'prompts.0.variable',
      },
    ]);
  });

  it('leaves form fields and additional attributes to the codebook', () => {
    // Both are writers the schema tags, and both would turn a stage editor
    // into a codebook screen. `name-variable` is a form field here — the very
    // same attribute the quick-add stage above DOES claim, which is what makes
    // this an assertion about the slot rather than about the attribute.
    expect(ids(nameGeneratorStage)).toEqual([]);
  });

  it('leaves a sociogram’s layout and tap-to-highlight out', () => {
    expect(ids(sociogramStage)).toEqual([]);
  });

  it('reports one entry for an attribute two prompts bind', () => {
    const twoPrompts = {
      ...ordinalBinStage,
      prompts: [
        ordinalBinStage.prompts[0],
        { ...ordinalBinStage.prompts[0], id: 'p2' },
      ],
    };

    // Two rows would be two controls writing one codebook key.
    expect(ids(twoPrompts)).toEqual(['closeness-variable']);
  });

  it('reports nothing for a stage that binds no attribute of its own', () => {
    expect(
      ids({
        id: 'stage-5',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [],
      }),
    ).toEqual([]);
  });

  it('reports nothing for a draft whose slot is still empty', () => {
    // A quick-add stage before the researcher has picked an attribute: the
    // section must render no sub-editor rather than one for `''`.
    const { quickAdd: _unset, ...unbound } = quickAddStage;
    expect(ids(unbound)).toEqual([]);
  });
});
