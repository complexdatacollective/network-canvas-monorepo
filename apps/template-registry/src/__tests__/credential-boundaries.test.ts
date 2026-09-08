import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { TokenDescriptionSchema } from '../account-contract.ts';
import {
  createRegistryFixture,
  ORIGIN,
  template,
  type RegistryFixture,
} from './fixtures.ts';

const issuedToken = z.strictObject({
  token: z.string(),
  credential: TokenDescriptionSchema,
});
const tokenList = z.strictObject({ data: z.array(TokenDescriptionSchema) });
let fixture: RegistryFixture;

beforeEach(async () => {
  fixture = await createRegistryFixture();
});
afterEach(async () => {
  await fixture?.dispose();
});

async function refusal(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ status, code });
}

it('keeps token lists and revocation bound to their verified account and immediately refuses a revoked bearer', async () => {
  const first = await fixture.account('first@example.test');
  const second = await fixture.account('second@example.test');
  const replica = fixture.createReplica();
  for (const [account, other] of [
    [first, second],
    [second, first],
  ] as const) {
    const response = await fixture.request(
      'GET',
      '/account/tokens',
      undefined,
      account.headers,
      replica.app,
    );
    expect(response.status).toBe(200);
    expect(tokenList.parse(await response.json()).data).toEqual([
      account.credential,
    ]);
    await refusal(
      await fixture.request(
        'DELETE',
        `/account/tokens/${other.credential.id}`,
        undefined,
        account.headers,
        replica.app,
      ),
      404,
      'NOT_FOUND',
    );
  }
  expect(
    (await fixture.owner.query('SELECT revoked_at FROM registry_credentials'))
      .rows,
  ).toEqual([{ revoked_at: null }, { revoked_at: null }]);
  expect(
    (
      await fixture.owner.query(
        "SELECT id FROM registry_audit WHERE action = 'credential.revoked'",
      )
    ).rows,
  ).toEqual([]);
  expect(
    (await fixture.request('GET', '/publisher', undefined, first.bearer))
      .status,
  ).toBe(200);
  for (let attempt = 0; attempt < 2; attempt++)
    expect(
      (
        await fixture.request(
          'DELETE',
          `/account/tokens/${first.credential.id}`,
          undefined,
          first.headers,
          replica.app,
        )
      ).status,
    ).toBe(200);
  expect(
    (
      await fixture.owner.query(
        "SELECT actor_id, subject_id FROM registry_audit WHERE action = 'credential.revoked'",
      )
    ).rows,
  ).toEqual([
    { actor_id: first.publisher.id, subject_id: first.credential.id },
  ]);
  await refusal(
    await fixture.request('GET', '/publisher', undefined, first.bearer),
    401,
    'AUTHENTICATION_REQUIRED',
  );
  const built = await template();
  await refusal(
    await fixture.publish(first.token, built.bytes),
    401,
    'AUTHENTICATION_REQUIRED',
  );
  expect(fixture.blobs.put).not.toHaveBeenCalled();
  expect(
    (await fixture.request('GET', '/publisher', undefined, second.bearer))
      .status,
  ).toBe(200);
});

it('requires both the requested token scope and live operator status, and keeps cookie and bearer commands separate', async () => {
  const publisher = await fixture.account('publisher@example.test');
  const operator = await fixture.account('operator@example.test', true);
  const created = await fixture.published(publisher.token);
  await refusal(
    await fixture.request(
      'POST',
      '/account/tokens',
      { name: 'Escalation', scopes: ['moderate'] },
      publisher.headers,
    ),
    403,
    'FORBIDDEN',
  );
  const mint = async (scope: 'publish' | 'moderate') => {
    const response = await fixture.request(
      'POST',
      '/account/tokens',
      { name: scope, scopes: [scope] },
      operator.headers,
    );
    expect(response.status).toBe(201);
    return issuedToken.parse(await response.json());
  };
  const publishing = await mint('publish');
  const moderating = await mint('moderate');
  const publishingHeaders = new Headers({
    authorization: `Bearer ${publishing.token}`,
  });
  const moderatingHeaders = new Headers({
    authorization: `Bearer ${moderating.token}`,
  });
  await refusal(
    await fixture.request(
      'POST',
      `/moderation/entries/${created.entry.id}/takedown`,
      undefined,
      publishingHeaders,
    ),
    403,
    'FORBIDDEN',
  );
  await refusal(
    await fixture.publish(moderating.token, created.bytes),
    403,
    'FORBIDDEN',
  );
  expect(fixture.blobs.put).toHaveBeenCalledTimes(1);
  const bearerOnly = new Headers(publishingHeaders);
  bearerOnly.set('origin', ORIGIN);
  await refusal(
    await fixture.request(
      'POST',
      '/account/tokens',
      { name: 'Bearer cannot issue', scopes: ['publish'] },
      bearerOnly,
    ),
    401,
    'AUTHENTICATION_REQUIRED',
  );
  await refusal(
    await fixture.request(
      'POST',
      `/entries/${created.entry.id}/yank`,
      undefined,
      publisher.headers,
    ),
    401,
    'AUTHENTICATION_REQUIRED',
  );
  expect(
    (
      await fixture.request(
        'POST',
        `/moderation/entries/${created.entry.id}/takedown`,
        undefined,
        moderatingHeaders,
      )
    ).status,
  ).toBe(200);
  await refusal(
    await fixture.request('GET', `/entries/${created.entry.id}`),
    410,
    'CONTENT_REMOVED',
  );
  expect(
    (
      await fixture.publish(
        publishing.token,
        (await template('Own entry')).bytes,
      )
    ).status,
  ).toBe(201);
  await fixture.owner.query(
    'UPDATE registry_operators SET enabled = false WHERE user_id = $1',
    [operator.session.userId],
  );
  await refusal(
    await fixture.request(
      'POST',
      `/moderation/entries/${created.entry.id}/restore`,
      undefined,
      moderatingHeaders,
    ),
    403,
    'FORBIDDEN',
  );
  expect(
    (
      await fixture.owner.query(
        "SELECT action, subject_id FROM registry_audit WHERE action LIKE 'artifact.%'",
      )
    ).rows,
  ).toEqual([
    { action: 'artifact.taken_down', subject_id: created.entry.root },
  ]);
});

it('rechecks revocation after upload admission before publishing or appending audit', async () => {
  const account = await fixture.account();
  const replica = fixture.createReplica();
  const built = await template();
  const form = new FormData();
  form.set(
    'artifact',
    new File([Uint8Array.from(built.bytes)], 'template.nctemplate'),
  );
  const encoded = new Request(`${ORIGIN}/api/v1/entries`, {
    method: 'POST',
    body: form,
  });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const contentType = encoded.headers.get('content-type');
  if (!contentType) throw new Error('Multipart encoding must have a boundary');
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const request = new Request(`${ORIGIN}/api/v1/entries`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${account.token}`,
      'content-type': contentType,
    },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  const publishing = fixture.app.request(request);
  try {
    // Prove the original credential passed intake, without releasing its body.
    await vi.waitFor(async () => {
      expect(
        (
          await fixture.owner.query(
            "SELECT count FROM registry_rate_counters WHERE scope = 'publish:global'",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    });
    expect(
      (
        await fixture.request(
          'DELETE',
          `/account/tokens/${account.credential.id}`,
          undefined,
          account.headers,
          replica.app,
        )
      ).status,
    ).toBe(200);
    if (!controller) throw new Error('Upload stream must be connected');
    controller.enqueue(bytes);
    controller.close();
    controller = undefined;
    await refusal(await publishing, 401, 'AUTHENTICATION_REQUIRED');
  } finally {
    controller?.close();
    await publishing;
  }
  expect(fixture.blobs.put).not.toHaveBeenCalled();
  expect(
    (await fixture.owner.query('SELECT id FROM registry_entries')).rows,
  ).toEqual([]);
  expect(
    (
      await fixture.owner.query(
        "SELECT action FROM registry_audit WHERE action IN ('entry.published', 'credential.revoked')",
      )
    ).rows,
  ).toEqual([{ action: 'credential.revoked' }]);
});
