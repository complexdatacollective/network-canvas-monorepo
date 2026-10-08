import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ownerRows, testDb } from './support/database.ts';
import { ancestorsOf } from './support/observe.ts';
import {
  type ObservedServer,
  startObservedServer,
} from './support/observed-server.ts';

describe.skipIf(!testDb)('one request, followed through every output', () => {
  let server: ObservedServer;

  beforeAll(async () => {
    server = await startObservedServer('request-correlation');
  });

  afterAll(async () => {
    await server.dispose();
  });

  it('carries the response header id in every log record, the root span and the audit event', async () => {
    const offered = randomUUID();
    const protocolId = randomUUID();
    const response = await server.rpc(
      'protocols.create',
      {
        teamId: server.teamId,
        name: 'Correlated protocol',
        protocolId,
        draftId: randomUUID(),
      },
      { 'x-request-id': offered },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(protocolId);

    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe(offered);

    const created = server.observed.spans.find(
      (span) => span.name === 'RpcServer.protocols.create',
    );
    expect(created).toBeDefined();
    const root = ancestorsOf(created!).at(-1) ?? created!;
    expect(root._tag).toBe('Span');

    const inRequest = server.observed.records.filter(
      (record) => record.annotations.trace_id === root.traceId,
    );
    expect(inRequest.length).toBeGreaterThan(0);
    for (const record of inRequest) {
      expect(record.annotations.request_id).toBe(requestId);
    }

    expect(
      root._tag === 'Span' ? root.attributes.get('studio.request_id') : null,
    ).toBe(requestId);

    const events = await server.database.run(
      ownerRows<{ request_id: string }>(
        `SELECT request_id FROM audit_events
         WHERE team_id = $1 AND resource_id = $2`,
        [server.teamId, protocolId],
      ),
    );
    expect(events.map((event) => event.request_id)).toEqual([requestId]);
  });
});
