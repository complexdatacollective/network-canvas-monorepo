import { randomUUID } from 'node:crypto';

import { Redacted, type Tracer } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDb } from './support/database.ts';
import { ancestorsOf } from './support/observe.ts';
import {
  type ObservedServer,
  startObservedServer,
} from './support/observed-server.ts';

const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? '');

describe.skipIf(!testDb)('the spans of one signed-in change', () => {
  let server: ObservedServer;

  beforeAll(async () => {
    server = await startObservedServer('spans');
  });

  afterAll(async () => {
    await server.dispose();
  });

  it('nest a route span, then the command span, then the statements it ran, with no bound value in any attribute', async () => {
    const name = `Span seed ${randomUUID()}`;
    const protocolId = randomUUID();
    const response = await server.rpc('protocols.create', {
      teamId: server.teamId,
      name,
      protocolId,
      draftId: randomUUID(),
    });
    expect(await response.text()).toContain(protocolId);

    const command = server.observed.spans.find(
      (span) => span.name === 'protocol.create',
    );
    expect(command).toBeDefined();
    const route = ancestorsOf(command!).at(-1);
    expect(route?._tag).toBe('Span');
    expect((route as Tracer.Span).kind).toBe('server');

    const trace = server.observed.spans.filter(
      (span) => span.traceId === command!.traceId,
    );
    const statements = trace.filter(
      (span) =>
        span.name === 'sql.execute' && ancestorsOf(span).includes(command!),
    );
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(ancestorsOf(statement).at(-1)).toBe(route);
    }

    const seeds = [
      name,
      Redacted.value(server.principal.email),
      Redacted.value(server.principal.name),
    ];
    for (const span of trace) {
      for (const [key, value] of span.attributes) {
        for (const seed of seeds) {
          expect(`${span.name} ${key}=${textOf(value)}`).not.toContain(seed);
        }
      }
    }
  });
});
