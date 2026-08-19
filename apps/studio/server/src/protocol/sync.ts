import type pg from 'pg';

import { SyncServer } from '@codaco/studio-sync/server';

import { assertSectionValid } from './validate.ts';

export function createProtocolSyncServer(
  db: pg.Pool,
  ttlMs?: number,
): SyncServer {
  return new SyncServer(db, ttlMs, assertSectionValid);
}
