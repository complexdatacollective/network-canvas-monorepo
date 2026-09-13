import { createHash, randomBytes } from 'node:crypto';

import { escapeIdentifier, escapeLiteral } from 'pg';
import type pg from 'pg';

import { assertSafePostgresDatabaseEnrollment } from './postgres-database-enrollment.ts';
import { assertSafePostgresRestrictedIdentities } from './postgres-restricted-identities.ts';
import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
  validateRoleNames,
} from './role-bootstrap.ts';

const LOCK_KEY = 4021775688147136;
const MINIMUM_SHARED_BUFFERS_BYTES = 1_073_741_824;
const REQUIRED_WORK_MEM_BYTES = 268_435_456;
const FINAL_CONNECTION_LIMIT = 100;
const DRAIN_ATTEMPTS = 3;
const MARKER_VERSION = 'network-canvas-managed-postgres-estate.v1';

export type ManagedPostgresDatabase = Readonly<{
  key:
    | 'studio-production'
    | 'studio-staging'
    | 'registry-production'
    | 'registry-staging';
  database: string;
  applicationName: 'Studio' | 'Registry';
  roles: Readonly<{
    app: string;
    maintenance: string;
    backup: string;
  }>;
  logins: Readonly<{
    ownerMigrator: string;
    runtime: string;
    maintenance: string;
    backup: string;
  }>;
}>;

function databaseDefinition(
  key: ManagedPostgresDatabase['key'],
  database: string,
  applicationName: ManagedPostgresDatabase['applicationName'],
): ManagedPostgresDatabase {
  const prefix = database;
  const registry = applicationName === 'Registry';
  return Object.freeze({
    key,
    database,
    applicationName,
    roles: Object.freeze({
      app: registry ? 'registry_app' : 'studio_app',
      maintenance: registry ? 'registry_operator' : 'studio_maintenance',
      backup: registry ? 'registry_backup' : 'studio_backup',
    }),
    logins: Object.freeze({
      ownerMigrator: `${prefix}_migrator`,
      runtime: `${prefix}_runtime`,
      maintenance: `${prefix}_${registry ? 'operations' : 'maintenance_runtime'}`,
      backup: `${prefix}_backup_runtime`,
    }),
  });
}

export const MANAGED_POSTGRES_DATABASES = Object.freeze([
  databaseDefinition('studio-production', 'studio_production', 'Studio'),
  databaseDefinition('studio-staging', 'studio_staging', 'Studio'),
  databaseDefinition('registry-production', 'registry_production', 'Registry'),
  databaseDefinition('registry-staging', 'registry_staging', 'Registry'),
]);

export type ManagedPostgresEstatePlan = Readonly<{
  identity: string;
  databases: readonly Readonly<{
    key: ManagedPostgresDatabase['key'];
    database: string;
    ownerRoleOid: number | null;
    state: 'absent' | 'pending' | 'creating' | 'quarantined' | 'active';
  }>[];
  missingRoles: readonly string[];
}>;

export type ManagedPostgresCredential = Readonly<{
  loginName: string;
  password: string;
}>;

export type ManagedPostgresCredentialBoundary = Readonly<{
  /** Withhold operator-generated fresh credentials from every workload. */
  stage: (credentials: readonly ManagedPostgresCredential[]) => Promise<void>;
  /** Return a brand-new connection authenticated with a staged credential. */
  connect: (
    database: ManagedPostgresDatabase,
    credential: ManagedPostgresCredential,
  ) => Promise<pg.PoolClient>;
  /** Publish the already-proved staged credentials to their workloads. */
  activate: (loginNames: readonly string[]) => Promise<void>;
}>;

export type ManagedPostgresDatabaseConnector = (
  database: ManagedPostgresDatabase,
) => Promise<pg.PoolClient>;

export class UnsafeManagedPostgresEstateError extends Error {
  readonly reason:
    | 'authority'
    | 'configuration'
    | 'identity'
    | 'tuning'
    | 'credentials'
    | 'apply'
    | 'readback'
    | 'quarantine';

  constructor(reason: UnsafeManagedPostgresEstateError['reason']) {
    super('MANAGED_POSTGRES_ESTATE_UNSAFE');
    this.name = 'UnsafeManagedPostgresEstateError';
    this.reason = reason;
  }
}

const allDomainRoles = () => [
  ...new Set(
    MANAGED_POSTGRES_DATABASES.flatMap(({ roles }) => Object.values(roles)),
  ),
];
const allLogins = () =>
  MANAGED_POSTGRES_DATABASES.flatMap(({ logins }) => Object.values(logins));

function freshCredentials(): readonly ManagedPostgresCredential[] {
  return allLogins().map((loginName) => ({
    loginName,
    password: randomBytes(32).toString('base64url'),
  }));
}

function credentialFor(
  credentials: readonly ManagedPostgresCredential[],
  loginName: string,
): ManagedPostgresCredential {
  const credential = credentials.find(
    ({ loginName: candidate }) => candidate === loginName,
  );
  if (!credential) throw new UnsafeManagedPostgresEstateError('credentials');
  return credential;
}

function marker(kind: 'database' | 'role', name: string): string {
  return `${MARKER_VERSION}:${kind}:${name}`;
}

function pendingDatabaseMarker(
  database: ManagedPostgresDatabase,
  ownerRoleOid: number,
): string {
  return `${MARKER_VERSION}:pending-database:${database.database}:owner-role-oid:${ownerRoleOid}`;
}

function planIdentity(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        marker: MARKER_VERSION,
        databases: MANAGED_POSTGRES_DATABASES,
        minimumSharedBuffersBytes: MINIMUM_SHARED_BUFFERS_BYTES,
        requiredWorkMemBytes: REQUIRED_WORK_MEM_BYTES,
      }),
    )
    .digest('hex');
}

async function inspectEstate(
  client: pg.PoolClient,
): Promise<ManagedPostgresEstatePlan> {
  const roleNames = [...allDomainRoles(), ...allLogins()];
  validateRoleNames(roleNames);
  validateRoleNames(MANAGED_POSTGRES_DATABASES.map(({ database }) => database));

  const authority = await client.query<{
    superuser: boolean;
    sharedBuffersBytes: string;
  }>(`SELECT role.rolsuper AS superuser,
      pg_catalog.pg_size_bytes(pg_catalog.current_setting('shared_buffers'))::text AS "sharedBuffersBytes"
    FROM pg_catalog.pg_roles role WHERE role.rolname = current_user`);
  if (authority.rows[0]?.superuser !== true)
    throw new UnsafeManagedPostgresEstateError('authority');
  if (
    BigInt(authority.rows[0].sharedBuffersBytes) <
    BigInt(MINIMUM_SHARED_BUFFERS_BYTES)
  )
    throw new UnsafeManagedPostgresEstateError('tuning');

  const roles = await client.query<{
    oid: number;
    rolname: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    safe: boolean;
    description: string | null;
  }>(
    `SELECT role.oid, role.rolname, role.rolcanlogin, role.rolinherit,
      NOT (role.rolsuper OR role.rolbypassrls OR role.rolcreaterole OR role.rolcreatedb OR role.rolreplication) AS safe,
      pg_catalog.shobj_description(role.oid, 'pg_authid') AS description
    FROM pg_catalog.pg_roles role WHERE role.rolname = ANY($1::pg_catalog.text[])`,
    [roleNames],
  );
  for (const role of roles.rows) {
    const isLogin = allLogins().includes(role.rolname);
    const ownerDatabase = MANAGED_POSTGRES_DATABASES.find(
      ({ logins }) => logins.ownerMigrator === role.rolname,
    );
    const acceptedMarkers = [marker('role', role.rolname)];
    if (ownerDatabase)
      acceptedMarkers.push(pendingDatabaseMarker(ownerDatabase, role.oid));
    if (
      !role.safe ||
      role.rolinherit ||
      (!isLogin && role.rolcanlogin) ||
      !acceptedMarkers.includes(role.description ?? '')
    )
      throw new UnsafeManagedPostgresEstateError('identity');
  }
  const memberships = await client.query<{
    member: string;
    parent: string;
    adminOption: boolean;
    inheritOption: boolean;
    setOption: boolean;
  }>(
    `SELECT member.rolname AS member, parent.rolname AS parent,
      membership.admin_option AS "adminOption",
      membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption"
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    WHERE member.rolname = ANY($1::pg_catalog.text[])`,
    [roleNames],
  );
  for (const membership of memberships.rows) {
    const target = MANAGED_POSTGRES_DATABASES.find(({ logins }) =>
      Object.values(logins).includes(membership.member),
    );
    const allowed = target
      ? membership.member === target.logins.ownerMigrator
        ? [target.roles.app, target.roles.maintenance]
        : membership.member === target.logins.runtime
          ? [target.roles.app]
          : membership.member === target.logins.maintenance
            ? [target.roles.maintenance]
            : [target.roles.backup]
      : [];
    if (
      !allowed.includes(membership.parent) ||
      membership.adminOption ||
      membership.inheritOption ||
      !membership.setOption
    )
      throw new UnsafeManagedPostgresEstateError('identity');
  }

  const databases = await client.query<{
    oid: number;
    datname: string;
    ownerOid: number;
    owner: string;
    datallowconn: boolean;
    datconnlimit: number;
    defaultAcl: boolean;
    sessions: number;
    description: string | null;
  }>(
    `SELECT database.oid, database.datname, database.datdba AS "ownerOid",
      pg_catalog.pg_get_userbyid(database.datdba) AS owner,
      database.datallowconn, database.datconnlimit, database.datacl IS NULL AS "defaultAcl",
      (SELECT pg_catalog.count(*)::int FROM pg_catalog.pg_stat_activity activity
       WHERE activity.datid = database.oid) AS sessions,
      pg_catalog.shobj_description(database.oid, 'pg_database') AS description
    FROM pg_catalog.pg_database database WHERE database.datname = ANY($1::pg_catalog.text[])`,
    [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
  );
  const states = MANAGED_POSTGRES_DATABASES.map((expected) => {
    const found = databases.rows.find(
      ({ datname }) => datname === expected.database,
    );
    const ownerRole = roles.rows.find(
      ({ rolname }) => rolname === expected.logins.ownerMigrator,
    );
    if (!ownerRole) {
      if (found) throw new UnsafeManagedPostgresEstateError('identity');
      return {
        key: expected.key,
        database: expected.database,
        ownerRoleOid: null,
        state: 'absent' as const,
      };
    }
    const normalOwnerMarker = marker('role', ownerRole.rolname);
    const pendingOwnerMarker = pendingDatabaseMarker(expected, ownerRole.oid);
    const ownerIsPending = ownerRole.description === pendingOwnerMarker;
    if (!found)
      return {
        key: expected.key,
        database: expected.database,
        ownerRoleOid: ownerRole.oid,
        state: ownerIsPending ? ('pending' as const) : ('absent' as const),
      };
    if (
      found.owner === expected.logins.ownerMigrator &&
      found.ownerOid === ownerRole.oid &&
      !found.datallowconn &&
      found.datconnlimit === 0 &&
      found.defaultAcl &&
      found.sessions === 0 &&
      found.description === null &&
      ownerIsPending
    )
      return {
        key: expected.key,
        database: expected.database,
        ownerRoleOid: ownerRole.oid,
        state: 'creating' as const,
      };
    if (
      found.owner !== expected.logins.ownerMigrator ||
      found.ownerOid !== ownerRole.oid ||
      !found.datallowconn ||
      ![0, FINAL_CONNECTION_LIMIT].includes(found.datconnlimit) ||
      found.description !== marker('database', expected.database) ||
      ownerRole.description !== normalOwnerMarker
    )
      throw new UnsafeManagedPostgresEstateError('identity');
    return {
      key: expected.key,
      database: expected.database,
      ownerRoleOid: ownerRole.oid,
      state:
        found.datconnlimit === 0
          ? ('quarantined' as const)
          : ('active' as const),
    };
  });
  const connectGrants = await client.query<{
    database: string;
    grantee: string | null;
    superuser: boolean | null;
  }>(
    `SELECT database.datname AS database, grantee.rolname AS grantee,
      grantee.rolsuper AS superuser
    FROM pg_catalog.pg_database database
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database.datacl, pg_catalog.acldefault('d', database.datdba))
    ) privilege
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE database.datname = ANY($1::pg_catalog.text[])
      AND privilege.privilege_type = 'CONNECT'`,
    [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
  );
  for (const grant of connectGrants.rows) {
    if (
      states.some(
        ({ database, state }) =>
          database === grant.database && state === 'creating',
      )
    )
      continue;
    const expected = MANAGED_POSTGRES_DATABASES.find(
      ({ database }) => database === grant.database,
    );
    if (
      !expected ||
      (grant.superuser !== true &&
        (grant.grantee === null ||
          !Object.values(expected.logins).includes(grant.grantee)))
    )
      throw new UnsafeManagedPostgresEstateError('identity');
  }
  return Object.freeze({
    identity: planIdentity(),
    databases: Object.freeze(states),
    missingRoles: Object.freeze(
      roleNames.filter(
        (name) => !roles.rows.some(({ rolname }) => rolname === name),
      ),
    ),
  });
}

/** Read-only, fail-before-write plan. Provider-owned shared_buffers must already
 * be effective. Crunchy Bridge documents postgres as the administrative
 * superuser and directs durable configuration through cluster settings. */
export async function planManagedPostgresEstate(
  pool: pg.Pool,
): Promise<ManagedPostgresEstatePlan> {
  const client = await pool.connect();
  try {
    return await inspectEstate(client);
  } finally {
    client.release();
  }
}

async function createMissingRoles(
  client: pg.PoolClient,
  plan: ManagedPostgresEstatePlan,
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const role of plan.missingRoles) {
      await client.query(
        `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`,
      );
      await client.query(
        `COMMENT ON ROLE ${escapeIdentifier(role)} IS ${escapeLiteral(marker('role', role))}`,
      );
    }
    await client.query(runtimeRolesSql(allDomainRoles(), 'Managed estate'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function createMissingDatabases(
  client: pg.PoolClient,
  plan: ManagedPostgresEstatePlan,
): Promise<void> {
  for (const target of plan.databases.filter(({ state }) =>
    ['absent', 'pending', 'creating'].includes(state),
  )) {
    const database = MANAGED_POSTGRES_DATABASES.find(
      ({ key }) => key === target.key,
    )!;
    if (target.ownerRoleOid === null)
      throw new UnsafeManagedPostgresEstateError('identity');
    if (target.state === 'absent')
      await client.query(
        `COMMENT ON ROLE ${escapeIdentifier(database.logins.ownerMigrator)} IS ${escapeLiteral(pendingDatabaseMarker(database, target.ownerRoleOid))}`,
      );
    if (target.state !== 'creating')
      await client.query(
        `CREATE DATABASE ${escapeIdentifier(database.database)} OWNER ${escapeIdentifier(database.logins.ownerMigrator)} ALLOW_CONNECTIONS false CONNECTION LIMIT 0`,
      );
    const everyIdentity = [...allDomainRoles(), ...allLogins()]
      .map(escapeIdentifier)
      .join(', ');
    const allowed = Object.values(database.logins)
      .map(escapeIdentifier)
      .join(', ');
    await client.query('BEGIN');
    try {
      await client.query(
        `COMMENT ON DATABASE ${escapeIdentifier(database.database)} IS ${escapeLiteral(marker('database', database.database))}`,
      );
      await client.query(
        `REVOKE CONNECT, TEMPORARY ON DATABASE ${escapeIdentifier(database.database)} FROM PUBLIC, ${everyIdentity}`,
      );
      await client.query(
        `GRANT CONNECT ON DATABASE ${escapeIdentifier(database.database)} TO ${allowed}`,
      );
      await client.query(
        `ALTER DATABASE ${escapeIdentifier(database.database)} ALLOW_CONNECTIONS true`,
      );
      await client.query(
        `COMMENT ON ROLE ${escapeIdentifier(database.logins.ownerMigrator)} IS ${escapeLiteral(marker('role', database.logins.ownerMigrator))}`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

async function configureClusterMemberships(
  client: pg.PoolClient,
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const database of MANAGED_POSTGRES_DATABASES) {
      const { roles, logins } = database;
      for (const [login, memberships] of [
        [logins.ownerMigrator, [roles.app, roles.maintenance]],
        [logins.runtime, [roles.app]],
        [logins.maintenance, [roles.maintenance]],
        [logins.backup, [roles.backup]],
      ] as const) {
        for (const role of memberships) {
          await client.query(
            `GRANT ${escapeIdentifier(role)} TO ${escapeIdentifier(login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
          );
        }
        await client.query(
          `ALTER ROLE ${escapeIdentifier(login)} IN DATABASE ${escapeIdentifier(database.database)} SET work_mem = '256MB'`,
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function configureDatabase(
  admin: pg.PoolClient,
  database: ManagedPostgresDatabase,
): Promise<void> {
  const everyIdentity = [...allDomainRoles(), ...allLogins()]
    .map(escapeIdentifier)
    .join(', ');
  const allowed = Object.values(database.logins)
    .map(escapeIdentifier)
    .join(', ');
  await admin.query('BEGIN');
  try {
    await admin.query(
      `REVOKE CONNECT, TEMPORARY ON DATABASE ${escapeIdentifier(database.database)} FROM PUBLIC, ${everyIdentity};
       GRANT CONNECT ON DATABASE ${escapeIdentifier(database.database)} TO ${allowed};
       REVOKE CREATE ON SCHEMA public FROM PUBLIC;
       ${revokeLargeObjectPrivilegesSql([...allDomainRoles(), ...allLogins()])}`,
    );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

async function installPostgresCredentials(
  client: pg.PoolClient,
  credentials: readonly ManagedPostgresCredential[],
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const credential of credentials)
      await client.query(
        `ALTER ROLE ${escapeIdentifier(credential.loginName)} PASSWORD ${escapeLiteral(credential.password)}`,
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function disableAndDrain(client: pg.PoolClient): Promise<void> {
  const logins = allLogins();
  let ownedLogins: string[] = [];
  await client.query('BEGIN');
  try {
    const existing = await client.query<{
      oid: number;
      rolname: string;
      description: string | null;
    }>(
      `SELECT oid, rolname, pg_catalog.shobj_description(oid, 'pg_authid') AS description
       FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])`,
      [logins],
    );
    ownedLogins = existing.rows
      .filter(
        ({ oid, rolname, description }) =>
          description === marker('role', rolname) ||
          MANAGED_POSTGRES_DATABASES.some(
            (database) =>
              database.logins.ownerMigrator === rolname &&
              description === pendingDatabaseMarker(database, oid),
          ),
      )
      .map(({ rolname }) => rolname);
    for (const login of ownedLogins)
      await client.query(`ALTER ROLE ${escapeIdentifier(login)} NOLOGIN`);
    const databases = await client.query<{
      datname: string;
      description: string | null;
    }>(
      `SELECT datname, pg_catalog.shobj_description(oid, 'pg_database') AS description
       FROM pg_catalog.pg_database WHERE datname = ANY($1::pg_catalog.text[])`,
      [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
    );
    const ownedDatabases = databases.rows
      .filter(
        ({ datname, description }) =>
          description === marker('database', datname),
      )
      .map(({ datname }) => datname);
    for (const datname of ownedDatabases)
      await client.query(
        `ALTER DATABASE ${escapeIdentifier(datname)} CONNECTION LIMIT 0`,
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  for (let attempt = 0; attempt < DRAIN_ATTEMPTS; attempt += 1) {
    const terminated = await client.query<{
      pid: number;
      terminated: boolean;
    }>(
      `SELECT activity.pid,
        pg_catalog.pg_terminate_backend(activity.pid, 5000) AS terminated
       FROM pg_catalog.pg_stat_activity activity JOIN pg_catalog.pg_roles role ON role.oid = activity.usesysid
       WHERE role.rolname = ANY($1::pg_catalog.text[]) AND activity.pid <> pg_catalog.pg_backend_pid()`,
      [ownedLogins],
    );
    const remaining = await client.query<{ count: number }>(
      `SELECT pg_catalog.count(*)::int AS count
       FROM pg_catalog.pg_stat_activity activity JOIN pg_catalog.pg_roles role ON role.oid = activity.usesysid
       WHERE role.rolname = ANY($1::pg_catalog.text[]) AND activity.pid <> pg_catalog.pg_backend_pid()`,
      [ownedLogins],
    );
    if (
      remaining.rows[0]?.count === 0 &&
      terminated.rows.every(({ terminated: ended }) => ended)
    )
      return;
  }
  throw new UnsafeManagedPostgresEstateError('quarantine');
}

async function enableForReadback(client: pg.PoolClient): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const login of allLogins())
      await client.query(`ALTER ROLE ${escapeIdentifier(login)} LOGIN`);
    for (const database of MANAGED_POSTGRES_DATABASES)
      await client.query(
        `ALTER DATABASE ${escapeIdentifier(database.database)} CONNECTION LIMIT ${FINAL_CONNECTION_LIMIT}`,
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function readbackDatabase(
  admin: pg.PoolClient,
  database: ManagedPostgresDatabase,
  boundary: ManagedPostgresCredentialBoundary,
  credentials: readonly ManagedPostgresCredential[],
): Promise<void> {
  const allowedLogins = Object.values(database.logins);
  await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await assertSafePostgresDatabaseEnrollment(admin, allowedLogins);
    await assertSafePostgresRestrictedIdentities(admin, {
      allowedLogins,
      administrativeLogins: [database.logins.ownerMigrator],
      runtimeRoleSets: [[database.roles.app], [database.roles.maintenance]],
      backupRole: database.roles.backup,
    });
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
  for (const [login, roles] of [
    [
      database.logins.ownerMigrator,
      [database.roles.app, database.roles.maintenance],
    ],
    [database.logins.runtime, [database.roles.app]],
    [database.logins.maintenance, [database.roles.maintenance]],
    [database.logins.backup, [database.roles.backup]],
  ] as const) {
    const connection = await boundary.connect(
      database,
      credentialFor(credentials, login),
    );
    try {
      const before = await connection.query<{ login: string; bytes: string }>(
        `SELECT session_user AS login,
          pg_catalog.pg_size_bytes(pg_catalog.current_setting('work_mem'))::text AS bytes`,
      );
      if (
        before.rows[0]?.login !== login ||
        BigInt(before.rows[0].bytes) !== BigInt(REQUIRED_WORK_MEM_BYTES)
      )
        throw new UnsafeManagedPostgresEstateError('tuning');
      for (const role of roles) {
        await connection.query(`SET ROLE ${escapeIdentifier(role)}`);
        const after = await connection.query<{ role: string; bytes: string }>(
          `SELECT current_user AS role,
            pg_catalog.pg_size_bytes(pg_catalog.current_setting('work_mem'))::text AS bytes`,
        );
        if (
          after.rows[0]?.role !== role ||
          BigInt(after.rows[0].bytes) !== BigInt(REQUIRED_WORK_MEM_BYTES)
        )
          throw new UnsafeManagedPostgresEstateError('tuning');
        await connection.query('RESET ROLE');
      }
    } finally {
      connection.release();
    }
  }
}

/** Apply only a previously inspectable estate shape. Databases remain at
 * credential boundary withholds staged secrets while PostgreSQL admission is
 * enabled for fresh authentication. Workloads receive credentials only after
 * all effective readback checks pass. */
export async function applyManagedPostgresEstate(
  pool: pg.Pool,
  connectDatabase: ManagedPostgresDatabaseConnector,
  credentials: ManagedPostgresCredentialBoundary,
): Promise<ManagedPostgresEstatePlan> {
  const client = await pool.connect();
  let locked = false;
  let mutationStarted = false;
  let phase: 'apply' | 'credentials' | 'readback' = 'apply';
  try {
    await client.query('SELECT pg_catalog.pg_advisory_lock($1::bigint)', [
      LOCK_KEY,
    ]);
    locked = true;
    const plan = await inspectEstate(client);
    mutationStarted = true;
    await createMissingRoles(client, plan);
    // Re-read every role, including its OID and membership boundary, before
    // publishing durable database-creation intent on an owner role.
    await createMissingDatabases(client, await inspectEstate(client));
    await configureClusterMemberships(client);
    for (const database of MANAGED_POSTGRES_DATABASES) {
      const databaseAdmin = await connectDatabase(database);
      try {
        await configureDatabase(databaseAdmin, database);
      } finally {
        databaseAdmin.release();
      }
    }
    await disableAndDrain(client);
    phase = 'credentials';
    const stagedCredentials = freshCredentials();
    await credentials.stage(stagedCredentials);
    await installPostgresCredentials(client, stagedCredentials);
    const passwords = await client.query<{ complete: boolean }>(
      `SELECT pg_catalog.count(*) = pg_catalog.cardinality($1::pg_catalog.text[]) AS complete
       FROM pg_catalog.pg_authid WHERE rolname = ANY($1::pg_catalog.text[]) AND rolpassword IS NOT NULL`,
      [allLogins()],
    );
    if (passwords.rows[0]?.complete !== true)
      throw new UnsafeManagedPostgresEstateError('credentials');
    await enableForReadback(client);
    phase = 'readback';
    for (const database of MANAGED_POSTGRES_DATABASES) {
      const databaseAdmin = await connectDatabase(database);
      try {
        await readbackDatabase(
          databaseAdmin,
          database,
          credentials,
          stagedCredentials,
        );
      } finally {
        databaseAdmin.release();
      }
    }
    const active = await inspectEstate(client);
    phase = 'credentials';
    await credentials.activate(allLogins());
    return active;
  } catch (error) {
    if (
      error instanceof UnsafeManagedPostgresEstateError &&
      error.reason === 'quarantine'
    )
      throw error;
    if (mutationStarted) {
      try {
        await disableAndDrain(client);
      } catch {
        throw new UnsafeManagedPostgresEstateError('quarantine');
      }
    }
    if (error instanceof UnsafeManagedPostgresEstateError) throw error;
    throw new UnsafeManagedPostgresEstateError(phase);
  } finally {
    if (locked)
      await client
        .query('SELECT pg_catalog.pg_advisory_unlock($1::bigint)', [LOCK_KEY])
        .catch(() => undefined);
    client.release();
  }
}
