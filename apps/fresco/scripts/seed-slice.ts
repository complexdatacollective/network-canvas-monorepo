/* eslint-disable no-console */
/**
 * Seeds the minimum data the Phase B migration slice needs: a configured
 * instance, one owner account, one protocol, one participant, and a handful of
 * interviews. Throwaway — it exists to exercise the ported routes against a
 * real database, not to become part of the app.
 */
import dotenv from 'dotenv';

dotenv.config();

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '~/lib/db/generated/client';
import { hashPassword } from '~/utils/password';

const adapter = new PrismaPg({
  // eslint-disable-next-line no-process-env
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = 'sliceuser';
  const password = 'slice-password-1234';

  await prisma.appSettings.upsert({
    where: { key: 'configured' },
    create: { key: 'configured', value: 'true' },
    update: { value: 'true' },
  });
  await prisma.appSettings.upsert({
    where: { key: 'enableInterviewDataApi' },
    create: { key: 'enableInterviewDataApi', value: 'true' },
    update: { value: 'true' },
  });

  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      key: {
        create: {
          id: `username:${username}`,
          hashed_password: await hashPassword(password),
        },
      },
    },
    update: {},
  });

  const protocol = await prisma.protocol.upsert({
    where: { hash: 'slice-protocol-hash' },
    create: {
      hash: 'slice-protocol-hash',
      name: 'Slice Protocol',
      schemaVersion: 8,
      description: 'Seeded for the migration slice',
      lastModified: new Date(),
      stages: [{ id: 'a', type: 'NameGenerator', label: 'One' }],
      codebook: { node: { person: { name: 'Person', color: 'sea-green' } } },
    },
    update: {},
  });

  const participant = await prisma.participant.upsert({
    where: { identifier: 'slice-participant' },
    create: { identifier: 'slice-participant', label: 'Slice Participant' },
    update: {},
  });

  const existing = await prisma.interview.count();
  if (existing === 0) {
    for (let i = 0; i < 3; i++) {
      await prisma.interview.create({
        data: {
          protocolId: protocol.id,
          participantId: participant.id,
          currentStep: i,
          network: { nodes: [], edges: [] },
          stageMetadata: {},
        },
      });
    }
  }

  const token = 'slice-api-token';
  const { createHash } = await import('node:crypto');
  const hashed = createHash('sha256').update(token).digest('hex');
  await prisma.apiToken.upsert({
    where: { token: hashed },
    create: { token: hashed, description: 'slice', isActive: true },
    update: { isActive: true },
  });

  console.log(
    JSON.stringify(
      {
        userId: user.id,
        username,
        password,
        protocolId: protocol.id,
        interviews: await prisma.interview.count(),
        apiToken: token,
      },
      null,
      2,
    ),
  );
}

await main();
await prisma.$disconnect();
