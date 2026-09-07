import { randomBytes } from 'node:crypto';

import { expect, vi } from 'vitest';
import { z } from 'zod';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import {
  createTemplateArtifact,
  templateBytesHash,
  type TemplateArtifactInput,
} from '@codaco/studio-sync/template-exchange';

import {
  PublisherSchema,
  TokenDescriptionSchema,
} from '../account-contract.ts';
import { createRegistryApp } from '../app.ts';
import {
  createRegistryAuth,
  type RegistryAuthOptions,
} from '../auth/service.ts';
import type { RegistryBlobStore } from '../blob-store.ts';
import { EntrySchema } from '../contract.ts';
import { REGISTRY_TABLES, registrySidecarSql } from '../db/schema.ts';
import type { RegistryLimits } from '../limits.ts';
import { RegistryStore } from '../store.ts';
import { createRegistryTestDatabase } from './database.ts';

export const ORIGIN = 'https://registry.test';
const tokenResult = z.strictObject({
  token: z.string(),
  credential: TokenDescriptionSchema,
});
const DEFAULT_LIMITS: RegistryLimits = {
  publisherBytes: 1024 * 1024,
  totalBytes: 5 * 1024 * 1024,
  publishPerHour: 30,
  publishGlobalPerMinute: 100,
  reportsPerHour: 100,
  reportsPerEntryPerHour: 10,
  accountWritesPerHour: 30,
  accountWritesGlobalPerHour: 120,
};

export async function template(
  name = 'Portable template',
  options: Partial<TemplateArtifactInput> = {},
) {
  return createTemplateArtifact({
    template: { name, kind: 'protocol', version: 1 },
    metadata: {
      schema_version: 1,
      authors: [{ name: 'A researcher' }],
      description: 'An interview measure.',
      keywords: ['networks'],
    },
    license: 'CC0-1.0',
    sections: {
      'settings': { schemaVersion: CURRENT_SCHEMA_VERSION, name },
      'stageOrder': { stages: ['welcome'] },
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'greeting', type: 'text', content: 'Hello.' }],
      },
    },
    assets: [],
    ...options,
  });
}

export async function createRegistryFixture(
  limits: Partial<RegistryLimits> = {},
  installation?: Awaited<ReturnType<typeof createRegistryTestDatabase>>,
) {
  const database =
    installation ??
    (await createRegistryTestDatabase(REGISTRY_TABLES, registrySidecarSql));
  const sent: { email: string; url: string }[] = [];
  const objects = new Map<string, Uint8Array>();
  const objectTimes = new Map<string, Date>();
  const diagnostics: string[] = [];
  const blobs: RegistryBlobStore = {
    put: vi.fn(async (rawHash: string, bytes: Uint8Array) => {
      expect(templateBytesHash(bytes)).toBe(rawHash);
      objects.set(rawHash, Uint8Array.from(bytes));
      objectTimes.set(rawHash, new Date());
    }),
    get: vi.fn(async (rawHash: string) => {
      const value = objects.get(rawHash);
      return value ? Uint8Array.from(value) : null;
    }),
    delete: vi.fn(async (rawHash: string) => {
      objects.delete(rawHash);
      objectTimes.delete(rawHash);
    }),
    scan: vi.fn(async () => ({
      objects: Array.from(objects.keys()).map((rawHash) => ({
        rawHash,
        modifiedAt: objectTimes.get(rawHash) ?? new Date(),
      })),
    })),
    ready: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  const authOptions: RegistryAuthOptions = {
    pool: database.pool,
    baseUrl: ORIGIN,
    secret: randomBytes(32).toString('hex'),
    sendMagicLink: async (value) => {
      sent.push(value);
    },
    onDiagnostic: (code) => {
      diagnostics.push(code);
    },
  };
  const createReplica = (overrides: Partial<RegistryLimits> = {}) => {
    const auth = createRegistryAuth(authOptions);
    const store = new RegistryStore({
      pool: database.pool,
      operatorPool: database.operatorPool,
      auth,
      blobs,
      baseUrl: ORIGIN,
      limits: { ...DEFAULT_LIMITS, ...limits, ...overrides },
    });
    const app = createRegistryApp({
      store,
      auth,
      accepting: () => true,
      ready: async () => true,
      onDiagnostic: (code) => diagnostics.push(code),
    });
    return { auth, store, app };
  };
  const replica = createReplica();
  type App = typeof replica.app;
  const request = (
    method: string,
    path: string,
    body?: unknown,
    headers = new Headers(),
    app: App = replica.app,
  ) => {
    const copied = new Headers(headers);
    if (body !== undefined) copied.set('Content-Type', 'application/json');
    return app.request(`${ORIGIN}/api/v1${path}`, {
      method,
      headers: copied,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  const login = async (email: string) => {
    const count = sent.length;
    const response = await replica.app.request(
      `${ORIGIN}/api/auth/sign-in/magic-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'origin': ORIGIN },
        body: JSON.stringify({ email, callbackURL: '/account' }),
      },
    );
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(count + 1);
    const message = sent[count];
    if (!message) throw new Error('Expected a locally captured magic link');
    const verified = await replica.app.request(message.url);
    expect(verified.status).toBe(302);
    const cookies = verified.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0]);
    expect(
      cookies.some((cookie) =>
        cookie?.startsWith('__Secure-registry.session_token='),
      ),
    ).toBe(true);
    const headers = new Headers({ cookie: cookies.join('; '), origin: ORIGIN });
    const session = await replica.auth.getSession(headers);
    expect(session?.emailVerified).toBe(true);
    if (!session) throw new Error('Expected a verified registry session');
    return { headers, session };
  };
  const account = async (
    email = 'publisher@example.test',
    operator = false,
  ) => {
    const { headers, session } = await login(email);
    const claimed = await request(
      'POST',
      '/account/publisher',
      { name: 'Example publisher' },
      headers,
    );
    expect(claimed.status).toBe(200);
    const publisher = PublisherSchema.parse(await claimed.json());
    // Explicit owner fixture action; the runtime app/operator roles cannot grant operators.
    if (operator)
      await database.owner.query(
        'INSERT INTO registry_operators(user_id, enabled) VALUES ($1, true)',
        [session.userId],
      );
    const issued = await request(
      'POST',
      '/account/tokens',
      {
        name: 'Test credential',
        scopes: operator ? ['publish', 'moderate'] : ['publish'],
      },
      headers,
    );
    expect(issued.status).toBe(201);
    const credential = tokenResult.parse(await issued.json());
    return {
      ...credential,
      publisher,
      headers,
      session,
      bearer: new Headers({ authorization: `Bearer ${credential.token}` }),
    };
  };
  const publish = async (
    token: string,
    bytes: Uint8Array,
    app: App = replica.app,
  ) => {
    const form = new FormData();
    form.set(
      'artifact',
      new File([Uint8Array.from(bytes)], 'template.nctemplate'),
    );
    return app.request(`${ORIGIN}/api/v1/entries`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
  };
  const published = async (
    token: string,
    name?: string,
    options?: Partial<TemplateArtifactInput>,
  ) => {
    const built = await template(name, options);
    const response = await publish(token, built.bytes);
    expect(response.status).toBe(201);
    return { ...built, entry: EntrySchema.parse(await response.json()) };
  };
  return {
    ...database,
    ...replica,
    sent,
    diagnostics,
    objects,
    objectTimes,
    blobs,
    request,
    login,
    account,
    publish,
    published,
    createReplica,
  };
}

export type RegistryFixture = Awaited<ReturnType<typeof createRegistryFixture>>;
