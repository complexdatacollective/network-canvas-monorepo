import { zipSync, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

import {
  createTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
  type TemplateArtifactInput,
} from '../template-exchange.ts';
import {
  TemplateRegistryClient,
  TemplateRegistryClientError,
} from '../template-registry-client.ts';

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const PUBLISHER_ID = '22222222-2222-4222-8222-222222222222';
const ORIGIN = 'https://registry.example';
const CREDENTIAL = `ncr1_${'a'.repeat(43)}`;
const png = Uint8Array.from(
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55' +
      '0000000a4944415408d76360000000020001e221bc330000000049454e44ae426082',
    'hex',
  ),
);

function fixture(): TemplateArtifactInput {
  return {
    template: { name: 'Portable template', kind: 'protocol', version: 1 },
    metadata: { schema_version: 1, authors: [{ name: 'Example researcher' }] },
    license: 'CC-BY-4.0',
    sections: {
      'settings': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        name: 'Portable template',
      },
      'stageOrder': { stages: ['welcome'] },
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'image', type: 'asset', content: 'illustration' }],
      },
      'assets': {
        illustration: {
          type: 'image',
          name: 'Illustration',
          source: 'illustration.png',
        },
      },
    },
    assets: [
      {
        source: 'illustration.png',
        media_class: 'image',
        media_type: 'image/png',
        bytes: png,
      },
    ],
  };
}

function entry(root: string, overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    publisher: { id: PUBLISHER_ID, name: 'Publisher', orcid: null },
    root,
    template: { name: 'Portable template', kind: 'protocol', version: 1 },
    license: 'CC-BY-4.0',
    curated: false,
    yanked: false,
    published_at: '2026-09-08T00:00:00.000Z',
    metadata: { schema_version: 1, authors: [{ name: 'Example researcher' }] },
    artifact_url: `${ORIGIN}/api/v1/artifacts/${root}`,
    report_url: `${ORIGIN}/api/v1/entries/${ENTRY_ID}/reports`,
    ...overrides,
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function artifactResponse(
  bytes: Uint8Array,
  root: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
      'ETag': `"${templateBytesHash(bytes)}"`,
      'X-Template-Root': root,
      'X-Registry-Yanked': 'false',
      ...headers,
    },
  });
}

describe('TemplateRegistryClient', () => {
  it.each([
    'http://registry.example',
    'https://user:secret@registry.example',
    'https://registry.example/api',
    'https://registry.example/?tenant=other',
  ])(
    'refuses a non-origin HTTPS configuration without echoing it: %s',
    (origin) => {
      expect(() => new TemplateRegistryClient({ origin })).toThrow(
        new TemplateRegistryClientError(
          'TEMPLATE_REGISTRY_CONFIGURATION_INVALID',
        ),
      );
    },
  );

  it('uses only configured public destinations and never sends a bearer on reads', async () => {
    const built = await createTemplateArtifact(fixture());
    const seen: Request[] = [];
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        seen.push(request);
        if (request.url.includes('/artifacts/'))
          return artifactResponse(
            built.bytes,
            built.artifact.manifest.merkle_root,
          );
        return jsonResponse(entry(built.artifact.manifest.merkle_root));
      },
    });
    const metadata = await client.entry(ENTRY_ID);
    const fetched = await client.fetchArtifact(metadata.root);
    expect(fetched.artifact.manifest).toEqual(built.artifact.manifest);
    expect(seen.map(({ url }) => url)).toEqual([
      `${ORIGIN}/api/v1/entries/${ENTRY_ID}`,
      `${ORIGIN}/api/v1/artifacts/${built.artifact.manifest.merkle_root}`,
    ]);
    expect(seen.every((request) => !request.headers.has('authorization'))).toBe(
      true,
    );
    expect(seen.every((request) => request.redirect === 'manual')).toBe(true);
  });

  it('publishes a locally verified artifact with one explicit Registry credential', async () => {
    const built = await createTemplateArtifact(fixture());
    const seen: Request[] = [];
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return jsonResponse(entry(built.artifact.manifest.merkle_root), 201);
      },
    });
    await expect(
      client.publish(built.bytes, CREDENTIAL),
    ).resolves.toMatchObject({
      root: built.artifact.manifest.merkle_root,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${ORIGIN}/api/v1/entries`);
    expect(seen[0]?.headers.get('authorization')).toBe(`Bearer ${CREDENTIAL}`);
    expect(seen[0]?.redirect).toBe('manual');
  });

  it('verifies a credential against the configured Registry publisher endpoint', async () => {
    const seen: Request[] = [];
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return jsonResponse({
          id: PUBLISHER_ID,
          name: 'Publisher',
          orcid: null,
        });
      },
    });
    await expect(client.publisher(CREDENTIAL)).resolves.toEqual({
      id: PUBLISHER_ID,
      name: 'Publisher',
      orcid: null,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${ORIGIN}/publisher`);
    expect(seen[0]?.headers.get('authorization')).toBe(`Bearer ${CREDENTIAL}`);
    expect(seen[0]?.redirect).toBe('manual');
  });

  it('refuses an unvalidated publisher response and never includes the credential in the error', async () => {
    const secret = `ncr1_${'z'.repeat(43)}`;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () =>
        jsonResponse({ id: PUBLISHER_ID, name: '', orcid: null }),
    });
    let error: unknown;
    try {
      await client.publisher(secret);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
    expect(String(error)).not.toContain(secret);
  });

  it.each([
    { template: { name: 'Altered', kind: 'protocol', version: 1 } },
    { metadata: { schema_version: 1, authors: [{ name: 'Altered' }] } },
    { license: 'CC0-1.0' },
  ])(
    'refuses publish metadata that disagrees with the verified artifact: %j',
    async (overrides) => {
      const built = await createTemplateArtifact(fixture());
      const client = new TemplateRegistryClient({
        origin: ORIGIN,
        fetch: async () =>
          jsonResponse(
            entry(built.artifact.manifest.merkle_root, overrides),
            201,
          ),
      });
      await expect(
        client.publish(built.bytes, CREDENTIAL),
      ).rejects.toMatchObject({
        code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
      });
    },
  );

  it('does not follow a foreign redirect or forward the write credential', async () => {
    const built = await createTemplateArtifact(fixture());
    const seen: Request[] = [];
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(null, {
          status: 307,
          headers: { Location: 'https://foreign.example/collect' },
        });
      },
    });
    await expect(client.publish(built.bytes, CREDENTIAL)).rejects.toMatchObject(
      {
        code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${ORIGIN}/api/v1/entries`);
    expect(seen[0]?.redirect).toBe('manual');
  });

  it('refuses foreign metadata URLs instead of treating them as fetch destinations', async () => {
    const built = await createTemplateArtifact(fixture());
    let requests = 0;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => {
        requests += 1;
        return jsonResponse(
          entry(built.artifact.manifest.merkle_root, {
            artifact_url: 'https://foreign.example/artifact',
          }),
        );
      },
    });
    await expect(client.entry(ENTRY_ID)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
    expect(requests).toBe(1);
  });

  it('refuses a valid but wrong entry identity from a stale upstream response', async () => {
    const built = await createTemplateArtifact(fixture());
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () =>
        jsonResponse(
          entry(built.artifact.manifest.merkle_root, {
            id: '33333333-3333-4333-8333-333333333333',
            report_url: `${ORIGIN}/api/v1/entries/33333333-3333-4333-8333-333333333333/reports`,
          }),
        ),
    });
    await expect(client.entry(ENTRY_ID)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
  });

  it('refuses malformed and declared-oversized metadata bodies', async () => {
    const malformed = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () =>
        new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    });
    await expect(malformed.entry(ENTRY_ID)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
    let cancelled = 0;
    const oversized = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled += 1;
            },
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': String(256 * 1024 + 1),
            },
          },
        ),
    });
    await expect(oversized.entry(ENTRY_ID)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
    expect(cancelled).toBe(1);
  });

  it('refuses an undeclared streamed body once it crosses the metadata cap', async () => {
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () =>
        new Response(new Uint8Array(256 * 1024 + 1), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    await expect(client.entry(ENTRY_ID)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
  });

  it('enforces the absolute deadline after headers without awaiting a stuck cancellation', async () => {
    let cancelled = 0;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      deadlineMs: 10,
      fetch: async () =>
        new Response(
          new ReadableStream({
            pull: async () => await new Promise<never>(() => undefined),
            cancel: () => {
              cancelled += 1;
              return new Promise<void>(() => undefined);
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    });
    await expect(
      Promise.race([
        client.entry(ENTRY_ID),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TEST_DEADLINE_MISSED')), 250),
        ),
      ]),
    ).rejects.toMatchObject({ code: 'TEMPLATE_REGISTRY_REQUEST_FAILED' });
    expect(cancelled).toBeGreaterThan(0);
  });

  it('honors caller cancellation after headers', async () => {
    const controller = new AbortController();
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      deadlineMs: 1000,
      fetch: async () =>
        new Response(
          new ReadableStream({
            pull: async () => await new Promise<never>(() => undefined),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const pending = client.entry(ENTRY_ID, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_REQUEST_FAILED',
    });
  });

  it('enforces elapsed time while immediately resolving one-byte chunks starve timers', async () => {
    let emitted = 0;
    const maximumChunks = 1_000_000;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      deadlineMs: 2,
      fetch: async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              emitted += 1;
              if (emitted > maximumChunks) controller.close();
              else controller.enqueue(Uint8Array.of(0x20));
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    });
    await expect(client.entry(ENTRY_ID)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_REQUEST_FAILED',
    });
    expect(emitted).toBeLessThan(maximumChunks);
  });

  it.each([
    ['wrong media type', { 'Content-Type': 'application/octet-stream' }],
    ['wrong root', { 'X-Template-Root': 'f'.repeat(64) }],
    ['wrong raw hash', { ETag: `"${'f'.repeat(64)}"` }],
  ])('refuses an artifact with %s', async (_label, headers) => {
    const built = await createTemplateArtifact(fixture());
    const root = built.artifact.manifest.merkle_root;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => artifactResponse(built.bytes, root, headers),
    });
    await expect(client.fetchArtifact(root)).rejects.toBeInstanceOf(
      TemplateRegistryClientError,
    );
  });

  it('preserves the unsupported-schema refusal and rejects over-inflated artifacts', async () => {
    const built = await createTemplateArtifact(fixture());
    const root = built.artifact.manifest.merkle_root;
    const files = unzipSync(built.bytes);
    const manifest = JSON.parse(
      new TextDecoder().decode(files['manifest.json']),
    ) as Record<string, unknown>;
    const unsupported = zipSync({
      ...files,
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          ...manifest,
          protocol_schema_version: CURRENT_SCHEMA_VERSION + 1,
        }),
      ),
    });
    const inflated = zipSync({
      ...files,
      [`assets/${'f'.repeat(64)}`]: new Uint8Array(
        TEMPLATE_ARTIFACT_LIMITS.inflatedBytes,
      ),
    });
    const responses = [unsupported, inflated];
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => artifactResponse(responses.shift()!, root),
    });
    await expect(client.fetchArtifact(root)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_SCHEMA_UNSUPPORTED',
    });
    await expect(client.fetchArtifact(root)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_ARTIFACT_INVALID',
    });
  });

  it('refuses a compressed response over the transport cap before reading it', async () => {
    let cancelled = 0;
    const root = 'a'.repeat(64);
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled += 1;
            },
          }),
          {
            headers: {
              'Content-Type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
              'Content-Length': String(
                TEMPLATE_ARTIFACT_LIMITS.archiveBytes + 1,
              ),
              'ETag': `"${'b'.repeat(64)}"`,
              'X-Template-Root': root,
              'X-Registry-Yanked': 'false',
            },
          },
        ),
    });
    await expect(client.fetchArtifact(root)).rejects.toMatchObject({
      code: 'TEMPLATE_REGISTRY_RESPONSE_INVALID',
    });
    expect(cancelled).toBe(1);
  });

  it('rejects invalid local publication bytes before transport and keeps failures secret-safe', async () => {
    let requests = 0;
    const secret = `ncr1_${'z'.repeat(43)}`;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => {
        requests += 1;
        throw new Error(`provider echoed ${secret}`);
      },
    });
    await expect(
      client.publish(new Uint8Array([1, 2, 3]), secret),
    ).rejects.toMatchObject({ code: 'TEMPLATE_REGISTRY_ARTIFACT_INVALID' });
    expect(requests).toBe(0);
    const built = await createTemplateArtifact(fixture());
    let error: unknown;
    try {
      await client.publish(built.bytes, secret);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'TEMPLATE_REGISTRY_REQUEST_FAILED' });
    expect(String(error)).not.toContain(secret);
  });

  it('honors an already-aborted publication before validating or sending bytes', async () => {
    const controller = new AbortController();
    controller.abort();
    let requests = 0;
    const client = new TemplateRegistryClient({
      origin: ORIGIN,
      fetch: async () => {
        requests += 1;
        throw new Error();
      },
    });
    await expect(
      client.publish(new Uint8Array([1, 2, 3]), CREDENTIAL, controller.signal),
    ).rejects.toMatchObject({ code: 'TEMPLATE_REGISTRY_REQUEST_FAILED' });
    expect(requests).toBe(0);
  });
});
