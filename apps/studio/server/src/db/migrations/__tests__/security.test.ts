import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier, Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  jsonHash,
  readMigrations,
  sha256,
} from '@codaco/studio-sync/postgres-migration-artifacts';
import { BACKUP_ROLE } from '@codaco/studio-sync/rls';
import { runtimeRolesSql } from '@codaco/studio-sync/role-bootstrap';

import {
  createScratchDatabase,
  reachableDb,
} from '../../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../fingerprint.generated.ts';
import { enforceMigrationSecurity, migrateDatabase } from '../migrate.ts';

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
            'GRANT ALL ON public."schemaFingerprint" TO studio_app, studio_maintenance; GRANT UPDATE (fingerprint) ON public."schemaFingerprint" TO studio_app, studio_maintenance',
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
    'INHERIT',
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
  it.each([
    'SET TRUE, INHERIT FALSE',
    'SET FALSE, INHERIT TRUE',
    'SET FALSE, INHERIT FALSE',
  ])(
    'rejects an enrolled runtime member of the database owner (%s)',
    async (options) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await administrator.query(
          `GRANT ${escapeIdentifier(logins[0])} TO ${escapeIdentifier(logins[1])} WITH ${options}`,
        );
        if (options.startsWith('SET TRUE')) {
          // Prove this is an effective owner escape from the actual pinned pool.
          await connectAs(
            url,
            logins[1],
            '-c role=studio_app',
            async (runtime) => {
              const client = await runtime.connect();
              try {
                await client.query('BEGIN');
                await client.query(`SET ROLE ${escapeIdentifier(logins[0])}`);
                await client.query(
                  'CREATE TABLE public.runtime_owner_escape (id integer)',
                );
                expect(
                  (
                    await client.query(
                      "SELECT to_regclass('public.runtime_owner_escape')::text AS name",
                    )
                  ).rows,
                ).toEqual([{ name: 'runtime_owner_escape' }]);
              } finally {
                await client.query('ROLLBACK');
                client.release();
              }
            },
          );
        }
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('login memberships');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
        await administrator.query(
          `REVOKE ${escapeIdentifier(logins[0])} FROM ${escapeIdentifier(logins[1])}`,
        );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await connectAs(
          url,
          logins[1],
          '-c role=studio_app',
          async (runtime) => {
            await expect(
              runtime.query(`SET ROLE ${escapeIdentifier(logins[0])}`),
            ).rejects.toMatchObject({ code: '42501' });
          },
        );
      });
    },
  );

  it.each([
    ['unknown role', 'CREATE ROLE', 'SET TRUE, INHERIT FALSE'],
    ['built-in role', 'pg_read_all_data', 'SET TRUE, INHERIT FALSE'],
    ['role administrator', 'studio_app', 'ADMIN TRUE, SET TRUE, INHERIT FALSE'],
    [
      'inherited runtime role',
      'studio_app',
      'ADMIN FALSE, SET TRUE, INHERIT TRUE',
    ],
    [
      'disabled runtime membership',
      'studio_app',
      'ADMIN FALSE, SET FALSE, INHERIT FALSE',
    ],
  ])('refuses scoped membership drift: %s', async (_label, role, options) => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      const parent =
        role === 'CREATE ROLE'
          ? `extra_${randomUUID().replaceAll('-', '')}`
          : role;
      try {
        if (role === 'CREATE ROLE')
          await administrator.query(
            `CREATE ROLE ${escapeIdentifier(parent)} NOLOGIN`,
          );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await administrator.query(
          `GRANT ${escapeIdentifier(parent)} TO ${escapeIdentifier(logins[1])} WITH ${options}`,
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('login memberships');
        await administrator.query(
          `REVOKE ${escapeIdentifier(parent)} FROM ${escapeIdentifier(logins[1])}`,
        );
        await administrator.query(
          `GRANT studio_app TO ${escapeIdentifier(logins[1])} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      } finally {
        if (role === 'CREATE ROLE')
          await administrator.query(
            `DROP ROLE IF EXISTS ${escapeIdentifier(parent)}`,
          );
      }
    });
  });

  it('supports a separate enrolled migration operator and database owner', async () => {
    await withDeployment(
      async ({ administrator, url, logins, databaseName }) => {
        const operator = `separate_operator_${randomUUID().replaceAll('-', '')}`;
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(operator)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
        );
        try {
          await administrator.query(
            `GRANT ${escapeIdentifier(logins[0])} TO ${escapeIdentifier(operator)} WITH SET TRUE, INHERIT TRUE`,
          );
          await administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
          );
          const enrolled = [...logins, operator];
          await connectAs(url, operator, undefined, async (pool) => {
            expect(
              await migrateDatabase(
                pool,
                shipped,
                SCHEMA_FINGERPRINT,
                enrolled,
              ),
            ).toEqual(shipped.map(({ manifest }) => manifest.id));
            expect(
              await migrateDatabase(
                pool,
                shipped,
                SCHEMA_FINGERPRINT,
                enrolled,
              ),
            ).toEqual([]);
          });
          expect(
            (
              await administrator.query(
                'SELECT count(*)::integer AS count FROM studio_migrations.history',
              )
            ).rows,
          ).toEqual([{ count: shipped.length }]);
        } finally {
          await administrator.query(
            `REASSIGN OWNED BY ${escapeIdentifier(operator)} TO ${escapeIdentifier(logins[0])}`,
          );
          await administrator.query(
            `DROP OWNED BY ${escapeIdentifier(operator)}`,
          );
          await administrator.query(`DROP ROLE ${escapeIdentifier(operator)}`);
        }
      },
    );
  });

  it('allows an optional backup login while refusing mixed runtime and backup memberships', async () => {
    await withDeployment(
      async ({ administrator, owner, url, logins, databaseName }) => {
        await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
        const backup = `separate_backup_${randomUUID().replaceAll('-', '')}`;
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(backup)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
        );
        try {
          await administrator.query(
            `GRANT ${BACKUP_ROLE} TO ${escapeIdentifier(backup)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
          );
          await administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(backup)}`,
          );
          const enrolled = [...logins, backup];
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled);
          // This is the legitimate read-only backup provisioning contract.
          // The migration finalizer must repair evidence writes without
          // removing these reads, including reads through backup-only views.
          await administrator.query(`GRANT USAGE ON SCHEMA public, studio_migrations TO ${BACKUP_ROLE};
            GRANT SELECT ON public."schemaFingerprint", studio_migrations.history TO ${BACKUP_ROLE};
            CREATE VIEW backup_evidence_view AS SELECT fingerprint FROM public."schemaFingerprint";
            CREATE MATERIALIZED VIEW backup_evidence_snapshot AS SELECT fingerprint FROM public."schemaFingerprint";
            GRANT SELECT ON backup_evidence_view, backup_evidence_snapshot TO ${BACKUP_ROLE}`);
          const history = (
            await administrator.query('SELECT * FROM studio_migrations.history')
          ).rows;
          const stamp = (
            await administrator.query(
              'SELECT * FROM public."schemaFingerprint"',
            )
          ).rows;
          expect(history).toHaveLength(shipped.length);
          expect(stamp).toHaveLength(1);
          for (const repair of [false, true]) {
            if (repair) {
              await administrator.query(`GRANT ALL ON studio_migrations.history, public."schemaFingerprint" TO ${BACKUP_ROLE};
                GRANT UPDATE (checksum) ON studio_migrations.history TO ${BACKUP_ROLE};
                GRANT UPDATE (fingerprint) ON public."schemaFingerprint" TO ${BACKUP_ROLE}`);
            }
            expect(
              await migrateDatabase(
                owner,
                shipped,
                SCHEMA_FINGERPRINT,
                enrolled,
              ),
            ).toEqual([]);
            await connectAs(
              url,
              backup,
              `-c role=${BACKUP_ROLE}`,
              async (pool) => {
                expect(
                  (await pool.query('SELECT * FROM studio_migrations.history'))
                    .rows,
                ).toEqual(history);
                expect(
                  (await pool.query('SELECT * FROM public."schemaFingerprint"'))
                    .rows,
                ).toEqual(stamp);
                for (const table of [
                  'backup_evidence_view',
                  'backup_evidence_snapshot',
                ]) {
                  expect(
                    (await pool.query(`SELECT fingerprint FROM ${table}`)).rows,
                  ).toEqual([{ fingerprint: SCHEMA_FINGERPRINT }]);
                }
                for (const statement of [
                  "UPDATE studio_migrations.history SET checksum = 'forged'",
                  'DELETE FROM studio_migrations.history',
                  'TRUNCATE studio_migrations.history',
                  "INSERT INTO studio_migrations.history (position, id, checksum, fingerprint) VALUES (100, 'forged', 'forged', 'forged')",
                  'UPDATE public."schemaFingerprint" SET fingerprint = \'forged\'',
                  'DELETE FROM public."schemaFingerprint"',
                  'TRUNCATE public."schemaFingerprint"',
                  'INSERT INTO public."schemaFingerprint" (fingerprint) VALUES (\'forged\')',
                ]) {
                  await expect(pool.query(statement)).rejects.toMatchObject({
                    code: '42501',
                  });
                }
              },
            );
          }
          await connectAs(
            url,
            backup,
            `-c role=${BACKUP_ROLE}`,
            async (pool) => {
              expect(
                (await pool.query('SELECT current_user AS role')).rows,
              ).toEqual([{ role: BACKUP_ROLE }]);
              for (const role of [
                ...logins,
                'studio_app',
                'studio_maintenance',
              ]) {
                await expect(
                  pool.query(`SET ROLE ${escapeIdentifier(role)}`),
                ).rejects.toMatchObject({ code: '42501' });
              }
            },
          );
          await administrator.query(
            `GRANT studio_app TO ${escapeIdentifier(backup)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
          );
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled),
          ).rejects.toThrow('backup membership');
          await administrator.query(
            `REVOKE studio_app FROM ${escapeIdentifier(backup)}`,
          );
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled),
          ).toEqual([]);
        } finally {
          await administrator.query(
            `DROP OWNED BY ${escapeIdentifier(backup)}`,
          );
          await administrator.query(`DROP ROLE ${escapeIdentifier(backup)}`);
        }
      },
    );
  });

  it.each([
    [
      'database CREATE',
      'GRANT CREATE ON DATABASE $database TO $login',
      'REVOKE CREATE ON DATABASE $database FROM $login',
    ],
    [
      'CONNECT grant option',
      'GRANT CONNECT ON DATABASE $database TO $login WITH GRANT OPTION',
      'REVOKE GRANT OPTION FOR CONNECT ON DATABASE $database FROM $login',
    ],
    [
      'schema CREATE',
      'GRANT CREATE ON SCHEMA public TO $login',
      'REVOKE CREATE ON SCHEMA public FROM $login',
    ],
    [
      'direct table write',
      'GRANT UPDATE ON teams TO $login',
      'REVOKE UPDATE ON teams FROM $login',
    ],
    [
      'direct table read',
      'GRANT SELECT ON teams TO $login',
      'REVOKE SELECT ON teams FROM $login',
    ],
    [
      'direct column write',
      'GRANT UPDATE (name) ON teams TO $login',
      'REVOKE UPDATE ON teams FROM $login',
    ],
    [
      'PUBLIC fingerprint write',
      'GRANT UPDATE ON "schemaFingerprint" TO PUBLIC',
      'REVOKE UPDATE ON "schemaFingerprint" FROM PUBLIC',
    ],
    [
      'view write',
      'CREATE VIEW login_access_view AS SELECT id, name FROM teams; GRANT UPDATE ON login_access_view TO $login',
      'DROP VIEW login_access_view',
    ],
    [
      'view column write',
      'CREATE VIEW login_access_view AS SELECT id, name FROM teams; GRANT UPDATE (name) ON login_access_view TO $login',
      'DROP VIEW login_access_view',
    ],
    [
      'materialized view read',
      'CREATE MATERIALIZED VIEW login_access_materialized AS SELECT id, name FROM teams; GRANT SELECT ON login_access_materialized TO $login',
      'DROP MATERIALIZED VIEW login_access_materialized',
    ],
    [
      'foreign table write',
      'CREATE FOREIGN DATA WRAPPER login_access_wrapper; CREATE SERVER login_access_server FOREIGN DATA WRAPPER login_access_wrapper; CREATE FOREIGN TABLE login_access_foreign (id integer) SERVER login_access_server; GRANT UPDATE ON login_access_foreign TO $login',
      'DROP FOREIGN DATA WRAPPER login_access_wrapper CASCADE',
    ],
    [
      'sequence write',
      'CREATE SEQUENCE login_access_sequence; GRANT UPDATE ON SEQUENCE login_access_sequence TO $login',
      'DROP SEQUENCE login_access_sequence',
    ],
    [
      'owned enum type',
      "CREATE TYPE login_owned_enum AS ENUM ('initial'); ALTER TYPE login_owned_enum OWNER TO $login",
      'DROP TYPE login_owned_enum',
    ],
    [
      'runtime role owned type',
      "CREATE TYPE runtime_owned_enum AS ENUM ('initial'); ALTER TYPE runtime_owned_enum OWNER TO studio_app",
      'DROP TYPE runtime_owned_enum',
    ],
    [
      'runtime role CREATE',
      'GRANT CREATE ON SCHEMA public TO studio_app',
      'REVOKE CREATE ON SCHEMA public FROM studio_app',
    ],
    [
      'definer executable only by runtime role',
      "CREATE FUNCTION runtime_write_evidence() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'UPDATE public.\"schemaFingerprint\" SET fingerprint = repeat(''a'', 64)'; REVOKE ALL ON FUNCTION runtime_write_evidence() FROM PUBLIC; GRANT EXECUTE ON FUNCTION runtime_write_evidence() TO studio_app",
      'DROP FUNCTION runtime_write_evidence()',
    ],
    [
      'owned function',
      "CREATE FUNCTION login_owned_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'; ALTER FUNCTION login_owned_function() OWNER TO $login",
      'DROP FUNCTION login_owned_function()',
    ],
    [
      'owned table',
      'CREATE TABLE login_owned_table (id integer); ALTER TABLE login_owned_table OWNER TO $login',
      'DROP TABLE login_owned_table',
    ],
    [
      'owned schema',
      'CREATE SCHEMA login_owned_schema AUTHORIZATION $login',
      'DROP SCHEMA login_owned_schema',
    ],
    [
      'executable definer',
      "CREATE FUNCTION login_write_evidence() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'UPDATE public.\"schemaFingerprint\" SET fingerprint = repeat(''a'', 64)'",
      'DROP FUNCTION login_write_evidence()',
    ],
  ])(
    'refuses login access outside scoped roles on a no-op migration: %s',
    async (kind, corrupt, restore) => {
      await withDeployment(
        async ({ administrator, owner, url, logins, databaseName }) => {
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
          const substitute = (sql: string) =>
            sql
              .replaceAll('$database', escapeIdentifier(databaseName))
              .replaceAll('$login', escapeIdentifier(logins[1]));
          await administrator.query(substitute(corrupt));
          if (
            kind === 'view write' ||
            kind === 'view column write' ||
            kind === 'executable definer'
          ) {
            // Demonstrate effective data mutation after leaving the pinned role,
            // then roll the proof back before asking the migrator to refuse it.
            await owner.query(
              "INSERT INTO teams (id,name,slug) VALUES ('login-proof','BEFORE','login-proof')",
            );
            await connectAs(
              url,
              logins[1],
              '-c role=studio_app',
              async (runtime) => {
                const client = await runtime.connect();
                try {
                  await client.query('BEGIN');
                  await client.query('SET ROLE NONE');
                  expect(
                    (await client.query('SELECT current_user AS role')).rows,
                  ).toEqual([{ role: logins[1] }]);
                  if (kind === 'executable definer') {
                    await client.query('SELECT login_write_evidence()');
                    // The login cannot SELECT this table. The same backend returns
                    // to studio_app solely to inspect the already-performed write.
                    await client.query('SET ROLE studio_app');
                    expect(
                      (
                        await client.query(
                          'SELECT fingerprint FROM "schemaFingerprint"',
                        )
                      ).rows,
                    ).toEqual([{ fingerprint: 'a'.repeat(64) }]);
                  } else {
                    await client.query(
                      "UPDATE login_access_view SET name='LOGIN_WRITE'",
                    );
                    await client.query('SET ROLE studio_app');
                    expect(
                      (
                        await client.query(
                          "SELECT name FROM teams WHERE id='login-proof'",
                        )
                      ).rows,
                    ).toEqual([{ name: 'LOGIN_WRITE' }]);
                  }
                } finally {
                  await client.query('ROLLBACK');
                  client.release();
                }
              },
            );
          }
          const before = (
            await administrator.query('SELECT * FROM studio_migrations.history')
          ).rows;
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).rejects.toThrow('access outside their reviewed Studio roles');
          expect(
            (
              await administrator.query(
                'SELECT * FROM studio_migrations.history',
              )
            ).rows,
          ).toEqual(before);
          await administrator.query(substitute(restore));
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        },
      );
    },
  );
  it.each(['membership', 'direct grant'])(
    'rolls back login privilege drift introduced by a sidecar: %s',
    async (drift) => {
      await withDeployment(async ({ administrator, logins, databaseName }) => {
        const operator = (
          await administrator.query<{ login: string }>(
            'SELECT session_user AS login',
          )
        ).rows[0]!.login;
        await administrator.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
        );
        const initial = shipped[0]!;
        const sidecars =
          initial.sidecars +
          (drift === 'membership'
            ? `\nGRANT ${escapeIdentifier(logins[0])} TO ${escapeIdentifier(logins[1])} WITH SET TRUE, INHERIT FALSE;`
            : `\nGRANT SELECT ON public.teams TO ${escapeIdentifier(logins[1])};`);
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
            administrator,
            [altered],
            initial.manifest.fingerprint,
            [...logins, operator],
          ),
        ).rejects.toThrow(
          drift === 'membership'
            ? 'login memberships'
            : 'access outside their reviewed Studio roles',
        );
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
              "SELECT pg_has_role($1, $2, 'SET') AS can_assume",
              [logins[1], logins[0]],
            )
          ).rows,
        ).toEqual([{ can_assume: false }]);
      });
    },
  );
  it('revalidates an existing optional backup role without changing its attributes', async () => {
    await withDeployment(async ({ administrator, logins, databaseName }) => {
      await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
      const operator = (
        await administrator.query<{ login: string }>(
          'SELECT session_user AS login',
        )
      ).rows[0]!.login;
      await administrator.query(
        `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
      );
      const client = await administrator.connect();
      try {
        await client.query('BEGIN');
        await enforceMigrationSecurity(client, [...logins, operator]);
        await client.query(`ALTER ROLE ${BACKUP_ROLE} CREATEDB`);
        await expect(
          enforceMigrationSecurity(client, [...logins, operator]),
        ).rejects.toThrow('runtime roles must');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      expect(
        (
          await administrator.query(
            'SELECT rolcreatedb FROM pg_roles WHERE rolname = $1',
            [BACKUP_ROLE],
          )
        ).rows,
      ).toEqual([{ rolcreatedb: false }]);
    });
  });

  it.each(['studio_app', 'studio_maintenance', BACKUP_ROLE])(
    'refuses owner-backed relation privileges held by scoped role %s',
    async (role) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        // Any missing optional role is safely provisioned within a transaction;
        // no existing cluster-wide role's attributes or memberships are changed.
        await administrator.query(
          `BEGIN; ${runtimeRolesSql([BACKUP_ROLE])} COMMIT`,
        );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const before = (
          await administrator.query('SELECT * FROM studio_migrations.history')
        ).rows;
        const stamp = (
          await administrator.query('SELECT * FROM public."schemaFingerprint"')
        ).rows;
        expect(before).toHaveLength(shipped.length);
        expect(stamp).toHaveLength(1);
        const cases: {
          kind: string;
          create: string;
          grant: string;
          drop: string;
          write?: string;
        }[] = [
          {
            kind: 'view write',
            create:
              'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
            grant: 'UPDATE ON runtime_evidence_view',
            drop: 'DROP VIEW runtime_evidence_view',
            write: 'fingerprint',
          },
          {
            kind: 'view sibling column write',
            create:
              'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
            grant: 'UPDATE (sibling) ON runtime_evidence_view',
            drop: 'DROP VIEW runtime_evidence_view',
            write: 'sibling',
          },
          {
            kind: 'materialized view maintenance',
            create:
              'CREATE MATERIALIZED VIEW runtime_evidence_snapshot AS SELECT fingerprint FROM public."schemaFingerprint"',
            grant: 'MAINTAIN ON runtime_evidence_snapshot',
            drop: 'DROP MATERIALIZED VIEW runtime_evidence_snapshot',
          },
          {
            kind: 'foreign table write',
            create:
              'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
            grant: 'UPDATE ON runtime_evidence_foreign',
            drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
          },
          {
            kind: 'foreign table sibling column write',
            create:
              'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
            grant: 'UPDATE (sibling) ON runtime_evidence_foreign',
            drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
          },
          ...(role === BACKUP_ROLE
            ? []
            : [
                {
                  kind: 'view read',
                  create:
                    'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
                  grant: 'SELECT ON runtime_evidence_view',
                  drop: 'DROP VIEW runtime_evidence_view',
                },
                {
                  kind: 'view sibling column read',
                  create:
                    'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
                  grant: 'SELECT (sibling) ON runtime_evidence_view',
                  drop: 'DROP VIEW runtime_evidence_view',
                },
                {
                  kind: 'materialized view read',
                  create:
                    'CREATE MATERIALIZED VIEW runtime_evidence_snapshot AS SELECT fingerprint FROM public."schemaFingerprint"',
                  grant: 'SELECT ON runtime_evidence_snapshot',
                  drop: 'DROP MATERIALIZED VIEW runtime_evidence_snapshot',
                },
                {
                  kind: 'foreign table read',
                  create:
                    'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
                  grant: 'SELECT ON runtime_evidence_foreign',
                  drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
                },
                {
                  kind: 'foreign table sibling column read',
                  create:
                    'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
                  grant: 'SELECT (sibling) ON runtime_evidence_foreign',
                  drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
                },
              ]),
        ];
        expect(cases).toHaveLength(role === BACKUP_ROLE ? 5 : 10);
        for (const fixture of cases) {
          await administrator.query(
            `${fixture.create}; GRANT ${fixture.grant} TO ${escapeIdentifier(role)}`,
          );
          if (fixture.write) {
            const client = await administrator.connect();
            try {
              await client.query('BEGIN');
              // Schema usage is local to this proof and rolls back. This also
              // covers an optional role whose backup sidecar is not installed.
              await client.query(
                `GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(role)}`,
              );
              await client.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
              expect(
                (await client.query('SELECT current_user AS role')).rows,
              ).toEqual([{ role }]);
              expect(
                (
                  await client.query(
                    `UPDATE public.runtime_evidence_view SET ${escapeIdentifier(fixture.write)} = repeat('a', 64)`,
                  )
                ).rowCount,
              ).toBe(1);
              await client.query('RESET ROLE');
              expect(
                (
                  await client.query(
                    'SELECT fingerprint FROM public."schemaFingerprint"',
                  )
                ).rows,
              ).toEqual([{ fingerprint: 'a'.repeat(64) }]);
            } finally {
              await client.query('ROLLBACK');
              client.release();
            }
          }
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
            fixture.kind,
          ).rejects.toThrow('access outside their reviewed Studio roles');
          expect(
            (
              await administrator.query(
                'SELECT * FROM studio_migrations.history',
              )
            ).rows,
          ).toEqual(before);
          expect(
            (
              await administrator.query(
                'SELECT * FROM public."schemaFingerprint"',
              )
            ).rows,
          ).toEqual(stamp);
          await administrator.query(fixture.drop);
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        }
      });
    },
  );

  it('refuses backup base-table writes when migration evidence does not exist yet', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query(
        `BEGIN; ${runtimeRolesSql([BACKUP_ROLE])} COMMIT`,
      );
      // Same-name tables in another schema are not migration evidence. Both
      // real evidence OIDs are NULL before this first migration.
      await administrator.query(`CREATE SCHEMA backup_relations;
        CREATE TABLE backup_relations.history (id integer, sibling boolean);
        INSERT INTO backup_relations.history VALUES (1, false);
        GRANT USAGE ON SCHEMA backup_relations TO ${BACKUP_ROLE};
        GRANT SELECT, UPDATE ON backup_relations.history TO ${BACKUP_ROLE}`);
      expect(
        (
          await administrator.query(
            `SELECT to_regclass('studio_migrations.history') AS history, to_regclass('public."schemaFingerprint"') AS fingerprint`,
          )
        ).rows,
      ).toEqual([{ history: null, fingerprint: null }]);
      // A postflight check can mask a NULL bug once migration has created the
      // evidence tables. The real preflight must refuse before any SQL runs.
      const preflight = await owner.connect();
      try {
        await preflight.query('BEGIN');
        await expect(
          enforceMigrationSecurity(preflight, logins),
        ).rejects.toThrow('access outside their reviewed Studio roles');
      } finally {
        await preflight.query('ROLLBACK');
        preflight.release();
      }
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).rejects.toThrow('access outside their reviewed Studio roles');
      expect(
        (await administrator.query('SELECT * FROM backup_relations.history'))
          .rows,
      ).toEqual([{ id: 1, sibling: false }]);
      await administrator.query(
        `REVOKE UPDATE ON backup_relations.history FROM ${BACKUP_ROLE}`,
      );
      expect(
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).toEqual(shipped.map((migration) => migration.manifest.id));
    });
  });

  it('refuses backup base-table, sibling-column, partitioned-table and sequence writes while preserving reads', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query(
        `BEGIN; ${runtimeRolesSql([BACKUP_ROLE])} COMMIT`,
      );
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      await administrator.query(`INSERT INTO public."user" (id, name, email, "emailVerified") VALUES ('backup-proof', 'Backup proof', 'backup-proof@example.test', false);
        CREATE SCHEMA backup_relations;
        CREATE TABLE backup_relations.history (id integer, sibling boolean);
        INSERT INTO backup_relations.history VALUES (1, false);
        CREATE TABLE backup_relations."schemaFingerprint" (id integer, sibling boolean) PARTITION BY LIST (id);
        CREATE TABLE backup_relations.partition_one PARTITION OF backup_relations."schemaFingerprint" FOR VALUES IN (1);
        INSERT INTO backup_relations."schemaFingerprint" VALUES (1, false);
        CREATE SEQUENCE backup_relations.counter;
        GRANT USAGE ON SCHEMA public, backup_relations TO ${BACKUP_ROLE};
        GRANT SELECT ON public."user", backup_relations.history, backup_relations."schemaFingerprint" TO ${BACKUP_ROLE};
        GRANT SELECT ON SEQUENCE backup_relations.counter TO ${BACKUP_ROLE}`);
      const history = (
        await administrator.query('SELECT * FROM studio_migrations.history')
      ).rows;
      const stamp = (
        await administrator.query('SELECT * FROM public."schemaFingerprint"')
      ).rows;
      expect(history).toHaveLength(shipped.length);
      expect(stamp).toHaveLength(1);
      const cases: { grant: string; proveUserWrite?: boolean }[] = [
        { grant: 'UPDATE ON public."user"', proveUserWrite: true },
        {
          grant: 'UPDATE ("emailVerified") ON public."user"',
          proveUserWrite: true,
        },
        ...[
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
          'MAINTAIN',
        ].map((privilege) => ({
          grant: `${privilege} ON backup_relations.history`,
        })),
        ...['INSERT', 'UPDATE', 'REFERENCES'].map((privilege) => ({
          grant: `${privilege} (sibling) ON backup_relations.history`,
        })),
        { grant: 'UPDATE ON backup_relations."schemaFingerprint"' },
        { grant: 'UPDATE (sibling) ON backup_relations."schemaFingerprint"' },
        { grant: 'USAGE ON SEQUENCE backup_relations.counter' },
        { grant: 'UPDATE ON SEQUENCE backup_relations.counter' },
      ];
      expect(cases).toHaveLength(16);
      for (const fixture of cases) {
        await administrator.query(`GRANT ${fixture.grant} TO ${BACKUP_ROLE}`);
        if (fixture.proveUserWrite) {
          const client = await administrator.connect();
          try {
            await client.query('BEGIN');
            await client.query(`SET LOCAL ROLE ${BACKUP_ROLE}`);
            expect(
              (await client.query('SELECT current_user AS role')).rows,
            ).toEqual([{ role: BACKUP_ROLE }]);
            expect(
              (
                await client.query(
                  'UPDATE public."user" SET "emailVerified" = true',
                )
              ).rowCount,
            ).toBe(1);
            expect(
              (await client.query('SELECT "emailVerified" FROM public."user"'))
                .rows,
            ).toEqual([{ emailVerified: true }]);
          } finally {
            await client.query('ROLLBACK');
            client.release();
          }
        }
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          fixture.grant,
        ).rejects.toThrow('access outside their reviewed Studio roles');
        expect(
          (await administrator.query('SELECT * FROM studio_migrations.history'))
            .rows,
        ).toEqual(history);
        expect(
          (
            await administrator.query(
              'SELECT * FROM public."schemaFingerprint"',
            )
          ).rows,
        ).toEqual(stamp);
        await administrator.query(
          `REVOKE ${fixture.grant} FROM ${BACKUP_ROLE}`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      }
      const client = await administrator.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${BACKUP_ROLE}`);
        expect(
          (await client.query('SELECT "emailVerified" FROM public."user"'))
            .rows,
        ).toEqual([{ emailVerified: false }]);
        for (const table of [
          'backup_relations.history',
          'backup_relations."schemaFingerprint"',
        ]) {
          expect((await client.query(`SELECT * FROM ${table}`)).rows).toEqual([
            { id: 1, sibling: false },
          ]);
        }
        expect(
          (
            await client.query(
              'SELECT last_value::int AS last_value FROM backup_relations.counter',
            )
          ).rows,
        ).toEqual([{ last_value: 1 }]);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});
