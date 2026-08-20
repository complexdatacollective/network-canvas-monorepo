import { z } from 'zod';

// Schemas for the internal RPC boundary, shared source-first between server
// validation and the client's types (type-only on the client). This surface
// is unpublished (#1248, 2026-08-11): no OpenAPI metadata, no registry ids.
// Boundary schemas must have identical input and output types — no
// `.transform()`, coercions, or divergent defaults — so one schema describes
// both what the server emits and what the client receives. Declared output
// schemas are also the serialization allowlist: fields not named here are
// stripped before they reach the wire.

export const SOCIAL_PROVIDERS = ['google', 'microsoft'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const StatusSchema = z.object({
  name: z.string(),
  version: z.string(),
  auth: z.object({
    enabled: z.boolean(),
    magicLink: z.boolean(),
    socialProviders: z.array(z.enum(SOCIAL_PROVIDERS)),
  }),
});

export const MeSchema = z.object({
  userId: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string(),
});

// Every workspace-scoped procedure names its workspace explicitly — the authz
// input is never the session's active workspace (#1248: every route is
// workspace-scoped by construction).
export const WorkspaceScopedSchema = z.object({
  workspaceId: z.string().min(1),
});

export const ProtocolSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProtocolInputSchema = WorkspaceScopedSchema.extend({
  name: z.string().min(1),
});

export const CreateProtocolResultSchema = z.object({
  protocolId: z.uuid(),
  draftId: z.uuid(),
});
