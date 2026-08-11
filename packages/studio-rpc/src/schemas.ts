import { z } from 'zod';

// Schemas for the internal RPC boundary, shared source-first between server
// validation and the client's types (type-only on the client). This surface
// is unpublished (#1248, 2026-08-11): no OpenAPI metadata, no registry ids.
// Boundary schemas must have identical input and output types — no
// `.transform()`, coercions, or divergent defaults — so one schema describes
// both what the server emits and what the client receives. Declared output
// schemas are also the serialization allowlist: fields not named here are
// stripped before they reach the wire.

export const StatusSchema = z.object({
  name: z.string(),
  version: z.string(),
  auth: z.object({
    enabled: z.boolean(),
    magicLink: z.boolean(),
  }),
});

export const MeSchema = z.object({
  userId: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string(),
});
