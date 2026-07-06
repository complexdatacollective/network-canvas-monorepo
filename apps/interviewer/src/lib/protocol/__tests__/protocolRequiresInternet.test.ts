import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { protocolRequiresInternet } from '../protocolRequiresInternet';

function makeProtocol(stageTypes: string[]): ProtocolWithCounts {
  const stages = stageTypes.map((type, index) => ({
    id: `stage-${index}`,
    type,
    label: type,
  }));
  const protocol = {
    name: 'Test',
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages,
  } as unknown as CurrentProtocol;
  return {
    id: 'test',
    hash: 'hash',
    name: 'Test',
    schemaVersion: 8,
    importedAt: '2026-07-01T00:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

describe('protocolRequiresInternet', () => {
  it('is true when any stage is Geospatial', () => {
    expect(
      protocolRequiresInternet(makeProtocol(['NameGenerator', 'Geospatial'])),
    ).toBe(true);
  });

  it('is false when no stage is Geospatial', () => {
    expect(
      protocolRequiresInternet(makeProtocol(['NameGenerator', 'Sociogram'])),
    ).toBe(false);
  });

  it('is false for a protocol with no stages', () => {
    expect(protocolRequiresInternet(makeProtocol([]))).toBe(false);
  });
});
