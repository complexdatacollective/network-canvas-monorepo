import { describe, expect, it } from 'vitest';

import type { StoredSessionLite } from '~/lib/db/types';

import { buildDeleteProtocolMessage } from '../deleteProtocolMessage';

function makeSession(overrides: Partial<StoredSessionLite>): StoredSessionLite {
  return {
    id: 's1',
    protocolHash: 'hash',
    protocolName: 'Test Protocol',
    caseId: 'case-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
    exportedAt: '2026-01-02T00:00:00.000Z',
    currentStep: 0,
    statusKind: 'in-progress',
    progressPercent: 0,
    ...overrides,
  };
}

describe('buildDeleteProtocolMessage', () => {
  it('describes a protocol with no sessions', () => {
    const { description, hasUnexported } = buildDeleteProtocolMessage(
      'My Study',
      [],
    );
    expect(hasUnexported).toBe(false);
    expect(description).toBe(
      'The protocol "My Study" will be permanently deleted. This cannot be undone. Do you want to continue?',
    );
  });

  it('mentions exported records that will also be deleted, singular', () => {
    const { description, hasUnexported } = buildDeleteProtocolMessage(
      'My Study',
      [makeSession({ id: 's1' })],
    );
    expect(hasUnexported).toBe(false);
    expect(description).toContain('1 interview record will also be deleted.');
  });

  it('mentions exported records that will also be deleted, plural', () => {
    const { description } = buildDeleteProtocolMessage('My Study', [
      makeSession({ id: 's1' }),
      makeSession({ id: 's2' }),
    ]);
    expect(description).toContain('2 interview records will also be deleted.');
  });

  it('warns about a single unexported record', () => {
    const { description, hasUnexported } = buildDeleteProtocolMessage(
      'My Study',
      [makeSession({ id: 's1', exportedAt: null })],
    );
    expect(hasUnexported).toBe(true);
    expect(description).toBe(
      '1 interview record has not been exported and will be permanently lost if you delete this protocol. Export them first if you want to keep the data. This cannot be undone.',
    );
  });

  it('warns about multiple unexported records, ignoring exported ones in the count', () => {
    const { description, hasUnexported } = buildDeleteProtocolMessage(
      'My Study',
      [
        makeSession({ id: 's1', exportedAt: null }),
        makeSession({ id: 's2', exportedAt: null }),
        makeSession({ id: 's3' }),
      ],
    );
    expect(hasUnexported).toBe(true);
    expect(description).toContain(
      '2 interview records have not been exported and will be permanently lost',
    );
  });
});
