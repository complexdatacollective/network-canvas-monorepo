import { describe, expect, it } from 'vitest';

import developmentProtocol from '@codaco/development-protocol';
import type { VersionedProtocol } from '@codaco/protocol-validation';

import { validateAndMigrateProtocol } from '../validateAndMigrateProtocol';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const developmentProtocolWithLegacyColors = (): VersionedProtocol => {
  const document: unknown = structuredClone(developmentProtocol);
  if (!isRecord(document)) {
    throw new Error('Development protocol fixture has no stages');
  }
  const stages = document.stages;
  if (!Array.isArray(stages)) {
    throw new Error('Development protocol fixture has no stages');
  }

  const findStage = (type: string): UnknownRecord => {
    const stage = stages.find(
      (candidate) => isRecord(candidate) && candidate.type === type,
    );
    if (!isRecord(stage)) throw new Error(`Missing ${type} fixture stage`);
    return stage;
  };

  const narrative = findStage('NarrativePedigree');
  if (!Array.isArray(narrative.diseases) || !isRecord(narrative.diseases[0])) {
    throw new Error('Narrative Pedigree fixture has no disease');
  }
  narrative.diseases[0].color = '#cc0000';

  const geospatial = findStage('Geospatial');
  if (!isRecord(geospatial.mapOptions)) {
    throw new Error('Geospatial fixture has no map options');
  }
  geospatial.mapOptions.color = '#3399ff';

  return document as unknown as VersionedProtocol;
};

describe('validateAndMigrateProtocol', () => {
  it('repairs shipped colors before admitting a current-version protocol', async () => {
    const result = await validateAndMigrateProtocol(
      developmentProtocolWithLegacyColors(),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(`Expected validation success, received ${result.error}`);
    }
    const narrative = result.protocol.stages.find(
      (stage) => stage.type === 'NarrativePedigree',
    );
    const geospatial = result.protocol.stages.find(
      (stage) => stage.type === 'Geospatial',
    );
    expect(narrative).toMatchObject({
      diseases: [{ color: 'node-color-seq-1' }],
    });
    expect(geospatial).toMatchObject({
      mapOptions: { color: 'ord-color-seq-6' },
    });
  });
});
