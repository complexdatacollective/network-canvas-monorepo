import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const restorePath = new URL(
  '../apps/studio/deployment/restore.sh',
  import.meta.url,
);
const backupPath = new URL(
  '../apps/studio/deployment/backup.sh',
  import.meta.url,
);

test('backup adds the encryption overlay without composing the base file twice', async () => {
  const backup = await readFile(backupPath, 'utf8');
  assert.match(
    backup,
    /STUDIO_ENCRYPTION_FILE="\$custody" compose -f deployment\/encryption\.yml run --rm --no-deps encryption-verify/,
  );
  assert.doesNotMatch(
    backup,
    /compose -f docker-compose\.yml -f deployment\/encryption\.yml/,
  );
});

test('restore starts only the internal object stores after extraction and before isolated initialization', async () => {
  const restore = await readFile(restorePath, 'utf8');
  const studioExtraction = restore.indexOf(
    'compose run --rm --no-deps -T --entrypoint tar minio',
  );
  const registryExtraction = restore.indexOf(
    'compose run --rm --no-deps -T --entrypoint tar registry-minio',
  );
  const start = restore.indexOf('compose up -d minio registry-minio');
  const studioInitialization = restore.indexOf(
    'compose run --rm --no-deps -T minio-init',
  );
  const registryInitialization = restore.indexOf(
    'compose run --rm --no-deps -T registry-minio-init',
  );

  assert.ok(studioExtraction >= 0);
  assert.ok(registryExtraction > studioExtraction);
  assert.ok(start > registryExtraction);
  assert.ok(studioInitialization > start);
  assert.ok(registryInitialization > studioInitialization);

  const startedServices = restore
    .split('\n')
    .filter((line) => line.startsWith('compose up '));
  assert.deepEqual(startedServices, [
    'compose up -d --wait postgres registry-postgres',
    'compose up -d minio registry-minio',
  ]);
});

test('restore quarantines every Studio writer before the first restore write', async () => {
  const restore = await readFile(restorePath, 'utf8');
  const closeRuntime = restore.indexOf('ALTER ROLE studio_runtime NOLOGIN;');
  const closeMaintenance = restore.indexOf(
    'ALTER ROLE studio_maintenance_runtime NOLOGIN;',
  );
  const closeMigrator = restore.indexOf('ALTER ROLE studio_migrator NOLOGIN;');
  const firstRestore = restore.indexOf(
    'compose exec -T postgres pg_restore -U postgres -d studio',
  );

  assert.ok(closeRuntime >= 0);
  assert.ok(closeMaintenance > closeRuntime);
  assert.ok(closeMigrator > closeMaintenance);
  assert.ok(firstRestore > closeMigrator);
  assert.doesNotMatch(restore, /ALTER ROLE studio_backup_login NOLOGIN;/);
});

test('restore grants only the Registry owner a fully trapped recovery window', async () => {
  const restore = await readFile(restorePath, 'utf8');
  const armExitTrap = restore.indexOf('trap cleanup_restore EXIT');
  const databaseStart = restore.indexOf(
    'compose up -d --wait postgres registry-postgres',
  );
  const initialQuarantine = restore.indexOf(
    'close_writer_logins',
    databaseStart,
  );
  const backupVerify = restore.indexOf(
    'compose run --rm --no-deps -T registry-backup-verify',
  );
  const grantOwnerLogin = restore.indexOf(
    'ALTER ROLE registry_migrator LOGIN;',
  );
  const recover = restore.indexOf(
    'compose run --rm --no-deps -T registry-recover-verify',
  );
  const finalQuarantine = restore.indexOf('close_writer_logins', recover);

  assert.ok(armExitTrap >= 0);
  assert.ok(armExitTrap < databaseStart);
  assert.ok(initialQuarantine > databaseStart);
  assert.ok(backupVerify > initialQuarantine);
  assert.ok(grantOwnerLogin > backupVerify);
  assert.ok(recover > grantOwnerLogin);
  assert.ok(finalQuarantine > recover);
  assert.doesNotMatch(
    restore,
    /ALTER ROLE registry_(runtime|operations) LOGIN;/,
  );
  assert.doesNotMatch(restore, /registry-migrate/);
});
