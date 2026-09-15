// The auth tier: the admin who can sign in, the teams they own, and the
// colleagues who exercise the remaining team roles. None of these tables
// carries a row-level security policy, so this phase runs before any team GUC
// is stamped.
import { faker } from '@faker-js/faker';
import { hashPassword } from 'better-auth/crypto';
import type pg from 'pg';

import { TEAM_ROLES, type TeamRole } from '@codaco/studio-rpc';

import { insertRows, type SeedRowValue } from './insert.ts';
import { seedTime, seedUuid, shiftDays } from './rng.ts';

const SEED_ADMIN_NAME = 'Studio Admin';
export const SEED_ADMIN_EMAIL = 'admin@studio.test';
export const SEED_ADMIN_PASSWORD = 'studio-admin-not-for-production';

/**
 * What a seeded instance calls itself. The seed also makes the admin its
 * owner, which closes first-run setup (#1909): every `pnpm dev` boot comes up
 * as an instance somebody already set up, so `/setup` is a not-found there
 * rather than an open door onto a database full of synthetic studies.
 */
const SEED_INSTANCE_NAME = 'Studio (development)';

const TEAM_COUNT = 5;
const MIN_MEMBERS_PER_TEAM = 2;
const MAX_MEMBERS_PER_TEAM = 6;

// The seeded admin is every team's only owner; the other members exercise
// the remaining roles.
const NON_OWNER_ROLES = TEAM_ROLES.filter((role) => role !== 'owner');

export type SeedTeamMember = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
};

export type SeedTeam = {
  id: string;
  index: number;
  name: string;
  slug: string;
  /** The seeded admin: this team's owner and every study's creator. */
  adminUserId: string;
  /** Every membership, the admin's included. */
  members: SeedTeamMember[];
};

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

/**
 * The installation row, owned. Written here because the owner is the seeded
 * admin and this is the phase that creates them; the wipe truncates this table
 * like any other, so it is reinstated on every seed rather than surviving one.
 */
async function insertOwnedInstallation(
  client: pg.ClientBase,
  input: { ownerUserId: string; createdAt: Date },
): Promise<void> {
  await client.query(
    `insert into installation (id, name, owner_user_id, created_at, updated_at)
     values (1, $1, $2, $3, $3)`,
    [SEED_INSTANCE_NAME, input.ownerUserId, input.createdAt],
  );
}

/**
 * The `credential` provider account better-auth's own email/password sign-up
 * would create, hashed with the same `better-auth/crypto` function it
 * verifies against — so this password works through the real sign-in
 * endpoint, not just as a stored value.
 *
 * The hash is the one value in the whole seed that is not reproducible: scrypt
 * draws a fresh salt per call, which no PRNG seed reaches.
 */
async function insertCredentialAccount(
  client: pg.ClientBase,
  input: { userId: string; password: string; createdAt: Date },
): Promise<void> {
  const password = await hashPassword(input.password);
  await client.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1, $2, 'credential', $2, $3, $4, $4)`,
    [seedUuid(), input.userId, password, input.createdAt],
  );
}

export async function seedTeams(
  client: pg.PoolClient,
  adminPassword: string,
): Promise<SeedTeam[]> {
  const createdAt = seedTime(-400);
  const adminId = seedUuid();
  const userRows: SeedRowValue[][] = [
    [adminId, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, true, createdAt, createdAt],
  ];
  const teamRows: SeedRowValue[][] = [];
  const memberRows: SeedRowValue[][] = [];
  const teams: SeedTeam[] = [];

  const takenSlugs = new Set<string>();
  const takenEmails = new Set<string>([SEED_ADMIN_EMAIL]);

  for (let index = 0; index < TEAM_COUNT; index++) {
    const teamId = seedUuid();
    const teamName = `${faker.company.name()} Lab`;
    const slug = uniqueSlug(teamName, takenSlugs);
    const teamCreatedAt = shiftDays(createdAt, index);
    teamRows.push([teamId, teamName, slug, teamCreatedAt]);

    const members: SeedTeamMember[] = [];
    // The admin owns every seeded team, so signing in with the known
    // credentials shows a populated instance rather than one empty team.
    const adminMemberId = seedUuid();
    members.push({
      memberId: adminMemberId,
      userId: adminId,
      name: SEED_ADMIN_NAME,
      email: SEED_ADMIN_EMAIL,
      role: 'owner',
    });
    memberRows.push([adminMemberId, teamId, adminId, 'owner', teamCreatedAt]);

    const memberCount = faker.number.int({
      min: MIN_MEMBERS_PER_TEAM,
      max: MAX_MEMBERS_PER_TEAM,
    });
    for (let m = 0; m < memberCount; m++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const userId = seedUuid();
      const memberId = seedUuid();
      const name = `${firstName} ${lastName}`;
      const email = uniqueEmail(firstName, lastName, takenEmails);
      const joinedAt = shiftDays(teamCreatedAt, m + 1);
      userRows.push([
        userId,
        name,
        email,
        faker.datatype.boolean(),
        joinedAt,
        joinedAt,
      ]);
      // The first non-admin member manages the team; the rest are a mix of
      // admins and plain members, so every role actually appears somewhere.
      const role: TeamRole =
        m === 0 ? 'admin' : faker.helpers.arrayElement(NON_OWNER_ROLES);
      memberRows.push([memberId, teamId, userId, role, joinedAt]);
      members.push({ memberId, userId, name, email, role });
    }

    teams.push({
      id: teamId,
      index,
      name: teamName,
      slug,
      adminUserId: adminId,
      members,
    });
  }

  await insertRows(
    client,
    '"user"',
    ['id', 'name', 'email', '"emailVerified"', '"createdAt"', '"updatedAt"'],
    userRows,
  );
  await insertCredentialAccount(client, {
    userId: adminId,
    password: adminPassword,
    createdAt,
  });
  await insertOwnedInstallation(client, {
    ownerUserId: adminId,
    createdAt,
  });
  await insertRows(
    client,
    'teams',
    ['id', 'name', 'slug', 'created_at'],
    teamRows,
  );
  await insertRows(
    client,
    'team_members',
    ['id', 'team_id', 'user_id', 'role', 'created_at'],
    memberRows,
  );

  return teams;
}

/** The members a team-owned service token may name as its custodian. */
export function custodians(team: SeedTeam): SeedTeamMember[] {
  return team.members.filter(
    (member) => member.role === 'owner' || member.role === 'admin',
  );
}
