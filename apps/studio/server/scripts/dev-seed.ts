import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { createOwnerPool, createPool } from '../src/db/pool.ts';
import type { DbEnv } from '../src/env.ts';
import { ProtocolStore } from '../src/protocol/store.ts';

// The development fixture, kept out of src/db/seed.ts because that one runs
// once per deployment: this writes a signed-in-able account and a protocol to
// look at, which no deployment should ever receive. Living in scripts/ also
// lets it read @codaco/protocols, a devDependency the server bundle cannot
// reach.
//
// Every identity is fixed rather than generated, so a reset lands the same
// ids, the same sign-in address and the same protocol each time — a URL from
// the last session still resolves after the next one.
const DEV_SEED = {
  userId: 'dev-seed-owner',
  userName: 'Development Owner',
  // Sign-in is magic-link and sign-up is open (#1255), so entering any other
  // address creates a fresh user with no team. This is the address that lands
  // in the seeded team.
  email: 'owner@studio.localhost',
  teamId: 'dev-seed-team',
  teamName: 'Development Team',
  teamSlug: 'development',
  memberId: 'dev-seed-owner-membership',
  protocolId: '6b0f8e8e-6d0f-4a2f-9a8f-2b1c0d3e4f50',
  draftId: '6b0f8e8e-6d0f-4a2f-9a8f-2b1c0d3e4f51',
} as const;

const SAMPLE_PROTOCOL = '@codaco/protocols/sample';

function loadSampleProtocol(): CurrentProtocol {
  const path = fileURLToPath(import.meta.resolve(SAMPLE_PROTOCOL));
  return JSON.parse(readFileSync(path, 'utf8')) as CurrentProtocol;
}

/**
 * Writes the development fixture: an owner, the team they own, and the sample
 * protocol as a draft in it. Safe to rerun — every write is conditional — but
 * it is the development lane's caller that decides a database may receive it.
 */
export async function devSeed(db: DbEnv): Promise<void> {
  const owner = createOwnerPool(db);
  // The tenant store runs as the application role, the way the server does,
  // so row-level security applies to the rows this writes.
  const app = createPool(db);
  try {
    await owner.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "updatedAt")
       VALUES ($1, $2, $3, true, now())
       ON CONFLICT (id) DO NOTHING`,
      [DEV_SEED.userId, DEV_SEED.userName, DEV_SEED.email],
    );
    await owner.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [DEV_SEED.teamId, DEV_SEED.teamName, DEV_SEED.teamSlug],
    );
    await owner.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')
       ON CONFLICT (id) DO NOTHING`,
      [DEV_SEED.memberId, DEV_SEED.teamId, DEV_SEED.userId],
    );

    const store = new ProtocolStore(createTenantDb(app, DEV_SEED.teamId));
    const protocol = loadSampleProtocol();
    await store.createProtocol({
      protocol,
      protocolId: DEV_SEED.protocolId,
      draftId: DEV_SEED.draftId,
    });
    console.log(
      `Seeded ${DEV_SEED.email} · team “${DEV_SEED.teamName}” · 1 protocol`,
    );
  } finally {
    await Promise.all([owner.end(), app.end()]);
  }
}
