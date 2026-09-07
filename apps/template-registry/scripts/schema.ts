import {
  renderPostgresSchemaStatements,
  fingerprintPostgresSchema,
} from '@codaco/studio-sync/postgres-migration-authoring';

import { REGISTRY_TABLES, REGISTRY_SIDECARS } from '../src/db/schema.ts';

/** Authoring only; drizzle-kit must never enter the registry runtime image. */
export async function renderRegistrySchema() {
  const statements = await renderPostgresSchemaStatements(REGISTRY_TABLES);
  const fingerprint = fingerprintPostgresSchema(statements, REGISTRY_SIDECARS);
  return { statements, fingerprint };
}
