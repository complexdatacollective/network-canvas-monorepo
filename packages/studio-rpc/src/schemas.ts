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
export const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

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

// Every team-scoped procedure names its team explicitly — the authz input is
// never the session's active team (#1248: every route is team-scoped by
// construction).
export const TeamScopedSchema = z.object({
  teamId: z.string().min(1),
});

export const UpdateTeamMemberRoleInputSchema = TeamScopedSchema.extend({
  memberId: z.string().min(1),
  role: TeamRoleSchema,
});

export const UpdateTeamMemberRoleResultSchema = z.object({
  memberId: z.string().min(1),
  role: TeamRoleSchema,
});

export const CreateTeamInvitationInputSchema = TeamScopedSchema.extend({
  email: z.email().max(320),
  role: TeamRoleSchema,
});

export const CreateTeamInvitationResultSchema = z.object({
  invitationId: z.string().min(1),
  email: z.email().max(320),
  role: TeamRoleSchema,
  status: z.literal('pending'),
  expiresAt: z.date(),
});

export const CancelTeamInvitationInputSchema = TeamScopedSchema.extend({
  invitationId: z.string().min(1),
});

export const CancelTeamInvitationResultSchema = z.object({
  invitationId: z.string().min(1),
  status: z.literal('canceled'),
});

export const ProtocolSummarySchema = z.object({
  id: z.uuid(),
  draftId: z.uuid().nullable(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProtocolInputSchema = TeamScopedSchema.extend({
  name: z.string().min(1),
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

export const CreateProtocolResultSchema = z.object({
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

const DecimalSequenceSchema = z.string().regex(/^\d+$/);
const SectionDocumentSchema = z.record(z.string(), z.unknown());

export const ProtocolDraftInputSchema = TeamScopedSchema.extend({
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

export const ProtocolDraftSchema = z.object({
  protocol: ProtocolSummarySchema.extend({ draftId: z.uuid() }),
  revision: z.object({
    sequence: DecimalSequenceSchema,
    hash: z.string().min(1),
  }),
  sections: z.record(z.string(), SectionDocumentSchema),
});

const SectionScopedSchema = ProtocolDraftInputSchema.extend({
  sectionId: z.string().min(1),
  clientId: z.uuid(),
});

export const AcquireSectionInputSchema = SectionScopedSchema;
export const AcquireSectionResultSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('editable'),
    leaseEpoch: DecimalSequenceSchema,
    nextClientSequence: DecimalSequenceSchema,
  }),
  z.object({ mode: z.literal('readOnly') }),
]);

const CommandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), key: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('unset'), key: z.string() }),
  z.object({
    op: z.literal('insertItem'),
    key: z.string(),
    index: z.number().int().nonnegative(),
    item: z.unknown(),
  }),
  z.object({
    op: z.literal('removeItem'),
    key: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal('moveItem'),
    key: z.string(),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  }),
]);

export const CommitSectionInputSchema = SectionScopedSchema.extend({
  leaseEpoch: DecimalSequenceSchema,
  clientSequence: DecimalSequenceSchema,
  commands: z.array(CommandSchema).min(1),
});

export const ManifestRevisionSchema = z.object({
  sequence: DecimalSequenceSchema,
  hash: z.string().min(1),
});

export const RenewSectionInputSchema = SectionScopedSchema.extend({
  leaseEpoch: DecimalSequenceSchema,
});

export const RenewSectionResultSchema = z.object({ renewed: z.boolean() });
export const ReleaseSectionInputSchema = SectionScopedSchema.extend({
  leaseEpoch: DecimalSequenceSchema,
});

export const AddInformationStageInputSchema = ProtocolDraftInputSchema.extend({
  stageId: z.uuid(),
});

export const MoveStageInputSchema = ProtocolDraftInputSchema.extend({
  stageId: z.string().min(1),
  toIndex: z.number().int().nonnegative(),
  expectedRevision: DecimalSequenceSchema,
});
