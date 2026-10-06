import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateDrizzleJson } from 'drizzle-kit/api-postgres';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { MIGRATIONS_DIR } from '../../../scripts/render-migrations.ts';
import { committedDocument } from '../../__tests__/support/migrations.ts';
import { renderJobStatements } from '../../jobs/queues.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import { SCHEMA, SIDECARS } from '../schema.ts';
import { splitStatements } from '../statements.ts';

// The vitest twin of the build gate in `scripts/render-migrations.ts`: every
// schema change on main is a numbered migration. A Drizzle, sidecar or job
// schema change that ran `sync-fingerprint` but not `migrate:generate` fails
// here, naming the command.

const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));

const newest = committedDocument().migrations.at(-1);

const sidecarsNow = () => [...SIDECARS, ...renderJobStatements()];

describe('the newest migration', () => {
  it('exists', () => {
    expect(newest).toBeDefined();
  });

  it('records this build’s fingerprint', () => {
    expect(
      newest?.manifest.fingerprint,
      'the schema changed without a migration; run: pnpm --filter @codaco/studio-api migrate:generate --name <slug>',
    ).toBe(SCHEMA_FINGERPRINT);
  });

  it('snapshots the current Drizzle schema', async () => {
    const snapshot: unknown = JSON.parse(
      readFileSync(
        join(MIGRATIONS_DIR, newest?.version ?? '(none)', 'snapshot.json'),
        'utf8',
      ),
    );
    const current = await generateDrizzleJson(SCHEMA);
    expect(current.ddl.length).toBeGreaterThan(0);
    expect(snapshot).toMatchObject({ ddl: current.ddl });
    expect(Reflect.get(Object(snapshot), 'ddl')).toHaveLength(
      current.ddl.length,
    );
  }, 120_000);

  it('carries the current sidecars, verbatim', () => {
    const sidecars = newest?.artefacts.find(
      ({ name }) => name === 'sidecars.sql',
    );
    expect(sidecars?.sql).toBe(sidecarsNow().join('\n'));
  });
});

describe('the sidecars a migration carries', () => {
  // `sidecars.sql` is the sidecars joined with newlines and executed through
  // `splitStatements`; the fingerprint hashes them one by one. The two agree
  // only while every block ends its last statement with a semicolon.
  it('split the same joined as one by one', () => {
    const blocks = sidecarsNow();
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.trimEnd().endsWith(';'), block.slice(0, 80)).toBe(true);
    }
    expect(splitStatements(blocks.join('\n'))).toEqual(
      blocks.flatMap((block) => splitStatements(block)),
    );
  });
});

describe('drizzle-kit', () => {
  // A drizzle-kit upgrade can change what the same schema renders to, or the
  // snapshot format the next migration diffs against, so it moves only by a
  // deliberate edit of the catalog (#1901 N-6).
  const Workspace = Schema.Struct({
    catalog: Schema.Struct({ 'drizzle-kit': Schema.String }),
  });

  it('is pinned to one exact version, and that version is installed', () => {
    const pinned = Schema.decodeUnknownSync(Workspace)(
      parseYaml(readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')),
    ).catalog['drizzle-kit'];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

    const installed = Schema.decodeUnknownSync(
      Schema.Struct({ version: Schema.String }),
    )(
      JSON.parse(
        readFileSync(
          new URL(
            '../../../node_modules/drizzle-kit/package.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    ).version;
    expect(installed).toBe(pinned);
  });
});
