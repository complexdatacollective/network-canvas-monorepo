import { SyncServer } from '@codaco/studio-sync/server';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { assertSectionValid } from './validate.ts';

export function createProtocolSyncServer(
  db: TenantDb,
  ttlMs?: number,
): SyncServer {
  return new SyncServer(db, ttlMs, assertSectionValid);
}
