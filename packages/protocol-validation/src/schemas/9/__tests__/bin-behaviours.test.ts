import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
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
