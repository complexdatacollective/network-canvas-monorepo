import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../db';
import type { StoredSessionRow } from '../recordCrypto';
import { querySessions } from '../sessions';

function session(id: string, name: string): StoredSessionRow {
  return {
    id,
    protocolHash: `hash-${id}`,
    protocolName: name,
    caseId: name,
    startedAt: '2026-09-05T00:00:00.000Z',
    lastUpdatedAt: '2026-09-05T00:00:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
  };
}

beforeEach(async () => {
  await db.sessions.clear();
});
afterEach(async () => {
  await db.sessions.clear();
});

describe('administration session sorting', () => {
  it.each(['caseId', 'protocolName'] as const)(
    'uses the requested locale for %s before pagination, preserving raw values',
    async (column) => {
      const source = [session('row-1', 'Ñandú'), session('row-2', 'Nube')];
      await db.sessions.bulkPut(source);
      for (const [locale, first, second] of [
        ['en', 'Ñandú', 'Nube'],
        ['es', 'Nube', 'Ñandú'],
        ['en-GB', 'Ñandú', 'Nube'],
      ] as const) {
        for (const [direction, firstName, secondName] of [
          ['asc', first, second],
          ['desc', second, first],
        ] as const) {
          const options = { locale, sort: { column, direction }, pageSize: 1 };
          const firstPage = await querySessions({ ...options, page: 0 });
          const secondPage = await querySessions({ ...options, page: 1 });
          expect(firstPage.totalCount).toBe(2);
          expect(secondPage.totalCount).toBe(2);
          expect(firstPage.rows.map((row) => row[column])).toEqual([firstName]);
          expect(secondPage.rows.map((row) => row[column])).toEqual([
            secondName,
          ]);
        }
      }
      expect(await db.sessions.toArray()).toEqual(source);
    },
  );

  it('defaults to English without app context and keeps numeric-looking identifiers lexical', async () => {
    await db.sessions.bulkPut([
      session('row-1', 'Ñandú'),
      session('row-2', 'Nube'),
      session('row-3', 'case-2'),
      session('row-4', 'case-10'),
    ]);
    const result = await querySessions({
      sort: { column: 'caseId', direction: 'asc' },
      page: 0,
      pageSize: 10,
    });
    expect(result.rows.map((row) => row.caseId)).toEqual([
      'case-10',
      'case-2',
      'Ñandú',
      'Nube',
    ]);
  });

  it('retains numeric progress, chronological dates, and stable ID tie ordering in Spanish', async () => {
    await db.sessions.bulkPut([
      {
        ...session('row-2', 'Same'),
        progress: 2,
        startedAt: '2026-09-02T00:00:00.000Z',
      },
      {
        ...session('row-1', 'Same'),
        progress: 10,
        startedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        ...session('row-3', 'Same'),
        progress: 2,
        startedAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    for (const [column, expected] of [
      ['progress', ['row-2', 'row-3', 'row-1']],
      ['startedAt', ['row-1', 'row-2', 'row-3']],
      ['caseId', ['row-1', 'row-2', 'row-3']],
    ] as const) {
      const options = {
        locale: 'es',
        sort: { column, direction: 'asc' as const },
        page: 0,
        pageSize: 10,
      };
      const result = await querySessions(options);
      expect(result.rows.map((row) => row.id)).toEqual(expected);
    }
  });
});
