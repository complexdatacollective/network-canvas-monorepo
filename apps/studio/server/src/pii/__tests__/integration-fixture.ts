import { randomUUID } from 'node:crypto';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import type { AuditedCommandContext } from '../../audit/command.ts';
import { initializeEncryption } from '../initialize.ts';
import { configuration, rootOne } from './fixtures.ts';

const database = await reachableDb();
export const contacts = {
  email: '  PERSON@example.org ',
  phone: '+1 (312) 555-0100',
  name: 'Synthetic Participant',
  attributes: { language: 'en', context: { cohort: 3 } },
};

export async function participantFixture(
  work: (input: {
    scratch: Awaited<ReturnType<typeof createScratchSchema>>;
    keys: Awaited<ReturnType<typeof initializeEncryption>>;
    context: AuditedCommandContext;
    target: { studyId: string; participantId: string };
  }) => Promise<void>,
) {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchSchema(database);
  try {
    await provisionScratchSchema(scratch.pool);
    const keys = await initializeEncryption({
      maintenancePool: scratch.maintenance,
      configuration: configuration(),
      loadRootKey: async () => rootOne,
    });
    const teamId = randomUUID();
    const userId = randomUUID();
    const protocolId = randomUUID();
    const studyId = randomUUID();
    const participantId = randomUUID();
    await seedTeam(scratch.pool, teamId);
    await scratch.pool.query(
      'INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
      [userId, 'Researcher', 'researcher@example.org'],
    );
    await scratch.pool.query(
      'INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, now())',
      [randomUUID(), teamId, userId, 'owner'],
    );
    await scratch.pool.query(
      'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)',
      [protocolId, teamId, 'Protocol'],
    );
    await scratch.pool.query(
      'INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, $4)',
      [studyId, teamId, protocolId, 'Study'],
    );
    await scratch.pool.query(
      'INSERT INTO participants (id, team_id, study_id, participant_code) VALUES ($1, $2, $3, $4)',
      [participantId, teamId, studyId, 'P-0001'],
    );
    await scratch.pool.query(
      'INSERT INTO study_role_grants (id, team_id, study_id, user_id, role, pii_access, granted_by_user_id) VALUES ($1, $2, $3, $4, $5, true, $4)',
      [randomUUID(), teamId, studyId, userId, 'manager'],
    );
    const context: AuditedCommandContext = {
      tenantDb: createTenantDb(scratch.app, teamId),
      principal: {
        kind: 'user',
        userId,
        email: 'researcher@example.org',
        emailVerified: true,
        name: 'Researcher',
        sessionId: randomUUID(),
        locale: null,
      },
      requestId: randomUUID(),
    };
    await work({ scratch, keys, context, target: { studyId, participantId } });
  } finally {
    await scratch.dispose();
  }
}
