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
  CreateStudyInputSchema,
  CreateStudyResultSchema,
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
  StudyCountsInputSchema,
  StudyCountsSchema,
  StudyDetailSchema,
  StudyGetInputSchema,
  StudySummarySchema,
  TeamScopedSchema,
  UpdateAccountLocaleInputSchema,
  UpdateAccountLocaleResultSchema,
  UpdateTeamMemberRoleInputSchema,
  UpdateTeamMemberRoleResultSchema,
} from './schemas.ts';

export {
  SUPPORTED_STUDIO_LOCALES,
  type SupportedStudioLocale,
} from './locales.ts';

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
  /**
   * The caller's own account: personal, not team-scoped, so these take no
   * teamId and need only a signed-in user. Deliberately unaudited (2026-09-04
   * localization design §5.2, decision 7): the audit log is study/team-scoped
   * by design, and a personal presentation preference has no tenant and no
   * research-data significance.
   */
  account: {
    /**
     * Stores the caller's UI-language preference; null reverts to browser
     * negotiation ("Automatic"). `me` reports the stored value.
     */
    updateLocale: oc
      .input(UpdateAccountLocaleInputSchema)
      .output(UpdateAccountLocaleResultSchema),
  },
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
   * The team's studies (#1262): what a researcher picks their work from, and
   * what `/study/$studyId` addresses.
   *
   * Who sees what is #1257's starter matrix, unchanged here: a team Admin or
   * Owner sees every study their team owns, and a team Member sees only the
   * studies they hold a study-role grant on. Creation is the Admin/Owner
   * action that decision narrowed it to, and the creator receives the study's
   * first Manager grant.
   */
  studies: {
    list: oc.input(TeamScopedSchema).output(z.array(StudySummarySchema)),
    /**
     * One study, addressed by study id alone: a study URL is canonical and
     * has to open from a cold navigation that knows no team, so the server
     * resolves the tenant (app-shell design §6.3). A study the caller cannot
     * reach — absent, another team's, or one their team role does not show
     * them — is FORBIDDEN in every case, so this is not an existence oracle.
     */
    get: oc.input(StudyGetInputSchema).output(StudyDetailSchema),
    /**
     * How many things are at each countable destination of one study's
     * sidebar. Addressed and refused exactly like `get`: the sidebar renders
     * for whoever can open the study, and a count must not say anything about
     * a study its reader could not open.
     */
    counts: oc.input(StudyCountsInputSchema).output(StudyCountsSchema),
    /**
     * Creates the study and its protocol line in one transaction, so every
     * study has something to edit and the editor's address is derivable from
     * the study alone.
     */
    create: oc.input(CreateStudyInputSchema).output(CreateStudyResultSchema),
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
