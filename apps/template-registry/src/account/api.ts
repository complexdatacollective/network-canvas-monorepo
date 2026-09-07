import { z } from 'zod';

import {
  AccountSchema,
  ClaimPublisherSchema,
  CreateTokenSchema,
  PublisherSchema,
  ReportsPageSchema,
  TokenDescriptionSchema,
} from '../account-contract.ts';

export type RegistryAccount = z.infer<typeof AccountSchema>;
export type RegistryCredential = z.infer<typeof TokenDescriptionSchema>;
export type RegistryReports = z.infer<typeof ReportsPageSchema>;
type RequestFailure =
  | 'signed_out'
  | 'forbidden'
  | 'rate_limited'
  | 'invalid'
  | 'unavailable'
  | 'curation_metadata';
export class AccountRequestError extends Error {
  readonly failure: RequestFailure;
  constructor(failure: RequestFailure) {
    super('REGISTRY_ACCOUNT_REQUEST_FAILED');
    this.failure = failure;
  }
}

const success = z.strictObject({ ok: z.literal(true) });
const issue = z.strictObject({
  token: z.string().regex(/^ncr1_[A-Za-z0-9_-]{43}$/),
  credential: TokenDescriptionSchema,
});
const tokenList = z.strictObject({
  data: z.array(TokenDescriptionSchema).max(20),
});

async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  signal: AbortSignal,
  method = 'GET',
  body?: unknown,
): Promise<z.output<S>> {
  const response = await fetch(path, {
    method,
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    // Parse only a known problem code. Arbitrary provider/server error text
    // never becomes researcher-visible output or a browser diagnostic.
    const problem = z
      .object({ code: z.string() })
      .safeParse(await response.json().catch(() => null));
    throw new AccountRequestError(
      response.status === 401
        ? 'signed_out'
        : response.status === 403
          ? 'forbidden'
          : response.status === 429
            ? 'rate_limited'
            : problem.success &&
                problem.data.code === 'CURATION_METADATA_REQUIRED'
              ? 'curation_metadata'
              : response.status === 400 || response.status === 422
                ? 'invalid'
                : 'unavailable',
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new AccountRequestError('unavailable');
  return parsed.data;
}

export const registryAccountClient = {
  account: (signal: AbortSignal) =>
    request(AccountSchema, '/api/v1/account', signal),
  sendLink: async (email: string, signal: AbortSignal) => {
    // Better Auth's successful body is deliberately not used as app state.
    await request(
      z.object({}),
      '/api/auth/sign-in/magic-link',
      signal,
      'POST',
      {
        email,
        callbackURL: '/account',
        errorCallbackURL: '/account?error=invalid-link',
      },
    );
    return { ok: true as const };
  },
  signOut: async (signal: AbortSignal) => {
    await request(z.object({}), '/api/auth/sign-out', signal, 'POST', {});
    return { ok: true as const };
  },
  publisher: (
    value: z.infer<typeof ClaimPublisherSchema>,
    signal: AbortSignal,
  ) =>
    request(
      PublisherSchema,
      '/api/v1/account/publisher',
      signal,
      'POST',
      ClaimPublisherSchema.parse(value),
    ),
  tokens: (signal: AbortSignal) =>
    request(tokenList, '/api/v1/account/tokens', signal),
  createToken: (
    value: z.input<typeof CreateTokenSchema>,
    signal: AbortSignal,
  ) =>
    request(
      issue,
      '/api/v1/account/tokens',
      signal,
      'POST',
      CreateTokenSchema.parse(value),
    ),
  revokeToken: (id: string, signal: AbortSignal) =>
    request(
      success,
      `/api/v1/account/tokens/${encodeURIComponent(id)}`,
      signal,
      'DELETE',
    ),
  reports: (after: string | undefined, signal: AbortSignal) =>
    request(
      ReportsPageSchema,
      '/api/v1/account/moderation/reports',
      signal,
      'POST',
      { limit: 20, ...(after === undefined ? {} : { after }) },
    ),
  curate: (id: string, curated: boolean, signal: AbortSignal) =>
    request(
      success,
      `/api/v1/account/moderation/entries/${encodeURIComponent(id)}/curation`,
      signal,
      'PUT',
      { curated },
    ),
  visibility: (id: string, removed: boolean, signal: AbortSignal) =>
    request(
      success,
      `/api/v1/account/moderation/entries/${encodeURIComponent(id)}/${removed ? 'takedown' : 'restore'}`,
      signal,
      'POST',
    ),
  suspend: (id: string, suspended: boolean, signal: AbortSignal) =>
    request(
      success,
      `/api/v1/account/moderation/publishers/${encodeURIComponent(id)}/suspension`,
      signal,
      'PUT',
      { suspended },
    ),
  hardDelete: (root: string, signal: AbortSignal) =>
    request(
      success,
      `/api/v1/account/moderation/artifacts/${encodeURIComponent(root)}`,
      signal,
      'DELETE',
    ),
};
export type RegistryAccountClient = typeof registryAccountClient;
