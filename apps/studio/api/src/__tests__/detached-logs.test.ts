import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Logger } from 'effect';
import { vi } from 'vitest';

import { createStudio } from '../app.ts';
import { createOwnerPool } from '../db/pool.ts';
import { readEnv } from '../env.ts';
import { RequestId } from '../http/middleware/request-id.ts';
import { studioStructured } from '../platform/logger.ts';
import { absentDataServices } from './support/services.ts';

type Record = ReturnType<typeof studioStructured.log>;

describe('a failed installation read for status', () => {
  it.effect('is logged on the request it was read for', () =>
    Effect.gen(function* () {
      const services = yield* Layer.build(absentDataServices);
      const studio = createStudio(readEnv(), { services });
      const records: Record[] = [];
      const installation = yield* studio.rpc.readInstallation.pipe(
        Effect.provideService(RequestId, 'request-1'),
        Effect.provide(
          Logger.layer([
            Logger.map(studioStructured, (record) => {
              records.push(record);
            }),
          ]),
        ),
      );
      expect(installation).toBeNull();
      const failure = records.find(
        (record) =>
          record.message === 'Could not read the installation row for status',
      );
      expect(failure?.annotations.request_id).toBe('request-1');
    }).pipe(Effect.scoped),
  );
});

describe('an idle pool client error', () => {
  const emitIdleError = async (logLevel: 'None' | 'Error') => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line) => {
      lines.push(String(line));
    });
    const { db } = readEnv();
    const pool = createOwnerPool(
      db ?? { url: 'postgres://studio@127.0.0.1:1/studio' },
      { logLevel },
    );
    try {
      pool.emit('error', new Error('terminated'));
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      log.mockRestore();
      await pool.end();
    }
    return lines.filter((line) =>
      line.includes('Postgres pool error on an idle client'),
    );
  };

  it('is written at the configured level', async () => {
    expect(await emitIdleError('Error')).toHaveLength(1);
  });

  it('is not written when the configured level is above it', async () => {
    expect(await emitIdleError('None')).toEqual([]);
  });
});
