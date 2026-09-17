import { protocolBuilderContract } from './protocolBuilder.ts';

export {
  AUDIT_CATEGORIES,
  AUDIT_FACET_LIMIT,
  AUDIT_OUTCOMES,
  AuditActorKindSchema,
  AuditCategorySchema,
  AuditOutcomeSchema,
  SOCIAL_PROVIDERS,
  STUDY_PARTICIPATION_MODES,
  STUDY_STATES,
  TEAM_ROLES,
  ProtocolNameSchema,
  StudyNameSchema,
  StudyParticipationModeSchema,
  StudyStateSchema,
  TeamRoleSchema,
  TeamInvitationIdSchema,
  type AuditActorFilter,
  type AuditCategory,
  type AuditEventDetail,
  type AuditEventSummary,
  type AuditFilterOptions,
  type AuditOutcome,
  type SocialProvider,
  type StudyCounts,
  type StudyParticipationMode,
  type StudyState,
  type TeamRole,
} from './schemas.ts';

// What is left of the SPA's internal oRPC contract (oRPC v2, per the
// 2026-08-10 decision on #1244).
//
// The twenty researcher-facing procedures are gone: they are `StudioRpcs` in
// `@codaco/studio-contract` now, served at `/rpc` by an Effect rpc server
// (#1930). What remains is the protocol builder's own contract, which the
// editor still reaches over the `/ws` oRPC bridge until stage 8 gives it an
// `RpcGroup`. The zod schemas below are re-exported unchanged: the server's
// stores, commands and audit renderers still type themselves from them, and
// they move when the code that reads them does.
//
// This surface is deliberately separate from the public data API (#1248,
// 2026-08-11): procedures here are view/workflow-shaped for app screens,
// unpublished, and free-moving within the deploy-compatibility rules on
// #1245. The public API's contract lives inside the server, its only
// consumer in this repo.
//
// Node loads this package's source directly in development (the server runs
// under `node --watch`), so relative imports carry explicit `.ts` extensions.

export const contract = {
  /**
   * The editing host `@codaco/protocol-builder-core` defines, nested whole so a
   * Studio router client exposes it as `client.protocolBuilder` typed by the
   * package's own contract. Its inputs name a protocol and never a team or a
   * draft: the server derives both from the caller's memberships, the way a
   * `/study/$studyId` URL is resolved.
   *
   * The only procedures left here. The twenty researcher-facing ones moved to
   * `@codaco/studio-contract`'s `StudioRpcs` when `/rpc` became an Effect rpc
   * server (#1930); this one stays on oRPC over the `/ws` bridge until stage 8
   * gives the protocol builder an `RpcGroup` of its own.
   */
  protocolBuilder: protocolBuilderContract,
};
