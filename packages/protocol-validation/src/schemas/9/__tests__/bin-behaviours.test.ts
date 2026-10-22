import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import { categoricalBinStage } from '../stages/categorical-bin.ts';
import { ordinalBinStage } from '../stages/ordinal-bin.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const ordinalStage = {
  id: 'ordinal',
  type: 'OrdinalBin',
  label: localized('Ordinal'),
  subject: { entity: 'node', type: 'person' },
  prompts: [
    {
      id: 'p1',
      text: localized('How strong?'),
      variable: 'strength',
      color: 'ord-color-seq-1',
    },
  ],
};

const categoricalStage = {
  id: 'categorical',
  type: 'CategoricalBin',
  label: localized('Categorical'),
  subject: { entity: 'node', type: 'person' },
  prompts: [
    { id: 'p1', text: localized('Which category?'), variable: 'category' },
  ],
};

describe.each([
  ['OrdinalBin', ordinalBinStage, ordinalStage],
  ['CategoricalBin', categoricalBinStage, categoricalStage],
] as const)('%s behaviours (#1652)', (_type, schema, stage) => {
  it('parses a stage with no behaviours', () => {
    const result = schema.safeParse(stage);
    expect(result.success).toBe(true);
    expect(result.data?.behaviours).toBeUndefined();
  });

  it.each(['drag', 'select'])('accepts interactionMode %s', (mode) => {
    const result = schema.safeParse({
      ...stage,
      behaviours: { interactionMode: mode },
    });
    expect(result.success).toBe(true);
    expect(result.data?.behaviours?.interactionMode).toBe(mode);
  });

  it('rejects an unknown interaction mode', () => {
    const result = schema.safeParse({
      ...stage,
      behaviours: { interactionMode: 'tap' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown behaviour', () => {
    const result = schema.safeParse({
      ...stage,
      behaviours: { interactionMode: 'select', freeDraw: true },
    });
    expect(result.success).toBe(false);
  });
});

describe('schema 8 bin stages after migration (#1652)', () => {
  it('carry no behaviours, so they keep drag-and-drop', () => {
    const base = createBaseProtocol();
    const migrated = migrateProtocol(
      asSchema8Protocol({ ...base, stages: [ordinalStage, categoricalStage] }),
      9,
    );
    const bins = migrated.stages.filter(
      (stage) => stage.type === 'OrdinalBin' || stage.type === 'CategoricalBin',
    );
    expect(bins).toHaveLength(2);
    for (const stage of bins) {
      expect(stage).not.toHaveProperty('behaviours');
    }
  });
});
