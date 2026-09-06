import { randomBytes } from 'node:crypto';

import { escapeIdentifier } from 'pg';

import { createRegistryTestDatabase } from '../../__tests__/database.ts';
import { REGISTRY_AUTH_TABLES } from '../schema.ts';
import {
  createRegistryAuth,
  type RegistryAuthOptions,
  type RegistryAuthDiagnostic,
} from '../service.ts';

export const REGISTRY_ORIGIN = 'https://registry.test';

export async function createAuthFixture() {
  const database = await createRegistryTestDatabase(
    REGISTRY_AUTH_TABLES,
    ({ app }) => `
    GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(app)};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${escapeIdentifier(app)};
  `,
  );
  const { owner, pool, role, dispose } = database;

  const sent: { email: string; url: string }[] = [];
  const diagnostics: RegistryAuthDiagnostic[] = [];
  const options: RegistryAuthOptions = {
    pool,
    baseUrl: REGISTRY_ORIGIN,
    secret: randomBytes(32).toString('hex'),
    sendMagicLink: async (input) => {
      sent.push(input);
    },
    onDiagnostic: (code) => diagnostics.push(code),
  };
  const createAuth = (
    overrides: Partial<
      Pick<RegistryAuthOptions, 'sendMagicLink' | 'onDiagnostic'>
    > = {},
  ) => createRegistryAuth({ ...options, ...overrides });
  return {
    owner,
    pool,
    role,
    options,
    sent,
    diagnostics,
    createAuth,
    auth: createAuth(),
    dispose,
  };
}

export type AuthFixture = Awaited<ReturnType<typeof createAuthFixture>>;
