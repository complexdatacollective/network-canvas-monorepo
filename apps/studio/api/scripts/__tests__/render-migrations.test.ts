import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { SCHEMA_FINGERPRINT } from '../../src/db/fingerprint.generated.ts';
import {
  MIGRATIONS_DIR,
  MigrationsUnreadable,
  readMigrationsDocument,
} from '../render-migrations.ts';

// The build gate's own refusals (#1901 F-4). The snapshot is never shipped,
// so this is the only place an edited one is caught; it is also the base the
// next `migrate:generate` diffs from, so an edited one would write a wrong
// delta for the next migration with no other signal.

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A copy of the committed migrations, to damage. */
function copied(): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-render-'));
  dirs.push(root);
  const dir = join(root, 'migrations');
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  return dir;
}

function unreadable(dir: string): MigrationsUnreadable {
  try {
    readMigrationsDocument(dir, SCHEMA_FINGERPRINT);
  } catch (error) {
    if (error instanceof MigrationsUnreadable) return error;
    throw error;
  }
  throw new Error('the directory was accepted');
}

describe('render-migrations', () => {
  it('accepts an undamaged copy of the committed migrations', () => {
    const document = readMigrationsDocument(copied(), SCHEMA_FINGERPRINT);
    expect(document.migrations.map(({ version }) => version)).toContain(
      '0001_initial',
    );
  });

  it('refuses an edited snapshot.json, even by a byte', () => {
    const dir = copied();
    appendFileSync(join(dir, '0001_initial', 'snapshot.json'), ' ');
    expect(unreadable(dir).message).toBe(
      'migrations/0001_initial/snapshot.json does not hash to its manifest: the file is damaged or was edited.',
    );
  });

  it('refuses a file no migration carries', () => {
    const dir = copied();
    writeFileSync(join(dir, '0001_initial', 'delta.sql.orig'), '');
    expect(unreadable(dir).message).toBe(
      'migrations/0001_initial holds files no migration carries: delta.sql.orig.',
    );
  });

  it('refuses a directory with no manifest', () => {
    const dir = copied();
    rmSync(join(dir, '0001_initial', 'manifest.json'));
    expect(unreadable(dir).message).toMatch(
      /^migrations\/0001_initial is not sealed \(no manifest\.json\)\. Run: pnpm --filter @codaco\/studio-api migrate:generate --seal$/,
    );
  });

  // #1901 E-11: skipped, a mis-named or half-written migration would drop out
  // of the image without a word.
  it.each(['0002-display-name', '.0002_display_name.pending', 'scratch'])(
    'refuses a directory that is not a migration: %s',
    (name) => {
      const dir = copied();
      mkdirSync(join(dir, name));
      expect(unreadable(dir).message).toBe(
        `migrations/ holds directories that are not migrations: ${name}. A migration directory is named NNNN_<slug>; rename or remove these.`,
      );
    },
  );
});
