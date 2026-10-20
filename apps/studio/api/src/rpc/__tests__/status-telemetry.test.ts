import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, type LogLevel, References } from 'effect';
import { RpcTest } from 'effect/rpc';

import { Authenticated } from '@codaco/studio-contract/middleware/authenticated';
import { StatusRpcs } from '@codaco/studio-contract/rpc/status';

import { createStudio } from '../../app.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { ErrorReporter } from '../../platform/error-reporter.ts';
import { StatusHandlers } from '../handlers/status.ts';

const statusUnder = (level: LogLevel.LogLevel, telemetry: boolean) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(StatusRpcs, { flatten: true });
    return yield* client('status', undefined);
  }).pipe(
    Effect.scoped,
    Effect.provide(StatusHandlers(createStudio().rpc)),
    Effect.provide(
      telemetry
        ? Layer.succeed(
            ErrorReporter,
            ErrorReporter.of({
              report: () => Effect.void,
              reportException: () => Effect.void,
            }),
          )
        : Layer.empty,
    ),
    Effect.provide(Layer.succeed(References.MinimumLogLevel, level)),
    Effect.provide(
      Layer.succeed(Authenticated)(() =>
        Effect.die(new Error('only the public status rpc is called')),
      ),
    ),
    Effect.provide(DatabaseAbsent),
  );

describe('the status rpc', () => {
  it.effect('reports the configured log level beside the telemetry flag', () =>
    Effect.gen(function* () {
      const quiet = yield* statusUnder('Warn', true);
      expect([quiet.telemetry, quiet.logLevel]).toEqual([true, 'Warn']);
      const verbose = yield* statusUnder('Debug', false);
      expect([verbose.telemetry, verbose.logLevel]).toEqual([false, 'Debug']);
    }),
  );
});
