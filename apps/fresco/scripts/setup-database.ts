/* eslint-disable no-console */
import dotenv from 'dotenv';

dotenv.config();

import { execSync, spawnSync } from 'child_process';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '~/lib/db/generated/client';

import { migrateInterviewCategoricals } from './migrate-interview-categoricals';

// CLI scripts must use the PG adapter directly because the Neon serverless
// adapter doesn't work in CLI/Node.js context (only in serverless runtimes)
const adapter = new PrismaPg({
  // eslint-disable-next-line no-process-env
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

type TableRow = {
  table_name: string;
};

function checkForNeededMigrations(): boolean {
  const command = 'npx';
  const args = [
    'prisma',
    'migrate',
    'diff',
    '--from-schema',
    './lib/db/schema.prisma',
    '--to-config-datasource',
    '--exit-code',
  ];

  console.log(`Running: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf-8' });

  if (result.error) {
    console.error('Failed to spawn command:', result.error);
    throw result.error;
  }

  if (result.stdout) console.log('stdout:', result.stdout);
  if (result.stderr) console.log('stderr:', result.stderr);
  console.log('Exit code:', result.status);

  if (result.status === 0) {
    console.log('No differences between DB and schema detected.');
    return false;
  } else if (result.status === 2) {
    console.log('There are differences between the schemas.');
    return true;
  }

  throw new Error(`prisma migrate diff failed with exit code ${result.status}`);
}

/**
 * This function checks if the database is in a state where the workaround is needed.
 *
 * The workaround is needed when the database is not empty and the _prisma_migrations
 * table does not exist.
 */
async function shouldApplyWorkaround(): Promise<boolean> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

  const databaseNotEmpty = tables.length > 0;
  const migrationsTableExists = tables.some(
    (table) => table.table_name === '_prisma_migrations',
  );

  return !migrationsTableExists && databaseNotEmpty;
}

async function handleMigrations(): Promise<void> {
  try {
    console.log('Starting migration process...');

    const applyWorkaround = await shouldApplyWorkaround();
    console.log('Should apply workaround:', applyWorkaround);

    if (applyWorkaround) {
      console.log(
        'Workaround needed! Running: prisma migrate resolve --applied 0_init',
      );
      execSync('npx prisma migrate resolve --applied 0_init', {
        stdio: 'inherit',
      });
    }

    const needsMigrations = checkForNeededMigrations();
    console.log('Needs migrations:', needsMigrations);

    if (needsMigrations) {
      console.log('Running: prisma migrate deploy');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('Migrations applied successfully.');
    } else {
      console.log('No migrations needed.');
    }
  } catch (error) {
    console.error('Error during migration process:', error);
    process.exit(1);
  }
}

// Generous ceiling for the one-time data migration, which runs at deploy time
// with no concurrent app traffic. If a deployment exceeds it, raise this rather
// than splitting the migration across transactions.
const DATA_MIGRATION_TIMEOUT_MS = 1000 * 60 * 30;

// Stored protocols and their interviews are never upgraded here. Each one stays
// at the schema version it was imported at and runs in the interview bundled
// for that version (`lib/schema-8/version.ts`); a researcher upgrades a
// protocol by choosing to when they import it.
let setupFailed = false;

try {
  await handleMigrations();

  // One transaction, so a failure rolls the whole data migration back rather
  // than leaving the previous Fresco version, which keeps serving when the
  // deploy aborts, reading half-converted networks.
  await prisma.$transaction(
    async (tx) => {
      await migrateInterviewCategoricals(tx);
    },
    { timeout: DATA_MIGRATION_TIMEOUT_MS },
  );
} catch (error) {
  console.error('Error during database setup:', error);
  setupFailed = true;
} finally {
  await prisma.$disconnect();
}

if (setupFailed) process.exit(1);
