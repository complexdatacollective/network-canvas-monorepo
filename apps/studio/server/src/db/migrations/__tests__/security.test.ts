import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier, Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  createScratchDatabase,
  reachableDb,
} from '../../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../fingerprint.generated.ts';
import { jsonHash, readMigrations, sha256 } from '../artifact.ts';
import { migrateDatabase } from '../migrate.ts';
import { enforceMigrationSecurity } from '../security.ts';

const database = await reachableDb();
const shipped = await readMigrations(
  fileURLToPath(new URL('../../../../migrations', import.meta.url)),
);
const password = 'isolated-migration-security-test';

async function withDeployment(
  run: (deployment: {
    administrator: Pool;
    owner: Pool;
    url: URL;
    logins: [string, string];
    databaseName: string;
  }) => Promise<void>,
) {
  if (!database)
    throw new Error('Database required for migration security tests.');
  // Quoted, deployment-specific identities exercise actual SQL identifier handling.
  const suffix = randomUUID().replaceAll('-', '');
  const logins: [string, string] = [`migrator-${suffix}`, `runtime"${suffix}`];
  const administrator = new Pool({ connectionString: database.url });
  const scratch = await createScratchDatabase(database);
  const url = new URL(scratch.db.url);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  let owner: Pool | undefined;
  try {
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS false`,
    );
    for (const login of logins) {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
      );
      await administrator.query(
        `GRANT studio_app, studio_maintenance TO ${escapeIdentifier(login)} WITH SET TRUE, INHERIT FALSE`,
      );
    }
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} OWNER TO ${escapeIdentifier(logins[0])}`,
    );
    await administrator.query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM PUBLIC, studio_app, studio_maintenance;
      GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${logins.map(escapeIdentifier).join(', ')}`);
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS true`,
    );
    url.username = logins[0];
    url.password = password;
    owner = new Pool({ connectionString: url.href });
    await run({
      administrator: scratch.pool,
      owner,
      url,
      logins,
      databaseName,
    });
  } finally {
    await owner?.end();
    await scratch.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${logins.map(escapeIdentifier).join(', ')}`,
    );
    await administrator.end();
  }
}

async function connectAs(
  url: URL,
  login: string,
  options: string | undefined,
  run: (pool: Pool) => Promise<void>,
) {
  const target = new URL(url);
  target.username = login;
  if (options) target.searchParams.set('options', options);
  const pool = new Pool({
    connectionString: target.href,
    connectionTimeoutMillis: 1500,
  });
  try {
    await run(pool);
  } finally {
    await pool.end();
  }
}

describe.skipIf(!database)('migration security invariants', () => {
  it('keeps fingerprint evidence readable but refuses every runtime write, including after a no-op repair', async () => {
    await withDeployment(async ({ administrator, owner, url, logins }) => {
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      const before = (
        await administrator.query('SELECT * FROM public."schemaFingerprint"')
      ).rows;
      for (const repair of [false, true]) {
        if (repair) {
          await administrator.query(
            'GRANT ALL ON public."schemaFingerprint" TO PUBLIC, studio_app, studio_maintenance; GRANT UPDATE (fingerprint) ON public."schemaFingerprint" TO PUBLIC, studio_app, studio_maintenance',
          );
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        }
        for (const role of ['studio_app', 'studio_maintenance']) {
          await connectAs(url, logins[1], `-c role=${role}`, async (pool) => {
            expect(
              (await pool.query('SELECT * FROM public."schemaFingerprint"'))
                .rows,
            ).toEqual(before);
            for (const sql of [
              'UPDATE public."schemaFingerprint" SET fingerprint = \'forged\'',
              'DELETE FROM public."schemaFingerprint"',
              'TRUNCATE public."schemaFingerprint"',
              'INSERT INTO public."schemaFingerprint" (fingerprint) VALUES (\'forged\')',
            ]) {
              await expect(pool.query(sql)).rejects.toMatchObject({
                code: '42501',
              });
            }
          });
        }
      }
      expect(
        (await administrator.query('SELECT * FROM public."schemaFingerprint"'))
          .rows,
      ).toEqual(before);
    });
  });

  it('refuses cross-deployment connections from both owner and runtime logins, even with hostile startup roles', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        await migrateDatabase(
          first.owner,
          shipped,
          SCHEMA_FINGERPRINT,
          first.logins,
        );
        await migrateDatabase(
          second.owner,
          shipped,
          SCHEMA_FINGERPRINT,
          second.logins,
        );
        for (const deployment of [first, second]) {
          for (const login of deployment.logins) {
            await connectAs(
              deployment.url,
              login,
              '-c role=studio_app',
              async (pool) => {
                expect(
                  (
                    await pool.query(
                      'SELECT count(*)::int AS count FROM public."user"',
                    )
                  ).rows,
                ).toEqual([{ count: 0 }]);
              },
            );
          }
        }
        for (const [source, target] of [
          [first, second],
          [second, first],
        ] as const) {
          for (const login of source.logins) {
            for (const role of [
              undefined,
              'studio_app',
              'studio_maintenance',
              target.logins[0],
            ]) {
              await connectAs(
                target.url,
                login,
                role ? `-c role=${role}` : undefined,
                async (pool) => {
                  await expect(
                    pool.query('SELECT * FROM public."user"'),
                  ).rejects.toMatchObject({ code: '42501' });
                },
              );
            }
          }
        }
      });
    });
  });

  it.each([false, true])(
    'refuses a retained outside connection after CONNECT revocation (already migrated=%s)',
    async (alreadyMigrated) => {
      await withDeployment(async (first) => {
        await withDeployment(async (second) => {
          if (alreadyMigrated)
            await migrateDatabase(
              second.owner,
              shipped,
              SCHEMA_FINGERPRINT,
              second.logins,
            );
          const before = (
            await second.administrator.query(
              "SELECT to_regclass('public.teams')::text AS table",
            )
          ).rows;
          // Reproduce an older publicly connectable database, then commit the
          // corrected ACL while retaining an already authenticated outside session.
          await second.administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} TO PUBLIC`,
          );
          await connectAs(
            second.url,
            first.logins[1],
            '-c role=studio_app',
            async (outside) => {
              expect(
                (await outside.query('SELECT 1 AS connected')).rows,
              ).toEqual([{ connected: 1 }]);
              await second.administrator.query(
                `REVOKE CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} FROM PUBLIC`,
              );
              expect(
                (
                  await second.administrator.query(
                    "SELECT has_database_privilege($1, current_database(), 'CONNECT') AS allowed",
                    [first.logins[1]],
                  )
                ).rows,
              ).toEqual([{ allowed: false }]);
              await expect(
                migrateDatabase(
                  second.owner,
                  shipped,
                  SCHEMA_FINGERPRINT,
                  second.logins,
                ),
              ).rejects.toThrow('connections');
              expect(
                (
                  await second.administrator.query(
                    "SELECT to_regclass('public.teams')::text AS table",
                  )
                ).rows,
              ).toEqual(before);
            },
          );
          await migrateDatabase(
            second.owner,
            shipped,
            SCHEMA_FINGERPRINT,
            second.logins,
          );
        });
      });
    },
  );

  it('refreshes connection evidence between checks in the same transaction', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        const client = await second.owner.connect();
        try {
          await client.query('BEGIN');
          await enforceMigrationSecurity(client, second.logins);
          // An administrator temporarily reopening admission is a breach of
          // the provisioning contract. The final check must see the new
          // retained session, even though the first check cached pg_stat_activity.
          await second.administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} TO PUBLIC`,
          );
          await connectAs(
            second.url,
            first.logins[1],
            '-c role=studio_app',
            async (outside) => {
              await outside.query('SELECT 1');
              await second.administrator.query(
                `REVOKE CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} FROM PUBLIC`,
              );
              await expect(
                enforceMigrationSecurity(client, second.logins),
              ).rejects.toThrow('connections');
            },
          );
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      });
    });
  });

  it('rejects missing enrollment before executing any historical SQL', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        await administrator.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM ${escapeIdentifier(logins[1])}`,
        );
        const initial = shipped[0]!;
        const sql = 'SELECT 1/0;\n' + initial.sql;
        const manifest = { ...initial.manifest, sqlHash: sha256(sql) };
        const failing = {
          ...initial,
          manifest,
          checksum: jsonHash(manifest),
          sql,
        };
        // With preflight removed, the authored SQL raises division-by-zero;
        // a finalizer-only guard cannot produce this enrollment refusal.
        await expect(
          migrateDatabase(
            owner,
            [failing],
            initial.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      },
    );
  });

  it('requires committed explicit CONNECT for each enrolled login and refuses PUBLIC admission', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        await administrator.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM ${escapeIdentifier(logins[1])}`,
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('precommitted enrollment');
        await administrator.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(logins[1])}, PUBLIC`,
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('public.teams') AS table",
            )
          ).rows,
        ).toEqual([{ table: null }]);
        await administrator.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM PUBLIC`,
        );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      },
    );
  });

  it('rejects unlisted explicit CONNECT grants before applying schema and rechecks enrollment on a no-op run', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        await first.administrator.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(first.databaseName)} TO ${escapeIdentifier(second.logins[1])}`,
        );
        try {
          await expect(
            migrateDatabase(
              first.owner,
              shipped,
              SCHEMA_FINGERPRINT,
              first.logins,
            ),
          ).rejects.toThrow('unenrolled');
          expect(
            (
              await first.administrator.query(
                "SELECT to_regclass('public.teams') AS table",
              )
            ).rows,
          ).toEqual([{ table: null }]);
          await first.administrator.query(
            `REVOKE CONNECT ON DATABASE ${escapeIdentifier(first.databaseName)} FROM ${escapeIdentifier(second.logins[1])}`,
          );
          await migrateDatabase(
            first.owner,
            shipped,
            SCHEMA_FINGERPRINT,
            first.logins,
          );
          await expect(
            migrateDatabase(first.owner, shipped, SCHEMA_FINGERPRINT, [
              first.logins[0],
            ]),
          ).rejects.toThrow('unenrolled');
        } finally {
          await first.administrator.query(
            `REVOKE CONNECT ON DATABASE ${escapeIdentifier(first.databaseName)} FROM ${escapeIdentifier(second.logins[1])}`,
          );
        }
      });
    });
  });

  it('rejects an outside member of an enrolled login even when inheritance is disabled', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        await first.administrator.query(
          `GRANT ${escapeIdentifier(first.logins[0])} TO ${escapeIdentifier(second.logins[0])} WITH SET TRUE, INHERIT FALSE`,
        );
        await expect(
          migrateDatabase(
            first.owner,
            shipped,
            SCHEMA_FINGERPRINT,
            first.logins,
          ),
        ).rejects.toThrow('memberships');
        expect(
          (
            await first.administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      });
    });
  });

  it.each([
    'NOLOGIN',
    'SUPERUSER',
    'BYPASSRLS',
    'CREATEROLE',
    'CREATEDB',
    'REPLICATION',
  ])('refuses an enrolled non-operator login with %s', async (attribute) => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query(
        `ALTER ROLE ${escapeIdentifier(logins[1])} ${attribute}`,
      );
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).rejects.toThrow('Enrolled Studio identities');
      expect(
        (
          await administrator.query(
            "SELECT to_regclass('public.teams') AS table",
          )
        ).rows,
      ).toEqual([{ table: null }]);
    });
  });

  it('rolls back a sidecar that broadens precommitted database admission', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        const before = (
          await administrator.query(
            'SELECT datacl FROM pg_database WHERE datname = current_database()',
          )
        ).rows;
        const initial = shipped[0]!;
        const sidecars =
          initial.sidecars +
          `\nGRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO PUBLIC;`;
        const manifest = {
          ...initial.manifest,
          sidecarsHash: sha256(sidecars),
        };
        const altered = {
          ...initial,
          manifest,
          checksum: jsonHash(manifest),
          sidecars,
        };
        await expect(
          migrateDatabase(
            owner,
            [altered],
            initial.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await administrator.query(
              'SELECT datacl FROM pg_database WHERE datname = current_database()',
            )
          ).rows,
        ).toEqual(before);
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      },
    );
  });

  it('requires the operator to be explicitly enrolled and never infers missing logins', async () => {
    await withDeployment(async ({ owner, logins }) => {
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, [logins[1]]),
      ).rejects.toThrow('operator');
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, []),
      ).rejects.toThrow('nonempty');
    });
  });

  it('revalidates runtime role safety after sidecars before any security drift can commit', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        const parent = `unsafe_parent_${randomUUID().replaceAll('-', '')}`;
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(parent)} NOLOGIN BYPASSRLS`,
        );
        try {
          // An authored role grant exists only inside the migration transaction.
          // It cannot weaken shared roles seen by concurrently running suites.
          const initial = shipped[0]!;
          const sidecars =
            initial.sidecars +
            `\nGRANT ${escapeIdentifier(parent)} TO studio_app WITH SET TRUE, INHERIT FALSE;`;
          const manifest = {
            ...initial.manifest,
            sidecarsHash: sha256(sidecars),
          };
          const altered = {
            ...initial,
            manifest,
            checksum: jsonHash(manifest),
            sidecars,
          };
          // The administrator can run this synthetic malicious sidecar, while the
          // finalizer must still reject it independently of migration provenance.
          const operator = (
            await administrator.query<{ login: string }>(
              'SELECT session_user AS login',
            )
          ).rows[0]!.login;
          await administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
          );
          await expect(
            migrateDatabase(
              administrator,
              [altered],
              initial.manifest.fingerprint,
              [...logins, operator],
            ),
          ).rejects.toThrow('parent memberships');
          expect(
            (
              await administrator.query(
                "SELECT to_regclass('studio_migrations.history') AS history",
              )
            ).rows,
          ).toEqual([{ history: null }]);
          expect(
            (
              await administrator.query(
                'SELECT count(*)::int AS count FROM pg_auth_members WHERE roleid = $1::regrole',
                [parent],
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        } finally {
          await administrator.query(`DROP ROLE ${escapeIdentifier(parent)}`);
        }
      },
    );
  });
});
