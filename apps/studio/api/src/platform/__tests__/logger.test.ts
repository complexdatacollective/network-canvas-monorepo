import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Logger } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

import { RequestIdLive } from '../../http/middleware/request-id.ts';
import { studioStructured } from '../logger.ts';
import { recordRequestTeam } from '../request-team.ts';

type Record = ReturnType<typeof studioStructured.log>;

const CORRELATION_KEYS = ['request_id', 'team_id', 'trace_id', 'span_id'];

const capturing = (records: Record[]) =>
  Logger.layer([
    Logger.map(studioStructured, (record) => {
      records.push(record);
    }),
  ]);

const serve = async (
  route: Effect.Effect<HttpServerResponse.HttpServerResponse>,
  records: Record[],
) => {
  const Routes = HttpRouter.use((router) => router.add('GET', '/probe', route));
  const { handler, dispose } = HttpRouter.toWebHandler(
    Routes.pipe(
      Layer.provideMerge(RequestIdLive),
      Layer.provideMerge(capturing(records)),
    ),
    { disableLogger: true },
  );
  try {
    return await handler(new Request('http://studio.test/probe'));
  } finally {
    await dispose();
  }
};

describe('the Studio logger', () => {
  it('stamps the request id, team id, trace id and span id on a record written while handling a request', async () => {
    const records: Record[] = [];
    const response = await serve(
      Effect.gen(function* () {
        yield* recordRequestTeam('team-1');
        yield* Effect.logInfo('handled').pipe(Effect.withSpan('probe'));
        return HttpServerResponse.text('ok');
      }),
      records,
    );
    const handled = records.find((record) => record.message === 'handled');
    expect(handled?.annotations).toMatchObject({
      request_id: response.headers.get('x-request-id'),
      team_id: 'team-1',
      trace_id: expect.stringMatching(/^[0-9a-f]+$/),
      span_id: expect.stringMatching(/^[0-9a-f]+$/),
    });
  });

  it('leaves the team id off a request that never opens a team scope', async () => {
    const records: Record[] = [];
    const response = await serve(
      Effect.as(Effect.logInfo('handled'), HttpServerResponse.text('ok')),
      records,
    );
    const handled = records.find((record) => record.message === 'handled');
    expect(handled?.annotations.request_id).toBe(
      response.headers.get('x-request-id'),
    );
    expect(handled?.annotations).not.toHaveProperty('team_id');
  });

  it.effect('writes none of the correlation keys outside a request', () =>
    Effect.gen(function* () {
      const records: Record[] = [];
      yield* Effect.logInfo('outside').pipe(Effect.provide(capturing(records)));
      expect(records).toHaveLength(1);
      for (const key of CORRELATION_KEYS) {
        expect(records[0]?.annotations).not.toHaveProperty(key);
      }
    }),
  );

  it.effect(
    'writes the trace and span ids but no request or team id in a span outside a request',
    () =>
      Effect.gen(function* () {
        const records: Record[] = [];
        yield* Effect.logInfo('outside').pipe(
          Effect.withSpan('job'),
          Effect.provide(capturing(records)),
        );
        expect(Object.keys(records[0]?.annotations ?? {}).toSorted()).toEqual([
          'span_id',
          'trace_id',
        ]);
      }),
  );

  it.effect('does not carry a recorded team into a later request', () =>
    Effect.promise(async () => {
      const records: Record[] = [];
      await serve(
        Effect.as(recordRequestTeam('team-1'), HttpServerResponse.text('ok')),
        records,
      );
      await serve(
        Effect.as(Effect.logInfo('second'), HttpServerResponse.text('ok')),
        records,
      );
      const second = records.find((record) => record.message === 'second');
      expect(second?.annotations).not.toHaveProperty('team_id');
    }),
  );
});
