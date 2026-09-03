import { randomUUID } from 'node:crypto';

import { faker } from '@faker-js/faker';
import { hashPassword } from 'better-auth/crypto';
import type pg from 'pg';

import { TEAM_ROLES, type TeamRole } from '@codaco/studio-rpc';

// The deploy-time and dev-boot seed (#1256 tracks real onboarding — until
// then, this is how a fresh instance gets something to look at): wipes every
// table's data, then repopulates reproducible synthetic content. Every call
// pins the faker PRNG below, so two runs produce byte-identical data.
//
// Never point this at a database carrying real data: it deletes everything
// first, and SEED_ADMIN_PASSWORD is published here and in the README.

export const SEED_ADMIN_NAME = 'Studio Admin';
export const SEED_ADMIN_EMAIL = 'admin@studio.test';
export const SEED_ADMIN_PASSWORD = 'studio-admin-not-for-production';

const TEAM_COUNT = 5;
const MIN_MEMBERS_PER_TEAM = 2;
const MAX_MEMBERS_PER_TEAM = 6;
const FAKER_SEED = 20260902;

// better-auth's own `createLocalAccountIssuer('credential')`
// (@better-auth/core/db, not a direct dependency here) — the synthetic
// `issuer` key its adapter matches a credential account by, alongside
// providerId and accountId. See the comment on auth-schema.ts's `issuer`
// column.
const CREDENTIAL_ISSUER = 'local:credential';

/**
 * Driven off `pg_tables` rather than a hardcoded list, so a table added to
 * the schema later is wiped too instead of silently accumulating stale rows
 * that the rest of this function never touches.
 */
async function wipe(pool: pg.Pool): Promise<void> {
  await pool.query(`
    do $$
    declare
      r record;
    begin
      for r in
        select tablename from pg_tables
        where schemaname = current_schema() and tablename <> 'schemaFingerprint'
      loop
        execute format('truncate table %I restart identity cascade', r.tablename);
      end loop;
    end $$;
  `);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name) || 'team';
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix++) {
    slug = `${base}-${suffix}`;
  }
  taken.add(slug);
  return slug;
}

function uniqueEmail(
  firstName: string,
  lastName: string,
  taken: Set<string>,
): string {
  let email = faker.internet.email({ firstName, lastName }).toLowerCase();
  while (taken.has(email)) {
    email = faker.internet.email({ firstName, lastName }).toLowerCase();
  }
  taken.add(email);
  return email;
}

async function insertUser(
  pool: pg.Pool,
  user: { id: string; name: string; email: string; emailVerified: boolean },
): Promise<void> {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified")
     values ($1, $2, $3, $4)`,
    [user.id, user.name, user.email, user.emailVerified],
  );
}

/**
 * The `credential` provider account better-auth's own email/password sign-up
 * would create, hashed with the same `better-auth/crypto` function it
 * verifies against — so this password works through the real sign-in
 * endpoint, not just as a stored value.
 */
async function insertCredentialAccount(
  pool: pg.Pool,
  input: { userId: string; password: string },
): Promise<void> {
  const password = await hashPassword(input.password);
  await pool.query(
    `insert into account (id, "accountId", "providerId", issuer, "userId", password, "updatedAt")
     values ($1, $2, 'credential', $3, $2, $4, now())`,
    [randomUUID(), input.userId, CREDENTIAL_ISSUER, password],
  );
}

async function insertTeam(
  pool: pg.Pool,
  team: { id: string; name: string; slug: string },
): Promise<void> {
  await pool.query(`insert into teams (id, name, slug) values ($1, $2, $3)`, [
    team.id,
    team.name,
    team.slug,
  ]);
}

async function insertMember(
  pool: pg.Pool,
  member: { teamId: string; userId: string; role: TeamRole },
): Promise<void> {
  await pool.query(
    `insert into team_members (id, team_id, user_id, role)
     values ($1, $2, $3, $4)`,
    [randomUUID(), member.teamId, member.userId, member.role],
  );
}

export async function seed(pool: pg.Pool): Promise<void> {
  faker.seed(FAKER_SEED);
  await wipe(pool);

  const adminId = randomUUID();
  await insertUser(pool, {
    id: adminId,
    name: SEED_ADMIN_NAME,
    email: SEED_ADMIN_EMAIL,
    emailVerified: true,
  });
  await insertCredentialAccount(pool, {
    userId: adminId,
    password: SEED_ADMIN_PASSWORD,
  });

  const takenSlugs = new Set<string>();
  const takenEmails = new Set<string>([SEED_ADMIN_EMAIL]);

  for (let i = 0; i < TEAM_COUNT; i++) {
    const teamId = randomUUID();
    const teamName = `${faker.company.name()} Lab`;
    await insertTeam(pool, {
      id: teamId,
      name: teamName,
      slug: uniqueSlug(teamName, takenSlugs),
    });

    // The admin owns every seeded team, so signing in with the known
    // credentials shows a populated instance rather than one empty team.
    await insertMember(pool, { teamId, userId: adminId, role: 'owner' });

    const memberCount = faker.number.int({
      min: MIN_MEMBERS_PER_TEAM,
      max: MAX_MEMBERS_PER_TEAM,
    });
    for (let m = 0; m < memberCount; m++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const userId = randomUUID();
      await insertUser(pool, {
        id: userId,
        name: `${firstName} ${lastName}`,
        email: uniqueEmail(firstName, lastName, takenEmails),
        emailVerified: faker.datatype.boolean(),
      });
      // The first non-admin member manages the team; the rest are a mix of
      // admins and plain members, so every role actually appears somewhere.
      const role: TeamRole =
        m === 0 ? 'admin' : faker.helpers.arrayElement(TEAM_ROLES);
      await insertMember(pool, { teamId, userId, role });
    }
  }

  // oxlint-disable-next-line no-console -- the deploy-time and dev-boot seed's own progress output
  console.log(
    `Seeded ${TEAM_COUNT} teams with synthetic members. Sign in as the admin: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`,
  );
}
