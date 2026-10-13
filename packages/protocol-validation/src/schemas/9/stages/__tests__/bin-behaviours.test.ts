import { describe, expect, it } from 'vitest';

import { localized } from '../../../../utils/test-utils.ts';
import {
  inapplicableStageSettings,
  missingRequiredStageSettings,
  missingSuppliedStageText,
} from '../../supplied-stage-text.ts';
import { categoricalBinStage } from '../categorical-bin.ts';
import { ordinalBinStage } from '../ordinal-bin.ts';

const ENGLISH_ONLY = { defaultLocale: 'en', locales: ['en'] };

const ordinalBin = {
  id: 'ordinal',
  type: 'OrdinalBin' as const,
  label: localized('Ordinal'),
  subject: { entity: 'node' as const, type: 'person' },
  prompts: [
    {
      id: 'p1',
      text: localized('How close?'),
      variable: 'closeness',
      color: 'ord-color-seq-1',
    },
  ],
};

const categoricalBin = {
  id: 'categorical',
  type: 'CategoricalBin' as const,
  label: localized('Categorical'),
  subject: { entity: 'node' as const, type: 'person' },
  prompts: [{ id: 'p1', text: localized('Which group?'), variable: 'group' }],
};

describe.each([
  ['OrdinalBin', ordinalBinStage, ordinalBin],
  ['CategoricalBin', categoricalBinStage, categoricalBin],
] as const)('%s behaviours', (_type, schema, stage) => {
  it('accepts a stage with no behaviours, which keeps today’s behaviour', () => {
    expect(schema.safeParse(stage).success).toBe(true);
  });

  it('accepts both interaction modes', () => {
    for (const interactionMode of ['drag', 'select']) {
      expect(
        schema.safeParse({ ...stage, behaviours: { interactionMode } }).success,
      ).toBe(true);
    }
  });

  it('refuses an unknown behaviour', () => {
    expect(
      schema.safeParse({ ...stage, behaviours: { requireAll: true } }).success,
    ).toBe(false);
  });

  it('refuses the completion gate without its notice', () => {
    const result = schema.safeParse({
      ...stage,
      behaviours: { requireCompletePlacement: true },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['unplacedNodesNotice'],
    ]);
  });

  it('accepts the completion gate with its notice', () => {
    expect(
      schema.safeParse({
        ...stage,
        behaviours: { requireCompletePlacement: true },
        unplacedNodesNotice: localized('Place everyone first.'),
      }).success,
    ).toBe(true);
  });

  it('needs no notice while the gate is off', () => {
    expect(
      schema.safeParse({
        ...stage,
        behaviours: { requireCompletePlacement: false },
      }).success,
    ).toBe(true);
  });

  it('seeds the notice when the gate is switched on, and only then', () => {
    const gated = { ...stage, behaviours: { requireCompletePlacement: true } };
    expect(missingRequiredStageSettings(gated)).toEqual([
      ['unplacedNodesNotice'],
    ]);
    expect(missingSuppliedStageText(gated, ENGLISH_ONLY)).toEqual([
      {
        path: ['unplacedNodesNotice'],
        value: { en: 'You must place every item before you can continue.' },
      },
    ]);
    expect(missingSuppliedStageText(stage, ENGLISH_ONLY)).toEqual([]);
  });

  it('drops the notice when the gate is switched off', () => {
    expect(
      inapplicableStageSettings({
        ...stage,
        behaviours: { requireCompletePlacement: false },
        unplacedNodesNotice: localized('Place everyone first.'),
      }),
    ).toEqual([['unplacedNodesNotice']]);
  });
});
