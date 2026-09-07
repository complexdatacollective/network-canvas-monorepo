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

test('restore grants only a trapped Registry owner login window during recovery', async () => {
  const restore = await readFile(restorePath, 'utf8');
  const armExitTrap = restore.indexOf('trap close_registry_migrator EXIT');
  const armSignalTrap = restore.indexOf("trap 'exit 1' HUP INT TERM");
  const open = restore.indexOf('registry_migrator_open=1');
  const grantOwnerLogin = restore.indexOf(
    'ALTER ROLE registry_migrator LOGIN;',
  );
  const closeRuntime = restore.indexOf(
    'ALTER ROLE registry_runtime NOLOGIN;',
    open,
  );
  const recover = restore.indexOf(
    'compose run --rm --no-deps -T registry-recover-verify',
  );
  const closeOwner = restore.indexOf('close_registry_migrator\n', recover);
  const disarmTrap = restore.indexOf('trap - EXIT HUP INT TERM', closeOwner);

  assert.ok(armExitTrap >= 0);
  assert.ok(armSignalTrap > armExitTrap);
  assert.ok(open > armSignalTrap);
  assert.ok(grantOwnerLogin > open);
  assert.ok(closeRuntime > open);
  assert.ok(recover > closeRuntime);
  assert.ok(closeOwner > recover);
  assert.ok(disarmTrap > closeOwner);

  const runtimeQuarantine = restore.slice(closeRuntime, recover);
  assert.match(runtimeQuarantine, /ALTER ROLE registry_operations NOLOGIN;/);
  assert.doesNotMatch(
    runtimeQuarantine,
    /ALTER ROLE registry_migrator NOLOGIN;/,
  );
});
