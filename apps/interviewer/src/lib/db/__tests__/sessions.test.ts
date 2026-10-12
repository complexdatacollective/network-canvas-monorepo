import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { deriveProgressPercent } from '../sessions';
import type { StoredSession } from '../types';

const baseSession: StoredSession = {
  id: 's',
  protocolHash: 'h',
  protocolName: 'Protocol',
  caseId: 'case-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 0,
  network: {
    ego: {
      [entityPrimaryKeyProperty]: 'ego',
      [entityAttributesProperty]: {},
    },
    nodes: [],
    edges: [],
  },
};

describe('deriveProgressPercent', () => {
  it('returns the persisted participant-facing progress', () => {
    expect(deriveProgressPercent({ ...baseSession, progress: 42 })).toBe(42);
  });

  it('returns 100 for a finished session regardless of stored progress', () => {
    expect(
      deriveProgressPercent({
        ...baseSession,
        finishedAt: '2026-01-02T00:00:00.000Z',
        progress: 30,
      }),
    ).toBe(100);
  });

  it('falls back to 0 when progress is absent (legacy row)', () => {
    expect(deriveProgressPercent(baseSession)).toBe(0);
  });
});
