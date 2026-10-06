import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { ownedScratchDatabaseForTest } from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { OwnerDatabase } from '../client.ts';
import {
  createHistoryTable,
  historyVerdict,
  type ImageMigration,
  readHistory,
  recordApplied,
  type RecordedMigration,
  refusalFor,
} from '../history.ts';
import { hashArtefacts, migrationVersion } from '../migrations-document.ts';
import { OwnerScope } from '../tenant.ts';

function imageMigration(
  ordinal: number,
  slug: string,
  delta = `-- ${slug}`,
): ImageMigration {
  const { artefacts, combined } = hashArtefacts({
    'delta.sql': delta,
    'sidecars.sql': 'select 1;',
    'snapshot.json': '{}',
  });
  return {
    version: migrationVersion(ordinal, slug),
    ordinal,
    artefacts,
    combined,
  };
}

const APPLIED_AT = new Date('2026-09-01T12:00:00.000Z');

function recordedAs(migration: ImageMigration): RecordedMigration {
  return {
    version: migration.version,
    ordinal: migration.ordinal,
    manifestHash: migration.combined,
    artefactHashes: migration.artefacts,
    appliedAt: APPLIED_AT,
    appliedBy: '1.2.3',
  };
}

const first = imageMigration(1, 'initial');
const second = imageMigration(2, 'second');
const third = imageMigration(3, 'third');

describe('the history verdict', () => {
  it('returns exactly the pending set after a clean prefix', () => {
    expect(historyVerdict([], [first, second])).toEqual({
      kind: 'pending',
      pending: [first, second],
    });
    expect(historyVerdict([recordedAs(first)], [first, second, third])).toEqual(
      { kind: 'pending', pending: [second, third] },
    );
    expect(
      historyVerdict([recordedAs(first), recordedAs(second)], [first, second]),
    ).toEqual({ kind: 'pending', pending: [] });
  });

  it('refuses a recorded migration this image does not carry, as newer', () => {
    const verdict = historyVerdict(
      [recordedAs(first), recordedAs(second)],
      [first],
    );
    expect(verdict).toMatchObject({
      kind: 'newer',
      recorded: { version: second.version },
    });
    if (verdict.kind === 'pending') throw new Error('expected a refusal');
    const message = refusalFor(verdict).message;
    expect(message).toContain('migrated by a newer Studio');
    expect(message).toContain(
      `${second.version} applied 2026-09-01T12:00:00.000Z`,
    );
    expect(message).toContain(
      'Run that image or a newer one, or restore the backup taken before the upgrade',
    );
  });

  it('refuses a different migration at a recorded position, as reordered', () => {
    const renamed = imageMigration(2, 'renamed');
    const verdict = historyVerdict(
      [recordedAs(first), recordedAs(second)],
      [first, renamed, third],
    );
    expect(verdict).toMatchObject({
      kind: 'reordered',
      recorded: { version: second.version },
      image: { version: renamed.version },
    });
  });

  it('refuses a moved migration even when every artefact hashes the same', () => {
    // Same bytes under another name and position: only the version-at-position
    // comparison can see it, because the combined hash is identical.
    const moved = { ...second, version: migrationVersion(2, 'moved') };
    expect(moved.combined).toBe(second.combined);
    const verdict = historyVerdict(
      [recordedAs(first), recordedAs(second)],
      [first, moved],
    );
    expect(verdict.kind).toBe('reordered');
    if (verdict.kind === 'pending') throw new Error('expected a refusal');
    expect(refusalFor(verdict).message).toContain('Deploy the released image');
  });

  it('refuses an edited artefact, naming it', () => {
    const edited = imageMigration(2, 'second', '-- second, edited');
    const verdict = historyVerdict(
      [recordedAs(first), recordedAs(second)],
      [first, edited, third],
    );
    expect(verdict).toMatchObject({
      kind: 'edited',
      recorded: { version: second.version },
      artefact: 'delta.sql',
    });
    if (verdict.kind === 'pending') throw new Error('expected a refusal');
    const message = refusalFor(verdict).message;
    expect(message).toContain(
      `migration ${second.version} is not the one applied`,
    );
    expect(message).toContain('delta.sql');
    expect(message).toContain('Deploy the released image');
  });

  it('refuses a recorded combined hash that the image does not carry', () => {
    const verdict = historyVerdict(
      [{ ...recordedAs(first), manifestHash: 'f'.repeat(64) }],
      [first],
    );
    expect(verdict).toMatchObject({
      kind: 'edited',
      artefact: 'manifest.json',
    });
  });
});

const db = await reachableDb();

describe.skipIf(!db)('the history table', () => {
  it('records what was applied and reads it back in order', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await ownedScratchDatabaseForTest(db);

    const rows = await Effect.runPromise(
      OwnerScope.open(
        Effect.gen(function* () {
          yield* createHistoryTable();
          yield* recordApplied(second, '1.2.3');
          yield* recordApplied(first, '1.2.3');
          return yield* readHistory();
        }),
      ).pipe(Effect.provide(OwnerDatabase.layer(scratch.db))),
    );

    expect(rows.map(({ appliedAt: _appliedAt, ...row }) => row)).toEqual(
      [first, second].map((migration) => {
        const { appliedAt: _appliedAt, ...row } = recordedAs(migration);
        return row;
      }),
    );
    expect(historyVerdict(rows, [first, second, third])).toEqual({
      kind: 'pending',
      pending: [third],
    });
  }, 60_000);
});
