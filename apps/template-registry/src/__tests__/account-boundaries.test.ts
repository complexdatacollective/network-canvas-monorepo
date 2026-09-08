import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createRegistryFixture,
  ORIGIN,
  type RegistryFixture,
} from './fixtures.ts';

let fixture: RegistryFixture;
beforeEach(async () => {
  fixture = await createRegistryFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fixture?.dispose();
});

async function refusal(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ status, code });
}

it('reads only the current verified account, including an unclaimed or suspended publisher and live operator state', async () => {
  const first = await fixture.login('first@example.test');
  const other = await fixture.account('other@example.test', true);
  const read = () =>
    fixture.request('GET', '/account', undefined, first.headers);
  const response = await read();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    id: first.session.userId,
    email: 'first@example.test',
    publisher: null,
    suspended: false,
    operator: false,
  });
  const claim = await fixture.request(
    'POST',
    '/account/publisher',
    { name: 'First publisher', orcid: '0000-0002-1825-0097' },
    first.headers,
  );
  expect(claim.status).toBe(200);
  const publisher: unknown = await claim.json();
  expect(await (await read()).json()).toEqual({
    id: first.session.userId,
    email: 'first@example.test',
    publisher,
    suspended: false,
    operator: false,
  });
  await fixture.owner.query(
    'INSERT INTO registry_operators(user_id, enabled) VALUES ($1, true)',
    [first.session.userId],
  );
  expect(await (await read()).json()).toMatchObject({ operator: true });
  await fixture.owner.query(
    'UPDATE registry_publishers SET suspended_at = statement_timestamp() WHERE user_id = $1',
    [first.session.userId],
  );
  expect(await (await read()).json()).toMatchObject({
    publisher,
    suspended: true,
    operator: false,
  });
  await refusal(
    await fixture.request(
      'GET',
      `/account?id=${other.session.userId}`,
      undefined,
      first.headers,
    ),
    400,
    'INVALID_REQUEST',
  );
  await refusal(
    await fixture.request('GET', '/account', undefined, other.bearer),
    401,
    'AUTHENTICATION_REQUIRED',
  );
  await fixture.owner.query(
    'UPDATE registry_auth_user SET email_verified = false WHERE id = $1',
    [first.session.userId],
  );
  vi.spyOn(fixture.auth, 'getSession').mockResolvedValue(first.session);
  await refusal(await read(), 401, 'AUTHENTICATION_REQUIRED');
});

it('binds every private operator command to its actual session and immutable operator audit without issuing a hidden credential', async () => {
  const author = await fixture.account('author@example.test');
  const operator = await fixture.account('operator@example.test', true);
  const published = await fixture.published(author.token);
  const report = await fixture.request(
    'POST',
    `/entries/${published.entry.id}/reports`,
    { category: 'privacy', details: 'Please inspect this artifact.' },
  );
  expect(report.status).toBe(202);
  const credentialsBefore = await fixture.owner.query(
    'SELECT id, token_hash FROM registry_credentials ORDER BY id',
  );
  const request = (method: string, path: string, body?: unknown) =>
    fixture.request(
      method,
      `/account/moderation${path}`,
      body,
      operator.headers,
    );
  const reports = await request('POST', '/reports', { limit: 20 });
  expect(reports.status).toBe(200);
  expect(await reports.json()).toMatchObject({
    data: [
      {
        entry_id: published.entry.id,
        category: 'privacy',
        details: 'Please inspect this artifact.',
      },
    ],
    next_cursor: null,
  });
  for (const [method, path, body] of [
    ['PUT', `/entries/${published.entry.id}/curation`, { curated: true }],
    ['POST', `/entries/${published.entry.id}/takedown`, undefined],
    ['POST', `/entries/${published.entry.id}/restore`, undefined],
    [
      'PUT',
      `/publishers/${author.publisher.id}/suspension`,
      { suspended: true },
    ],
    [
      'PUT',
      `/publishers/${author.publisher.id}/suspension`,
      { suspended: false },
    ],
  ] as const) {
    const response = await request(method, path, body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  }
  const removed = await request('DELETE', `/artifacts/${published.entry.root}`);
  expect(removed.status).toBe(202);
  expect(await removed.json()).toEqual({ ok: true });
  expect(
    (
      await fixture.owner.query(
        "SELECT action, actor_kind, actor_id FROM registry_audit WHERE actor_kind = 'operator' ORDER BY occurred_at, id",
      )
    ).rows,
  ).toEqual(
    [
      'entry.curated',
      'artifact.taken_down',
      'artifact.restored',
      'publisher.suspended',
      'publisher.reinstated',
      'artifact.hard_delete_requested',
    ].map((action) => ({
      action,
      actor_kind: 'operator',
      actor_id: operator.publisher.id,
    })),
  );
  expect(
    (
      await fixture.owner.query(
        'SELECT id, token_hash FROM registry_credentials ORDER BY id',
      )
    ).rows,
  ).toEqual(credentialsBefore.rows);
  for (const pool of [fixture.pool, fixture.operatorPool, fixture.owner]) {
    await expect(
      pool.query(
        "UPDATE registry_audit SET actor_id = 'forged' WHERE actor_kind = 'operator'",
      ),
    ).rejects.toMatchObject({ code: '42501' });
  }
});

it.each([
  'anonymous',
  'foreign-origin',
  'missing-origin',
  'non-operator',
  'disabled-operator',
  'suspended-publisher',
  'unverified-user',
  'bearer-only',
] as const)(
  'refuses every private operator path for %s before changing data or appending an audit',
  async (condition) => {
    const author = await fixture.account('author@example.test');
    const operator = await fixture.account('operator@example.test', true);
    const published = await fixture.published(author.token);
    let headers = new Headers(operator.headers);
    let expectedStatus = 403;
    let expectedCode = 'FORBIDDEN';
    if (condition === 'anonymous') {
      headers = new Headers({ origin: ORIGIN });
      expectedStatus = 401;
      expectedCode = 'AUTHENTICATION_REQUIRED';
    }
    if (condition === 'foreign-origin')
      headers.set('origin', 'https://foreign.test');
    if (condition === 'missing-origin') headers.delete('origin');
    if (condition === 'non-operator') headers = author.headers;
    if (condition === 'disabled-operator')
      await fixture.owner.query(
        'UPDATE registry_operators SET enabled = false WHERE user_id = $1',
        [operator.session.userId],
      );
    if (condition === 'suspended-publisher')
      await fixture.owner.query(
        'UPDATE registry_publishers SET suspended_at = statement_timestamp() WHERE id = $1',
        [operator.publisher.id],
      );
    if (condition === 'unverified-user') {
      await fixture.owner.query(
        'UPDATE registry_auth_user SET email_verified = false WHERE id = $1',
        [operator.session.userId],
      );
      // A stale auth result must not authorize a current database mutation.
      vi.spyOn(fixture.auth, 'getSession').mockResolvedValue(operator.session);
    }
    if (condition === 'bearer-only') {
      headers = new Headers(operator.bearer);
      headers.set('origin', ORIGIN);
      expectedStatus = 401;
      expectedCode = 'AUTHENTICATION_REQUIRED';
    }
    const before = (
      await fixture.owner.query(
        'SELECT * FROM registry_audit ORDER BY occurred_at, id',
      )
    ).rows;
    for (const [method, path, body] of [
      ['POST', '/reports', { limit: 20 }],
      ['PUT', `/entries/${published.entry.id}/curation`, { curated: true }],
      ['POST', `/entries/${published.entry.id}/takedown`, undefined],
      ['POST', `/entries/${published.entry.id}/restore`, undefined],
      [
        'PUT',
        `/publishers/${author.publisher.id}/suspension`,
        { suspended: true },
      ],
      ['DELETE', `/artifacts/${published.entry.root}`, undefined],
    ] as const)
      await refusal(
        await fixture.request(
          method,
          `/account/moderation${path}`,
          body,
          headers,
        ),
        expectedStatus,
        expectedCode,
      );
    expect(
      (
        await fixture.owner.query(
          'SELECT * FROM registry_audit ORDER BY occurred_at, id',
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await fixture.owner.query(
          'SELECT curated_at FROM registry_entries WHERE id = $1',
          [published.entry.id],
        )
      ).rows,
    ).toEqual([{ curated_at: null }]);
    expect(
      (
        await fixture.owner.query(
          'SELECT blocked_at, deleted_at FROM registry_artifacts WHERE root = $1',
          [published.entry.root],
        )
      ).rows,
    ).toEqual([{ blocked_at: null, deleted_at: null }]);
    expect(
      (
        await fixture.owner.query(
          'SELECT suspended_at FROM registry_publishers WHERE id = $1',
          [author.publisher.id],
        )
      ).rows,
    ).toEqual([{ suspended_at: null }]);
    expect(
      (await fixture.owner.query('SELECT root FROM registry_delete_jobs')).rows,
    ).toEqual([]);
  },
);

it('retains bearer-only public moderation and refuses account target injection', async () => {
  const operator = await fixture.account('operator@example.test', true);
  const first = await fixture.published(operator.token, 'First');
  const second = await fixture.published(operator.token, 'Second');
  await refusal(
    await fixture.request(
      'POST',
      `/moderation/entries/${first.entry.id}/takedown`,
      undefined,
      operator.headers,
    ),
    401,
    'AUTHENTICATION_REQUIRED',
  );
  await refusal(
    await fixture.request(
      'POST',
      `/account/moderation/entries/${first.entry.id}/takedown`,
      { id: second.entry.id },
      operator.headers,
    ),
    400,
    'INVALID_REQUEST',
  );
  await refusal(
    await fixture.request(
      'POST',
      `/account/moderation/entries/${first.entry.id}/takedown?id=${second.entry.id}`,
      undefined,
      operator.headers,
    ),
    400,
    'INVALID_REQUEST',
  );
  expect(
    (await fixture.owner.query('SELECT blocked_at FROM registry_artifacts'))
      .rows,
  ).toEqual([{ blocked_at: null }, { blocked_at: null }]);
  expect(
    (
      await fixture.owner.query(
        "SELECT id FROM registry_audit WHERE actor_kind = 'operator'",
      )
    ).rows,
  ).toEqual([]);
  const publicBearer = await fixture.request(
    'POST',
    `/moderation/entries/${first.entry.id}/takedown`,
    undefined,
    operator.bearer,
  );
  expect(publicBearer.status).toBe(200);
});
