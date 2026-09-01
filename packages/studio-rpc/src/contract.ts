import { oc } from '@orpc/contract';
import { z } from 'zod';

import {
  AcceptTeamInvitationInputSchema,
  AcceptTeamInvitationResultSchema,
  AcquireSectionInputSchema,
  AcquireSectionResultSchema,
  AddInformationStageInputSchema,
  AuditEventDetailSchema,
  AuditFilterOptionsSchema,
  AuditGetInputSchema,
  AuditListInputSchema,
  AuditListOutputSchema,
  CancelTeamInvitationInputSchema,
  CancelTeamInvitationResultSchema,
  CommitSectionInputSchema,
  CreateTeamInvitationInputSchema,
  CreateTeamInvitationResultSchema,
  CreateProtocolInputSchema,
  CreateProtocolResultSchema,
  ManifestRevisionSchema,
  MeSchema,
  MoveStageInputSchema,
  ProtocolDraftInputSchema,
  ProtocolDraftSchema,
  ProtocolSummarySchema,
  ReleaseSectionInputSchema,
  RenewSectionInputSchema,
  RenewSectionResultSchema,
  StatusSchema,
  TeamScopedSchema,
  UpdateTeamMemberRoleInputSchema,
  UpdateTeamMemberRoleResultSchema,
} from './schemas.ts';

export {
  AUDIT_CATEGORIES,
  AUDIT_FACET_LIMIT,
  AUDIT_OUTCOMES,
  AuditActorKindSchema,
  AuditCategorySchema,
  AuditOutcomeSchema,
  SOCIAL_PROVIDERS,
  TEAM_ROLES,
  ProtocolNameSchema,
  TeamRoleSchema,
  TeamInvitationIdSchema,
  type AuditActorFilter,
  type AuditCategory,
  type AuditEventDetail,
  type AuditEventSummary,
  type AuditFilterOptions,
  type AuditOutcome,
  type SocialProvider,
  type TeamRole,
} from './schemas.ts';

// The SPA's internal RPC contract (oRPC v2, per the 2026-08-10 decision on
// #1244). This is the only shared code between the two Studio deployables —
// the leaf of the client/server package diamond (#1244, 2026-08-11) — so it
// changes exactly when the API boundary changes, and release CI re-gates a
// half only when its boundary moved.
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
  status: oc.output(StatusSchema),
  /** The signed-in researcher; refuses UNAUTHORIZED without a session. */
  me: oc.output(MeSchema),
  team: {
    acceptInvitation: oc
      .input(AcceptTeamInvitationInputSchema)
      .output(AcceptTeamInvitationResultSchema),
    updateMemberRole: oc
      .input(UpdateTeamMemberRoleInputSchema)
      .output(UpdateTeamMemberRoleResultSchema),
    createInvitation: oc
      .input(CreateTeamInvitationInputSchema)
      .output(CreateTeamInvitationResultSchema),
    cancelInvitation: oc
      .input(CancelTeamInvitationInputSchema)
      .output(CancelTeamInvitationResultSchema),
  },
  /**
   * Team-scoped procedures: every input carries a teamId, checked against the
   * caller's membership (FORBIDDEN for non-members and unknown teams alike —
   * no existence oracle).
   */
  protocols: {
    create: oc
      .input(CreateProtocolInputSchema)
      .output(CreateProtocolResultSchema),
    draft: oc.input(ProtocolDraftInputSchema).output(ProtocolDraftSchema),
    list: oc.input(TeamScopedSchema).output(z.array(ProtocolSummarySchema)),
    acquireSection: oc
      .input(AcquireSectionInputSchema)
      .output(AcquireSectionResultSchema),
    commitSection: oc
      .input(CommitSectionInputSchema)
      .output(ManifestRevisionSchema),
    renewSection: oc
      .input(RenewSectionInputSchema)
      .output(RenewSectionResultSchema),
    releaseSection: oc.input(ReleaseSectionInputSchema).output(z.void()),
    addInformationStage: oc
      .input(AddInformationStageInputSchema)
      .output(ManifestRevisionSchema),
    moveStage: oc.input(MoveStageInputSchema).output(ManifestRevisionSchema),
  },
  /**
   * The team's immutable activity record. Reads require the audit.read
   * permission (built-in owner/admin until #1257); ordering and cursors are
   * per-team sequences, never timestamps.
   */
  audit: {
    list: oc.input(AuditListInputSchema).output(AuditListOutputSchema),
    get: oc.input(AuditGetInputSchema).output(AuditEventDetailSchema),
    /**
     * The values the list filters can take, over the team's whole history.
     * A separate procedure, not a field on the list response: the option set
     * is invariant across pages and across filter changes, so folding it into
     * audit.list would re-run two aggregate queries on every "Load more" and
     * on every filter apply, and would make the options narrow to whatever
     * the current filter already matched.
     */
    filterOptions: oc.input(TeamScopedSchema).output(AuditFilterOptionsSchema),
  },
};
