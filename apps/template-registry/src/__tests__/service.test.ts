import { createHash, randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  readTemplateArtifact,
  templateBytesHash,
} from '@codaco/studio-sync/template-exchange';

import {
  EntrySchema,
  EntrySummarySchema,
  TokenDescriptionSchema,
} from '../contract.ts';
import { RegistryProblemSchema } from '../problems.ts';
import {
  createRegistryFixture,
  ORIGIN,
  template,
  type RegistryFixture,
} from './fixtures.ts';

const list = z.strictObject({
  data: z.array(EntrySummarySchema),
  next_cursor: z.string().nullable(),
});
async function problem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toContain(
    'application/problem+json',
  );
  const body = RegistryProblemSchema.parse(await response.json());
  expect(body).toMatchObject({
    status,
    code,
    request_id: response.headers.get('X-Request-ID'),
  });
  return body;
}

describe('independent registry HTTP behavior with PostgreSQL permissions', () => {
  let fixture: RegistryFixture;
  beforeEach(async () => {
    fixture = await createRegistryFixture();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fixture?.dispose();
  });

  it('publishes frozen metadata and verified bytes with a registry credential, then reads them anonymously', async () => {
    expect(
      list.parse(await (await fixture.request('GET', '/entries')).json()),
    ).toEqual({ data: [], next_cursor: null });
    const account = await fixture.account();
    const created = await fixture.published(account.token);
    expect(created.entry).toMatchObject({
      root: created.artifact.manifest.merkle_root,
      metadata: created.artifact.metadata,
      license: 'CC0-1.0',
      publisher: account.publisher,
      curated: false,
      yanked: false,
    });
    expect(created.entry).not.toHaveProperty('email');
    expect(created.entry.report_url).toBe(
      `${ORIGIN}/api/v1/entries/${created.entry.id}/reports`,
    );
    const fetched = await fixture.request(
      'GET',
      `/entries/${created.entry.id}`,
    );
    expect(fetched.status).toBe(200);
    expect(EntrySchema.parse(await fetched.json())).toEqual(created.entry);
    const artifact = await fixture.request(
      'GET',
      `/artifacts/${created.entry.root}`,
    );
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get('cache-control')).toBe('no-store');
    expect(artifact.headers.get('content-disposition')).toContain(
      `${created.entry.root}.nctemplate`,
    );
    const bytes = new Uint8Array(await artifact.arrayBuffer());
    expect(templateBytesHash(bytes)).toBe(templateBytesHash(created.bytes));
    expect((await readTemplateArtifact(bytes)).manifest.merkle_root).toBe(
      created.entry.root,
    );
    const repeated = await fixture.publish(account.token, created.bytes);
    expect(repeated.status).toBe(201);
    expect(EntrySchema.parse(await repeated.json()).id).toBe(created.entry.id);
    expect(fixture.blobs.put).toHaveBeenCalledTimes(1);
    expect(
      (
        await fixture.owner.query(
          "SELECT action, subject_id FROM registry_audit WHERE action = 'entry.published'",
        )
      ).rows,
    ).toEqual([{ action: 'entry.published', subject_id: created.entry.id }]);
    expect(
      (await fixture.pool.query('SELECT current_user AS role')).rows,
    ).toEqual([{ role: fixture.roles.app }]);
    expect(
      (await fixture.operatorPool.query('SELECT current_user AS role')).rows,
    ).toEqual([{ role: fixture.roles.operator }]);
  });

  it('keeps person-owned locators separate from content identity across registry accounts', async () => {
    const first = await fixture.account('first@example.test');
    const second = await fixture.account('second@example.test');
    const created = await fixture.published(first.token);
    const other = await fixture.publish(second.token, created.bytes);
    expect(other.status).toBe(201);
    const entry = EntrySchema.parse(await other.json());
    expect(entry.root).toBe(created.entry.root);
    expect(entry.id).not.toBe(created.entry.id);
    expect(entry.publisher.id).toBe(second.publisher.id);
    expect(fixture.blobs.put).toHaveBeenCalledTimes(1);
    await problem(
      await fixture.request(
        'POST',
        `/entries/${created.entry.id}/yank`,
        undefined,
        second.bearer,
      ),
      403,
      'FORBIDDEN',
    );
    expect(
      (
        await fixture.owner.query(
          "SELECT count(*)::int AS count FROM registry_audit WHERE action = 'entry.yanked'",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await fixture.request(
          'POST',
          `/entries/${entry.id}/yank`,
          undefined,
          second.bearer,
        )
      ).status,
    ).toBe(200);
    const active = EntrySchema.parse(
      await (
        await fixture.request('GET', `/entries/${created.entry.id}`)
      ).json(),
    );
    expect(active.yanked).toBe(false);
    const stillPublished = await fixture.request(
      'GET',
      `/artifacts/${created.entry.root}`,
    );
    expect(stillPublished.headers.get('X-Registry-Yanked')).toBe('false');
    expect(new Uint8Array(await stillPublished.arrayBuffer())).toEqual(
      created.bytes,
    );
    expect(
      (
        await fixture.request(
          'POST',
          `/entries/${created.entry.id}/yank`,
          undefined,
          first.bearer,
        )
      ).status,
    ).toBe(200);
    const allYanked = await fixture.request(
      'GET',
      `/artifacts/${created.entry.root}`,
    );
    expect(allYanked.headers.get('X-Registry-Yanked')).toBe('true');
    expect(new Uint8Array(await allYanked.arrayBuffer())).toEqual(
      created.bytes,
    );
  });

  it('rejects instance credentials, unverified sessions, and cross-origin account commands', async () => {
    const built = await template();
    await problem(
      await fixture.publish('studio_instance_api_token', built.bytes),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    expect(fixture.blobs.put).not.toHaveBeenCalled();
    await problem(
      await fixture.request('POST', '/account/publisher', {
        name: 'Anonymous',
      }),
      403,
      'FORBIDDEN',
    );
    const account = await fixture.account();
    const foreign = new Headers(account.headers);
    foreign.set('origin', 'https://attacker.test');
    await problem(
      await fixture.request(
        'POST',
        '/account/tokens',
        { name: 'Unexpected', scopes: ['publish'] },
        foreign,
      ),
      403,
      'FORBIDDEN',
    );
    await fixture.owner.query(
      'UPDATE registry_auth_user SET email_verified = false WHERE id = $1',
      [account.session.userId],
    );
    await problem(
      await fixture.request(
        'POST',
        '/account/tokens',
        { name: 'Unverified', scopes: ['publish'] },
        account.headers,
      ),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    await problem(
      await fixture.publish(account.token, built.bytes),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    expect(
      (await fixture.owner.query('SELECT token_hash FROM registry_credentials'))
        .rows,
    ).toEqual([
      { token_hash: createHash('sha256').update(account.token).digest('hex') },
    ]);
  });

  it('grants curation only to live registry operators and distinguishes the badge from publication', async () => {
    const account = await fixture.account();
    const operator = await fixture.account('operator@example.test', true);
    const created = await fixture.published(account.token);
    await problem(
      await fixture.request(
        'PUT',
        `/moderation/entries/${created.entry.id}/curation`,
        { curated: true },
        account.bearer,
      ),
      403,
      'FORBIDDEN',
    );
    const granted = await fixture.request(
      'PUT',
      `/moderation/entries/${created.entry.id}/curation`,
      { curated: true },
      operator.bearer,
    );
    expect(granted.status).toBe(200);
    expect(
      EntrySchema.parse(
        await (
          await fixture.request('GET', `/entries/${created.entry.id}`)
        ).json(),
      ).curated,
    ).toBe(true);
    const minimal = await fixture.published(account.token, 'Minimal metadata', {
      metadata: { schema_version: 1 },
    });
    await problem(
      await fixture.request(
        'PUT',
        `/moderation/entries/${minimal.entry.id}/curation`,
        { curated: true },
        operator.bearer,
      ),
      422,
      'CURATION_METADATA_REQUIRED',
    );
    await fixture.owner.query(
      'UPDATE registry_operators SET enabled = false WHERE user_id = $1',
      [operator.session.userId],
    );
    await problem(
      await fixture.request(
        'PUT',
        `/moderation/entries/${created.entry.id}/curation`,
        { curated: false },
        operator.bearer,
      ),
      403,
      'FORBIDDEN',
    );
    expect(
      (
        await fixture.owner.query(
          "SELECT action, subject_id FROM registry_audit WHERE action = 'entry.curated'",
        )
      ).rows,
    ).toEqual([{ action: 'entry.curated', subject_id: created.entry.id }]);
  });

  it('accepts reports without authentication and limits their private details to operators', async () => {
    const account = await fixture.account();
    const operator = await fixture.account('operator@example.test', true);
    const created = await fixture.published(account.token);
    const response = await fixture.request(
      'POST',
      `/entries/${created.entry.id}/reports`,
      { category: 'privacy', details: 'Private operational report text' },
    );
    expect(response.status).toBe(202);
    const reported = z
      .strictObject({ id: z.uuid() })
      .parse(await response.json());
    await problem(
      await fixture.request('GET', '/moderation/reports'),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    await problem(
      await fixture.request(
        'GET',
        '/moderation/reports',
        undefined,
        account.bearer,
      ),
      403,
      'FORBIDDEN',
    );
    const reports = await fixture.request(
      'GET',
      '/moderation/reports',
      undefined,
      operator.bearer,
    );
    expect(reports.status).toBe(200);
    expect(await reports.json()).toMatchObject({
      data: [
        {
          id: reported.id,
          entry_id: created.entry.id,
          category: 'privacy',
          details: 'Private operational report text',
        },
      ],
      next_cursor: null,
    });
    expect(
      JSON.stringify(
        (await fixture.owner.query('SELECT * FROM registry_audit')).rows,
      ),
    ).not.toContain('Private operational report text');
  });

  it('refuses app-role moderation fields on insert and protects immutable audit from every runtime role', async () => {
    const account = await fixture.account();
    const created = await fixture.published(account.token);
    await expect(
      fixture.pool.query(
        'INSERT INTO registry_entries(id, publisher_id, artifact_root, curated_at) VALUES ($1, $2, $3, now())',
        [randomUUID(), account.publisher.id, created.entry.root],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      fixture.pool.query(
        'INSERT INTO registry_artifacts(root, raw_hash, byte_size, blocked_at, deleted_at) VALUES ($1, $2, 1, now(), now())',
        ['a'.repeat(64), 'b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      fixture.pool.query(
        'UPDATE registry_entries SET curated_at = now() WHERE id = $1',
        [created.entry.id],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      fixture.pool.query(
        'INSERT INTO registry_operators(user_id, enabled) VALUES ($1, true)',
        [account.session.userId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      fixture.operatorPool.query(
        'INSERT INTO registry_operators(user_id, enabled) VALUES ($1, true)',
        [account.session.userId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const pool of [fixture.pool, fixture.operatorPool, fixture.owner]) {
      for (const sql of [
        'UPDATE registry_audit SET action = action',
        'DELETE FROM registry_audit',
        'TRUNCATE registry_audit CASCADE',
      ])
        await expect(pool.query(sql)).rejects.toMatchObject({ code: '42501' });
    }
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_audit',
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
    expect(
      EntrySchema.parse(
        await (
          await fixture.request('GET', `/entries/${created.entry.id}`)
        ).json(),
      ).curated,
    ).toBe(false);
  });

  it('continues to list a live credential when newer revoked history exceeds the former list limit', async () => {
    const account = await fixture.account();
    for (let index = 0; index < 101; index++)
      await fixture.owner.query(
        "INSERT INTO registry_credentials(id, publisher_id, token_hash, name, scopes, expires_at, revoked_at) VALUES ($1, $2, $3, 'Revoked', ARRAY['publish'], now() + interval '1 day', now())",
        [
          randomUUID(),
          account.publisher.id,
          createHash('sha256').update(String(index)).digest('hex'),
        ],
      );
    const response = await fixture.request(
      'GET',
      '/account/tokens',
      undefined,
      account.headers,
    );
    expect(response.status).toBe(200);
    expect(
      z
        .strictObject({ data: z.array(TokenDescriptionSchema) })
        .parse(await response.json()),
    ).toEqual({ data: [account.credential] });
  });

  it('uses filter-bound keyset cursors and keeps yanked locators reproducible by root', async () => {
    const account = await fixture.account();
    const first = await fixture.published(account.token, 'Network alpha');
    const second = await fixture.published(account.token, 'Network beta');
    const third = await fixture.published(account.token, 'Network gamma');
    const query =
      '/entries?limit=1&query=network&kind=protocol&license=CC0-1.0&keyword=NETWORKS&author=research';
    const page = list.parse(await (await fixture.request('GET', query)).json());
    expect(page.data.map((entry) => entry.id)).toEqual([third.entry.id]);
    expect(page.next_cursor).toBeTruthy();
    const next = list.parse(
      await (
        await fixture.request('GET', `${query}&cursor=${page.next_cursor}`)
      ).json(),
    );
    expect(next.data.map((entry) => entry.id)).toEqual([second.entry.id]);
    await problem(
      await fixture.request('GET', `/entries?cursor=${page.next_cursor}`),
      400,
      'INVALID_REQUEST',
    );
    await problem(
      await fixture.request('GET', '/entries?cursor=invalid'),
      400,
      'INVALID_REQUEST',
    );
    const yanked = await fixture.request(
      'POST',
      `/entries/${third.entry.id}/yank`,
      undefined,
      account.bearer,
    );
    expect(yanked.status).toBe(200);
    expect(EntrySchema.parse(await yanked.json()).yanked).toBe(true);
    expect(
      list
        .parse(await (await fixture.request('GET', '/entries')).json())
        .data.map((entry) => entry.id),
    ).toEqual([second.entry.id, first.entry.id]);
    expect(
      EntrySchema.parse(
        await (
          await fixture.request('GET', `/entries/${third.entry.id}`)
        ).json(),
      ).yanked,
    ).toBe(true);
    const artifact = await fixture.request(
      'GET',
      `/artifacts/${third.entry.root}`,
    );
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get('x-registry-yanked')).toBe('true');
    expect(new Uint8Array(await artifact.arrayBuffer())).toEqual(third.bytes);
    expect(
      (
        await fixture.request(
          'POST',
          `/entries/${third.entry.id}/yank`,
          {},
          account.bearer,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.owner.query(
          "SELECT count(*)::int AS count FROM registry_audit WHERE action = 'entry.yanked'",
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });

  it('applies takedown and operator erasure across every locator without allowing publisher deletion', async () => {
    const account = await fixture.account();
    const operator = await fixture.account('operator@example.test', true);
    const created = await fixture.published(account.token);
    const copy = await fixture.publish(operator.token, created.bytes);
    const second = EntrySchema.parse(await copy.json());
    await problem(
      await fixture.request(
        'DELETE',
        `/moderation/artifacts/${created.entry.root}`,
        undefined,
        account.bearer,
      ),
      403,
      'FORBIDDEN',
    );
    expect(
      (
        await fixture.request(
          'POST',
          `/moderation/entries/${created.entry.id}/takedown`,
          undefined,
          operator.bearer,
        )
      ).status,
    ).toBe(200);
    for (const path of [
      `/entries/${created.entry.id}`,
      `/entries/${second.id}`,
      `/artifacts/${created.entry.root}`,
    ])
      await problem(await fixture.request('GET', path), 410, 'CONTENT_REMOVED');
    expect(
      list.parse(await (await fixture.request('GET', '/entries')).json()).data,
    ).toEqual([]);
    expect(
      (
        await fixture.request(
          'POST',
          `/moderation/entries/${created.entry.id}/restore`,
          undefined,
          operator.bearer,
        )
      ).status,
    ).toBe(200);
    expect((await fixture.request('GET', `/entries/${second.id}`)).status).toBe(
      200,
    );
    expect(
      (
        await fixture.request('POST', `/entries/${created.entry.id}/reports`, {
          category: 'privacy',
          details: 'Erase this private report too',
        })
      ).status,
    ).toBe(202);
    expect(
      (
        await fixture.request(
          'DELETE',
          `/moderation/artifacts/${created.entry.root}`,
          undefined,
          operator.bearer,
        )
      ).status,
    ).toBe(202);
    expect(
      (await fixture.owner.query('SELECT * FROM registry_artifact_content'))
        .rows,
    ).toEqual([]);
    expect(
      (await fixture.owner.query('SELECT details FROM registry_reports')).rows,
    ).toEqual([{ details: null }]);
    await problem(
      await fixture.request(
        'POST',
        `/moderation/entries/${second.id}/restore`,
        undefined,
        operator.bearer,
      ),
      410,
      'CONTENT_REMOVED',
    );
    await problem(
      await fixture.publish(account.token, created.bytes),
      410,
      'CONTENT_REMOVED',
    );
    expect(fixture.objects.size).toBe(1);
    vi.mocked(fixture.blobs.delete).mockRejectedValueOnce(
      new Error('Storage unavailable; private diagnostic'),
    );
    expect(await fixture.store.cleanupDeletedArtifacts()).toBe(0);
    expect(
      (
        await fixture.owner.query(
          'SELECT attempts, completed_at FROM registry_delete_jobs',
        )
      ).rows,
    ).toEqual([{ attempts: 1, completed_at: null }]);
    expect(fixture.objects.size).toBe(1);
    await fixture.owner.query(
      'UPDATE registry_delete_jobs SET next_attempt_at = now()',
    );
    expect(await fixture.createReplica().store.cleanupDeletedArtifacts()).toBe(
      1,
    );
    expect(fixture.objects.size).toBe(0);
    expect(await fixture.store.cleanupDeletedArtifacts()).toBe(0);
    expect(
      (
        await fixture.owner.query(
          "SELECT action FROM registry_audit WHERE action LIKE 'artifact.%' ORDER BY occurred_at",
        )
      ).rows.map((row: { action: string }) => row.action),
    ).toEqual([
      'artifact.taken_down',
      'artifact.restored',
      'artifact.hard_delete_requested',
      'artifact.hard_delete_completed',
    ]);
    await problem(
      await fixture.request('GET', `/artifacts/${created.entry.root}`),
      410,
      'CONTENT_REMOVED',
    );
  });

  it('checks live moderation again after a private object fetch has begun', async () => {
    const account = await fixture.account();
    const operator = await fixture.account('operator@example.test', true);
    const created = await fixture.published(account.token);
    let release: (bytes: Uint8Array) => void = () => {
      throw new Error('Fetch has not started');
    };
    vi.mocked(fixture.blobs.get).mockImplementationOnce(
      () =>
        new Promise<Uint8Array>((resolve) => {
          release = resolve;
        }),
    );
    const download = fixture.request('GET', `/artifacts/${created.entry.root}`);
    await vi.waitFor(() => expect(fixture.blobs.get).toHaveBeenCalledTimes(1));
    expect(
      (
        await fixture.request(
          'POST',
          `/moderation/entries/${created.entry.id}/takedown`,
          undefined,
          operator.bearer,
        )
      ).status,
    ).toBe(200);
    release(created.bytes);
    await problem(await download, 410, 'CONTENT_REMOVED');
  });

  it.each(['publisher', 'total'] as const)(
    'retains the %s storage charge until authorized object deletion completes',
    async (scope) => {
      const first = await template('Quota artifact A');
      const next = await template('Quota artifact B');
      const budget = Math.max(first.bytes.byteLength, next.bytes.byteLength);
      expect(first.bytes.byteLength + next.bytes.byteLength).toBeGreaterThan(
        budget,
      );
      const replica = fixture.createReplica({
        publisherBytes: scope === 'publisher' ? budget : budget * 4,
        totalBytes: scope === 'total' ? budget : budget * 4,
      });
      const account = await fixture.account();
      const operator = await fixture.account('operator@example.test', true);
      const published = await fixture.publish(
        account.token,
        first.bytes,
        replica.app,
      );
      expect(published.status).toBe(201);
      const entry = EntrySchema.parse(await published.json());
      expect(
        (
          await fixture.request(
            'DELETE',
            `/moderation/artifacts/${entry.root}`,
            undefined,
            operator.bearer,
            replica.app,
          )
        ).status,
      ).toBe(202);
      vi.mocked(fixture.blobs.delete).mockRejectedValueOnce(
        new Error('Storage temporarily unavailable'),
      );
      expect(await replica.store.cleanupDeletedArtifacts()).toBe(0);
      expect(fixture.objects.size).toBe(1);
      await problem(
        await fixture.publish(account.token, next.bytes, replica.app),
        409,
        'STORAGE_LIMIT_REACHED',
      );
      expect(fixture.objects.size).toBe(1);
      await fixture.owner.query(
        'UPDATE registry_delete_jobs SET next_attempt_at = now()',
      );
      expect(await replica.store.cleanupDeletedArtifacts()).toBe(1);
      expect(fixture.objects.size).toBe(0);
      expect(
        (await fixture.publish(account.token, next.bytes, replica.app)).status,
      ).toBe(201);
      expect(fixture.objects.size).toBe(1);
    },
  );

  it('holds artifact capacity until returned bodies drain or cancel', async () => {
    const account = await fixture.account();
    const created = await fixture.published(account.token);
    const path = `/artifacts/${created.entry.root}`;
    const first = await fixture.request('GET', path);
    const second = await fixture.request('GET', path);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const blocked = await fixture.request('GET', path);
    await problem(blocked, 503, 'SERVICE_UNAVAILABLE');
    expect(blocked.headers.get('Retry-After')).toBe('1');
    expect(fixture.blobs.get).toHaveBeenCalledTimes(2);
    await first.body?.cancel();
    const third = await fixture.request('GET', path);
    expect(third.status).toBe(200);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(created.bytes);
    const fourth = await fixture.request('GET', path);
    expect(fourth.status).toBe(200);
    await third.body?.cancel();
    await fourth.body?.cancel();
    expect(fixture.blobs.get).toHaveBeenCalledTimes(4);
  });

  it.each(['publish', 'download'] as const)(
    'reserves the complete artifact memory budget during a pending publication before a concurrent %s',
    async (operation) => {
      const account = await fixture.account();
      const created = await fixture.published(account.token);
      const form = new FormData();
      form.set('artifact', new File([created.bytes], 'pending.nctemplate'));
      const encoded = new Request(`${ORIGIN}/api/v1/entries`, {
        method: 'POST',
        body: form,
      });
      const bytes = new Uint8Array(await encoded.arrayBuffer());
      const reading = Promise.withResolvers<void>();
      let source!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            source = controller;
          },
          pull() {
            reading.resolve();
            return new Promise<void>(() => undefined);
          },
        },
        // No speculative pull before the app admits and starts reading intake.
        { highWaterMark: 0 },
      );
      const headers = new Headers(account.bearer);
      headers.set('content-type', encoded.headers.get('content-type')!);
      const request = new Request(`${ORIGIN}/api/v1/entries`, {
        method: 'POST',
        headers,
        body,
        duplex: 'half',
      } as RequestInit);
      const pending = fixture.app.fetch(request);
      try {
        await reading.promise;
        const blocked =
          operation === 'publish'
            ? await fixture.publish(account.token, created.bytes)
            : await fixture.request('GET', `/artifacts/${created.entry.root}`);
        await problem(blocked, 503, 'SERVICE_UNAVAILABLE');
        expect(blocked.headers.get('Retry-After')).toBe('1');
      } finally {
        source.enqueue(bytes);
        source.close();
        expect((await pending).status).toBe(201);
      }
      const recovered = await fixture.publish(account.token, created.bytes);
      expect(recovered.status).toBe(201);
    },
  );

  it('refuses publication while an artifact download retains memory and admits it after cancellation', async () => {
    const account = await fixture.account();
    const created = await fixture.published(account.token);
    const held = await fixture.request(
      'GET',
      `/artifacts/${created.entry.root}`,
    );
    expect(held.status).toBe(200);
    try {
      await problem(
        await fixture.publish(account.token, created.bytes),
        503,
        'SERVICE_UNAVAILABLE',
      );
    } finally {
      await held.body?.cancel();
    }
    expect((await fixture.publish(account.token, created.bytes)).status).toBe(
      201,
    );
  });

  it('persists account-write limits across replicas and counts create/revoke/name changes together', async () => {
    const account = await fixture.account();
    const first = fixture.createReplica({ accountWritesPerHour: 4 });
    const second = fixture.createReplica({ accountWritesPerHour: 4 });
    const created = await fixture.request(
      'POST',
      '/account/tokens',
      { name: 'Temporary', scopes: ['publish'] },
      account.headers,
      first.app,
    );
    expect(created.status).toBe(201);
    const token = z
      .strictObject({ token: z.string(), credential: TokenDescriptionSchema })
      .parse(await created.json());
    expect(
      (
        await fixture.request(
          'DELETE',
          `/account/tokens/${token.credential.id}`,
          undefined,
          account.headers,
          second.app,
        )
      ).status,
    ).toBe(200);
    const blocked = await fixture.request(
      'POST',
      '/account/publisher',
      { name: 'Another name' },
      account.headers,
      first.app,
    );
    await problem(blocked, 429, 'RATE_LIMITED');
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    expect(
      (await fixture.owner.query('SELECT name FROM registry_publishers')).rows,
    ).toEqual([{ name: account.publisher.name }]);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_audit',
        )
      ).rows,
    ).toEqual([{ count: 4 }]);
    await problem(
      await fixture.request(
        'POST',
        '/account/tokens',
        { name: 'Still limited', scopes: ['publish'] },
        account.headers,
        second.app,
      ),
      429,
      'RATE_LIMITED',
    );
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });

  it('enforces publication quota atomically across two service replicas', async () => {
    const account = await fixture.account();
    const a = await template('Concurrent A');
    const b = await template('Concurrent B');
    const totalBytes = Math.max(a.bytes.length, b.bytes.length);
    const first = fixture.createReplica({ totalBytes });
    const second = fixture.createReplica({ totalBytes });
    const results = await Promise.all([
      fixture.publish(account.token, a.bytes, first.app),
      fixture.publish(account.token, b.bytes, second.app),
    ]);
    expect(
      results
        .map((response) => response.status)
        .toSorted((left, right) => left - right),
    ).toEqual([201, 409]);
    const failed = results.find((response) => response.status === 409);
    if (!failed) throw new Error('Expected a quota refusal');
    await problem(failed, 409, 'STORAGE_LIMIT_REACHED');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_entries',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(fixture.blobs.put).toHaveBeenCalledTimes(1);
    expect(fixture.objects.size).toBe(1);
  });

  it('rate-limits artifact intake before buffering another body and preserves the limit across replicas', async () => {
    const account = await fixture.account();
    const first = fixture.createReplica({ publishPerHour: 2 });
    const second = fixture.createReplica({ publishPerHour: 2 });
    const built = await template();
    expect(
      (await fixture.publish(account.token, built.bytes, first.app)).status,
    ).toBe(201);
    await problem(
      await fixture.publish(
        account.token,
        new Uint8Array([0, 1, 2]),
        second.app,
      ),
      422,
      'ARTIFACT_INVALID',
    );
    const response = await fixture.publish(
      account.token,
      built.bytes,
      first.app,
    );
    await problem(response, 429, 'RATE_LIMITED');
    expect(response.headers.get('Retry-After')).toBe('3600');
    expect(fixture.blobs.put).toHaveBeenCalledTimes(1);
  });

  it('suspends a publisher immediately without turning curation into a publication gate', async () => {
    const account = await fixture.account();
    const operator = await fixture.account('operator@example.test', true);
    const created = await fixture.published(account.token);
    const path = `/moderation/publishers/${account.publisher.id}/suspension`;
    expect(
      (await fixture.request('PUT', path, { suspended: true }, operator.bearer))
        .status,
    ).toBe(200);
    await problem(
      await fixture.request('GET', '/publisher', undefined, account.bearer),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    await problem(
      await fixture.publish(account.token, created.bytes),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    await problem(
      await fixture.request(
        'POST',
        '/account/tokens',
        { name: 'New', scopes: ['publish'] },
        account.headers,
      ),
      403,
      'FORBIDDEN',
    );
    expect(
      (await fixture.request('GET', `/entries/${created.entry.id}`)).status,
    ).toBe(200);
    expect(
      (
        await fixture.request(
          'PUT',
          path,
          { suspended: false },
          operator.bearer,
        )
      ).status,
    ).toBe(200);
    expect(
      (await fixture.request('GET', '/publisher', undefined, account.bearer))
        .status,
    ).toBe(200);
  });

  it('caps auth bodies before calling the mail provider even when Content-Length is omitted', async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1024 + 1));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'origin': ORIGIN, 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    await problem(await fixture.app.fetch(request), 413, 'CONTENT_TOO_LARGE');
    expect(canceled).toBe(true);
    expect(fixture.sent).toEqual([]);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_auth_verification',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('rolls publication back if immutable audit cannot append and later removes only its orphan object', async () => {
    const account = await fixture.account();
    const committed = await fixture.published(
      account.token,
      'Committed object',
    );
    const failed = await template('Failed publication');
    await fixture.owner
      .query(`CREATE FUNCTION registry_test_refuse_publish_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Private audit failure text'; END; $$;
      CREATE TRIGGER registry_test_refuse_publish_audit BEFORE INSERT ON registry_audit FOR EACH ROW
      WHEN (NEW.action = 'entry.published') EXECUTE FUNCTION registry_test_refuse_publish_audit();`);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const response = await fixture.publish(account.token, failed.bytes);
    const failure = await problem(response, 500, 'INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(failure)).not.toContain('Private audit failure text');
    expect(consoleError).not.toHaveBeenCalled();
    expect(fixture.diagnostics).toEqual(['REGISTRY_REQUEST_FAILED']);
    expect(
      (await fixture.owner.query('SELECT id FROM registry_entries')).rows,
    ).toEqual([{ id: committed.entry.id }]);
    expect(
      (
        await fixture.owner.query(
          "SELECT subject_id FROM registry_audit WHERE action = 'entry.published'",
        )
      ).rows,
    ).toEqual([{ subject_id: committed.entry.id }]);
    expect(fixture.objects.size).toBe(2);
    for (const rawHash of fixture.objects.keys())
      fixture.objectTimes.set(
        rawHash,
        new Date(Date.now() - 2 * 60 * 60 * 1000),
      );
    expect(
      await fixture.createReplica().store.cleanupOrphanArtifacts(),
    ).toEqual({ removed: 1, retry: false, nextCursor: undefined });
    expect(Array.from(fixture.objects.keys())).toEqual([
      templateBytesHash(committed.bytes),
    ]);
    expect(await fixture.store.cleanupOrphanArtifacts()).toEqual({
      removed: 0,
      retry: false,
      nextCursor: undefined,
    });
  });

  it('does not collect a new orphan or advance its page after a failed delete', async () => {
    const stale = templateBytesHash(new Uint8Array([1]));
    const recent = templateBytesHash(new Uint8Array([2]));
    fixture.objects.set(stale, new Uint8Array([1]));
    fixture.objects.set(recent, new Uint8Array([2]));
    fixture.objectTimes.set(stale, new Date(Date.now() - 2 * 60 * 60 * 1000));
    fixture.objectTimes.set(recent, new Date());
    vi.mocked(fixture.blobs.delete).mockRejectedValueOnce(
      new Error('Transient private storage error'),
    );
    expect(await fixture.store.cleanupOrphanArtifacts('resume-page')).toEqual({
      removed: 0,
      retry: true,
      nextCursor: 'resume-page',
    });
    expect(fixture.blobs.delete).toHaveBeenCalledExactlyOnceWith(stale);
    expect(await fixture.store.cleanupOrphanArtifacts('resume-page')).toEqual({
      removed: 1,
      retry: false,
      nextCursor: undefined,
    });
    expect(Array.from(fixture.objects.keys())).toEqual([recent]);
  });

  it('serializes orphan removal with in-flight publication before checking durable references', async () => {
    const account = await fixture.account();
    const created = await template();
    const rawHash = templateBytesHash(created.bytes);
    let release: () => void = () => {
      throw new Error('Upload has not started');
    };
    vi.mocked(fixture.blobs.put).mockImplementationOnce(async (hash, bytes) => {
      fixture.objects.set(hash, Uint8Array.from(bytes));
      fixture.objectTimes.set(hash, new Date(Date.now() - 2 * 60 * 60 * 1000));
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const publishing = fixture.publish(account.token, created.bytes);
    await vi.waitFor(() => expect(fixture.blobs.put).toHaveBeenCalledTimes(1));
    expect(
      (await fixture.owner.query('SELECT raw_hash FROM registry_artifacts'))
        .rows,
    ).toEqual([]);
    const cleanup = fixture.createReplica().store.cleanupOrphanArtifacts();
    await vi.waitFor(() => expect(fixture.blobs.scan).toHaveBeenCalledTimes(1));
    release();
    expect((await publishing).status).toBe(201);
    expect(await cleanup).toEqual({
      removed: 0,
      retry: false,
      nextCursor: undefined,
    });
    expect(fixture.blobs.delete).not.toHaveBeenCalled();
    expect(fixture.objects.get(rawHash)).toEqual(created.bytes);
  });
});
