import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { TEAM_ROLES, type TeamRole } from '@codaco/studio-rpc';

import { orpc, rpcClient } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { studioEmailPattern } from '../lib/emailValidation.ts';
import {
  canManageTeam,
  roleLabel,
  teamRoles,
  teamRolesLabel,
} from '../lib/teamRoles.ts';

/**
 * Membership and invitations, at `/team/$teamId/members` (§5.2, #1256).
 *
 * The other half of §5.4's split of the shipped team screen. It is the same
 * screen, at the address the team sidebar has always pointed at, with the
 * cross-coordination that screen needed gone: nothing on this route creates
 * studies or switches teams, so a mutation here only has to block the other
 * mutations here.
 *
 * **The team comes from the URL; the membership data comes from Better Auth's
 * active organization.** Members and invitations are only readable for the
 * active team, so this route renders once the app shell's reconciler (§6.6)
 * has made the URL's team the active one — and says it is waiting until then,
 * rather than showing another team's members under this team's URL.
 */

type TeamRefreshRecovery = {
  recoveredText: string;
};

type TeamMutationOutcome = {
  commit: 'confirmed' | 'unknown';
  refreshed: boolean;
};

async function reconcileTeamMutation<Result>(
  mutation: () => Promise<Result>,
  refresh: () => Promise<boolean>,
): Promise<TeamMutationOutcome> {
  let commit: TeamMutationOutcome['commit'] = 'confirmed';
  try {
    await mutation();
  } catch {
    commit = 'unknown';
  }
  return { commit, refreshed: await refresh() };
}

type TeamRefreshState = {
  activeMember: Pick<
    ReturnType<typeof authClient.useActiveMember>,
    'error' | 'refetch'
  >;
  activeTeam: Pick<
    ReturnType<typeof authClient.useActiveOrganization>,
    'error' | 'refetch'
  >;
};

function useTeamStateRefresh(
  activeTeam: TeamRefreshState['activeTeam'],
  activeMember: TeamRefreshState['activeMember'],
) {
  const queryClient = useQueryClient();
  const latestState = useRef<TeamRefreshState>({
    activeMember,
    activeTeam,
  });
  latestState.current = { activeMember, activeTeam };
  const mounted = useRef(true);
  const pendingInspections = useRef<Array<(refreshed: boolean) => void>>([]);
  const refreshQueue = useRef<Promise<void>>(Promise.resolve());
  const [inspectionVersion, requestInspection] = useReducer(
    (version: number) => version + 1,
    0,
  );

  useLayoutEffect(() => {
    const inspections = pendingInspections.current.splice(0);
    if (inspections.length === 0) return;
    const refreshed =
      latestState.current.activeTeam.error === null &&
      latestState.current.activeMember.error === null;
    for (const resolve of inspections) resolve(refreshed);
  }, [inspectionVersion]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const inspections = pendingInspections.current.splice(0);
      for (const resolve of inspections) resolve(false);
    };
  }, []);

  return useCallback(() => {
    const refresh = async () => {
      const state = latestState.current;
      const results = await Promise.allSettled([
        Promise.resolve().then(() => state.activeTeam.refetch()),
        Promise.resolve().then(() => state.activeMember.refetch()),
        // `me` carries the caller's role in EVERY team, and the header's
        // switcher badges every row from it. An owner may demote themselves
        // while another owner remains, and the header outlives this screen —
        // without this it would go on calling them Owner until something
        // unrelated remounted it.
        Promise.resolve().then(() =>
          queryClient.invalidateQueries({ queryKey: orpc.me.key() }),
        ),
      ]);
      if (
        !mounted.current ||
        results.some((result) => result.status === 'rejected')
      ) {
        return false;
      }

      // Better Auth resolves refetch() after storing an error. Request one
      // render after settlement so this inspects the resulting hook snapshots,
      // rather than the successful promise or the closure that began the fetch.
      return new Promise<boolean>((resolve) => {
        pendingInspections.current.push(resolve);
        requestInspection();
      });
    };

    const outcome = refreshQueue.current.then(refresh, refresh);
    refreshQueue.current = outcome.then(
      () => undefined,
      () => undefined,
    );
    return outcome;
  }, [queryClient]);
}

const messages = defineMessages({
  heading: {
    id: 'studio.teamMembers.heading',
    defaultMessage: 'Members',
    description: "Heading of a team's members screen.",
  },
  intro: {
    id: 'studio.teamMembers.intro',
    defaultMessage:
      'Who belongs to this team, and which invitations are still outstanding.',
    description: "Introduction under the members screen's heading.",
  },
  accessUnavailable: {
    id: 'studio.teamMembers.accessUnavailable',
    defaultMessage: 'Studio could not load this team and your access to it.',
    description:
      "Shown when neither the team nor the researcher's membership in it could be read.",
  },
  retryAccess: {
    id: 'studio.teamMembers.retryAccess',
    defaultMessage: 'Retry team access',
    description: 'Button retrying the team and membership reads.',
  },
  loadingAccess: {
    id: 'studio.teamMembers.loadingAccess',
    defaultMessage: 'Loading team access…',
    description:
      "Shown while the members screen waits for the URL's team to become the active one.",
  },
  membersHeading: {
    id: 'studio.teamMembers.membersHeading',
    defaultMessage: 'Team members',
    description: 'Heading of the member list section.',
  },
  membersIntro: {
    id: 'studio.teamMembers.membersIntro',
    defaultMessage:
      'View who can access this team and the role assigned to each person.',
    description: 'Introduction under the member list heading.',
  },
  memberCount: {
    id: 'studio.teamMembers.memberCount',
    defaultMessage: '{count, plural, one {# member} other {# members}}',
    description: 'Badge counting how many members the team has.',
  },
  refreshTeamDetails: {
    id: 'studio.teamMembers.refreshTeamDetails',
    defaultMessage: 'Refresh team details',
    description:
      'Button re-reading team details after a change whose outcome is unknown.',
  },
  nameColumn: {
    id: 'studio.teamMembers.nameColumn',
    defaultMessage: 'Name',
    description: "Member table column heading: the member's name.",
  },
  emailColumn: {
    id: 'studio.teamMembers.emailColumn',
    defaultMessage: 'Email',
    description: "Member table column heading: the member's email address.",
  },
  roleColumn: {
    id: 'studio.teamMembers.roleColumn',
    defaultMessage: 'Role',
    description: "Member table column heading: the member's team role.",
  },
  you: {
    id: 'studio.teamMembers.you',
    defaultMessage: '(you)',
    description:
      "Marker beside the signed-in researcher's own row in the member table.",
  },
  roleFor: {
    id: 'studio.teamMembers.roleFor',
    defaultMessage: 'Role for {name}',
    description:
      "Accessible name of a member row's role selector; {name} is the member's name.",
  },
  unsupportedRole: {
    id: 'studio.teamMembers.unsupportedRole',
    defaultMessage: 'Studio received an unsupported team role.',
    description:
      'Shown when the role selector produced a value Studio does not recognise.',
  },
  roleChangeUnconfirmedRefreshed: {
    id: 'studio.teamMembers.roleChangeUnconfirmedRefreshed',
    defaultMessage:
      'Studio could not confirm whether the team role changed. Team details were refreshed; review the current role before making another change.',
    description:
      'Shown when a role change may or may not have landed but team details were re-read.',
  },
  roleChangeUnconfirmedNotRefreshed: {
    id: 'studio.teamMembers.roleChangeUnconfirmedNotRefreshed',
    defaultMessage:
      'Studio could not confirm whether the team role changed, and team details could not be refreshed. Refresh them before making another change.',
    description:
      'Shown when a role change may or may not have landed and team details could not be re-read either.',
  },
  roleChangeRecovered: {
    id: 'studio.teamMembers.roleChangeRecovered',
    defaultMessage:
      'Team details refreshed. Review the current role before making another change.',
    description:
      'Shown after a later refresh succeeded following an unconfirmed role change.',
  },
  roleUpdated: {
    id: 'studio.teamMembers.roleUpdated',
    defaultMessage: 'Team role updated.',
    description: 'Confirmation after a role change landed.',
  },
  roleUpdatedNotRefreshed: {
    id: 'studio.teamMembers.roleUpdatedNotRefreshed',
    defaultMessage:
      'Team role updated, but the latest team details could not be refreshed.',
    description:
      'Shown when a role change landed but the member list could not be re-read.',
  },
  roleUpdatedRecovered: {
    id: 'studio.teamMembers.roleUpdatedRecovered',
    defaultMessage: 'Team role updated. Team details refreshed.',
    description:
      'Shown after a later refresh succeeded following a role change.',
  },
  invitationCancelUnconfirmedRefreshed: {
    id: 'studio.teamMembers.invitationCancelUnconfirmedRefreshed',
    defaultMessage:
      'Studio could not confirm whether the invitation was cancelled. Team details were refreshed; check the pending invitations before trying again.',
    description:
      'Shown when cancelling an invitation may or may not have landed but team details were re-read.',
  },
  invitationCancelUnconfirmedNotRefreshed: {
    id: 'studio.teamMembers.invitationCancelUnconfirmedNotRefreshed',
    defaultMessage:
      'Studio could not confirm whether the invitation was cancelled, and team details could not be refreshed. Refresh them before trying again.',
    description:
      'Shown when cancelling an invitation may or may not have landed and team details could not be re-read either.',
  },
  invitationCancelRecovered: {
    id: 'studio.teamMembers.invitationCancelRecovered',
    defaultMessage:
      'Team details refreshed. Check the pending invitations before trying again.',
    description:
      'Shown after a later refresh succeeded following an unconfirmed invitation change.',
  },
  invitationCancelled: {
    id: 'studio.teamMembers.invitationCancelled',
    defaultMessage: 'Invitation cancelled for {email}.',
    description:
      'Confirmation after cancelling an invitation; {email} is the invited address.',
  },
  invitationCancelledNotRefreshed: {
    id: 'studio.teamMembers.invitationCancelledNotRefreshed',
    defaultMessage:
      'Invitation cancelled for {email}, but pending invitations could not be refreshed.',
    description:
      'Shown when cancelling landed but the invitation list could not be re-read; {email} is the invited address.',
  },
  invitationCancelledRecovered: {
    id: 'studio.teamMembers.invitationCancelledRecovered',
    defaultMessage: 'Invitation cancelled for {email}. Team details refreshed.',
    description:
      'Shown after a later refresh succeeded following a cancelled invitation; {email} is the invited address.',
  },
  invitationsHeading: {
    id: 'studio.teamMembers.invitationsHeading',
    defaultMessage: 'Invitations',
    description: 'Heading of the invitations section.',
  },
  invitationsIntro: {
    id: 'studio.teamMembers.invitationsIntro',
    defaultMessage:
      'Invite a collaborator and choose the role they will receive when they join.',
    description: 'Introduction under the invitations heading.',
  },
  chooseValidRole: {
    id: 'studio.teamMembers.chooseValidRole',
    defaultMessage: 'Choose a valid role for this invitation.',
    description:
      'Form error when the invitation form was submitted without a recognised role.',
  },
  refreshBeforeInvite: {
    id: 'studio.teamMembers.refreshBeforeInvite',
    defaultMessage: 'Refresh team details before creating another invitation.',
    description:
      'Form error when an earlier change still needs its refresh before inviting again.',
  },
  waitForChange: {
    id: 'studio.teamMembers.waitForChange',
    defaultMessage: 'Wait for the current team change to finish.',
    description: 'Form error when another team change is still in flight.',
  },
  inviteUnconfirmedNotRefreshed: {
    id: 'studio.teamMembers.inviteUnconfirmedNotRefreshed',
    defaultMessage:
      'Studio could not confirm the invitation, and team details could not be refreshed.',
    description:
      'Shown when creating an invitation may or may not have landed and team details could not be re-read either.',
  },
  inviteUnconfirmedRefreshed: {
    id: 'studio.teamMembers.inviteUnconfirmedRefreshed',
    defaultMessage:
      'Studio could not confirm the invitation. Pending invitations were refreshed; check the list before trying again.',
    description:
      'Form error when creating an invitation may or may not have landed but the list was re-read.',
  },
  inviteRetryAfterRefresh: {
    id: 'studio.teamMembers.inviteRetryAfterRefresh',
    defaultMessage:
      'Refresh team details before trying to create another invitation.',
    description:
      'Form error when the invitation outcome is unknown and a refresh is needed first.',
  },
  invitationCreated: {
    id: 'studio.teamMembers.invitationCreated',
    defaultMessage: 'Invitation created for {email}. Email delivery is queued.',
    description:
      'Confirmation after creating an invitation; {email} is the invited address.',
  },
  invitationCreatedNotRefreshed: {
    id: 'studio.teamMembers.invitationCreatedNotRefreshed',
    defaultMessage:
      'Invitation created for {email}. Email delivery is queued, but pending invitations could not be refreshed.',
    description:
      'Shown when creating landed but the invitation list could not be re-read; {email} is the invited address.',
  },
  invitationCreatedRecovered: {
    id: 'studio.teamMembers.invitationCreatedRecovered',
    defaultMessage: 'Invitation created for {email}. Team details refreshed.',
    description:
      'Shown after a later refresh succeeded following a created invitation; {email} is the invited address.',
  },
  inviteEmailLabel: {
    id: 'studio.teamMembers.inviteEmailLabel',
    defaultMessage: 'Email address',
    description: "Label of the invitation form's email field.",
  },
  inviteEmailHint: {
    id: 'studio.teamMembers.inviteEmailHint',
    defaultMessage: 'The email address of the person you want to invite.',
    description:
      "Hint under the invitation form's email field when the value is not a valid address.",
  },
  inviteRoleLabel: {
    id: 'studio.teamMembers.inviteRoleLabel',
    defaultMessage: 'Team role',
    description: "Label of the invitation form's role selector.",
  },
  inviteSubmit: {
    id: 'studio.teamMembers.inviteSubmit',
    defaultMessage: 'Invite user',
    description: 'Submit button of the invitation form.',
  },
  onlyAdminsInvite: {
    id: 'studio.teamMembers.onlyAdminsInvite',
    defaultMessage:
      'Only team owners and admins can invite people or change roles.',
    description:
      'Shown in place of the invitation form to a member who may not invite.',
  },
  noPendingInvitations: {
    id: 'studio.teamMembers.noPendingInvitations',
    defaultMessage: 'No pending invitations.',
    description: 'Shown when the team has no outstanding invitations.',
  },
  expiresColumn: {
    id: 'studio.teamMembers.expiresColumn',
    defaultMessage: 'Expires',
    description:
      'Invitation table column heading: when the invitation expires.',
  },
  actionsColumn: {
    id: 'studio.teamMembers.actionsColumn',
    defaultMessage: 'Actions',
    description: 'Invitation table column heading for the cancel action.',
  },
  cancelInvitationFor: {
    id: 'studio.teamMembers.cancelInvitationFor',
    defaultMessage: 'Cancel invitation for {email}',
    description:
      "Accessible name of an invitation row's cancel button; {email} is the invited address.",
  },
});

function isTeamRole(value: unknown): value is TeamRole {
  return TEAM_ROLES.some((role) => role === value);
}

export default function TeamMembers({ teamId }: { teamId: string }) {
  const intl = useAppIntl();
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const refetchActiveTeam = activeTeam.refetch;
  const refetchActiveMember = activeMember.refetch;
  const [retrying, setRetrying] = useState(false);

  const team = activeTeam.data?.id === teamId ? activeTeam.data : undefined;
  const membershipMatchesTeam =
    activeMember.data?.organizationId === teamId && team !== undefined;
  const accessUnavailable =
    Boolean(activeTeam.error || activeMember.error) && !membershipMatchesTeam;

  const retryTeamAccess = async () => {
    setRetrying(true);
    try {
      await refetchActiveTeam();
      await refetchActiveMember();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.intro)}
        </Paragraph>
      </div>

      {accessUnavailable ? (
        <Surface spacing="lg">
          <Alert variant="destructive">
            {intl.formatMessage(messages.accessUnavailable)}
          </Alert>
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            disabled={retrying}
            onClick={() => void retryTeamAccess()}
          >
            {intl.formatMessage(messages.retryAccess)}
          </Button>
        </Surface>
      ) : membershipMatchesTeam ? (
        <Surface spacing="lg">
          <TeamManagement
            key={teamId}
            team={team}
            activeMemberId={activeMember.data?.id}
            activeMemberRole={activeMember.data?.role}
          />
        </Surface>
      ) : (
        <Surface spacing="lg">
          <div className="flex items-center gap-3" role="status">
            <Spinner size="sm" />
            <Paragraph margin="none">
              {intl.formatMessage(messages.loadingAccess)}
            </Paragraph>
          </div>
        </Surface>
      )}
    </div>
  );
}

function TeamManagement(props: {
  team: NonNullable<
    ReturnType<typeof authClient.useActiveOrganization>['data']
  >;
  activeMemberId: string | undefined;
  activeMemberRole: string | undefined;
}) {
  const intl = useAppIntl();
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const refreshTeamState = useTeamStateRefresh(activeTeam, activeMember);
  const team =
    activeTeam.data?.id === props.team.id ? activeTeam.data : props.team;
  const [mutationPending, setMutationPending] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [cancellingInvitationId, setCancellingInvitationId] = useState<
    string | null
  >(null);
  const [inviteFormKey, setInviteFormKey] = useState(0);
  const [refreshRecovery, setRefreshRecovery] = useState<
    TeamRefreshRecovery | undefined
  >();
  const [refreshingTeamDetails, setRefreshingTeamDetails] = useState(false);
  const mutationPendingRef = useRef(false);
  const inviteFormRef = useRef<HTMLFormElement>(null);
  const focusClearedInviteFormRef = useRef(false);
  const [message, setMessage] = useState<
    { kind: 'success' | 'error'; text: string } | undefined
  >();
  const canManage = canManageTeam(props.activeMemberRole);
  const canAssignOwner = teamRoles(props.activeMemberRole).includes('owner');
  // Rebuilt per render so the labels follow the active locale; the role list
  // itself is the contract's constant.
  const teamRoleOptions = TEAM_ROLES.map((role) => ({
    value: role,
    label: roleLabel(intl, role),
  }));
  const assignableRoles = canAssignOwner
    ? teamRoleOptions
    : teamRoleOptions.filter((role) => role.value !== 'owner');
  const pendingInvitations = team.invitations.filter(
    (invitation) =>
      invitation.status === 'pending' &&
      invitation.expiresAt.getTime() > Date.now(),
  );

  const beginMutation = () => {
    if (mutationPendingRef.current) return false;
    mutationPendingRef.current = true;
    setMutationPending(true);
    return true;
  };

  const finishMutation = () => {
    mutationPendingRef.current = false;
    setMutationPending(false);
  };

  useLayoutEffect(() => {
    if (!focusClearedInviteFormRef.current) return;
    focusClearedInviteFormRef.current = false;
    const email = inviteFormRef.current?.elements.namedItem('email');
    if (email instanceof HTMLInputElement) email.focus();
  }, [inviteFormKey]);

  const retryTeamRefresh = async () => {
    const recovery = refreshRecovery;
    if (!recovery) return;
    setRefreshingTeamDetails(true);
    if (await refreshTeamState()) {
      setRefreshRecovery(undefined);
      setMessage({ kind: 'success', text: recovery.recoveredText });
    }
    setRefreshingTeamDetails(false);
  };

  const updateRole = async (memberId: string, role: TeamRole) => {
    if (!beginMutation()) return;
    setUpdatingMemberId(memberId);
    setMessage(undefined);
    setRefreshRecovery(undefined);
    try {
      const outcome = await reconcileTeamMutation(
        () =>
          rpcClient.team.updateMemberRole({
            teamId: team.id,
            memberId,
            role,
          }),
        refreshTeamState,
      );
      if (outcome.commit === 'unknown') {
        if (outcome.refreshed) {
          setMessage({
            kind: 'error',
            text: intl.formatMessage(messages.roleChangeUnconfirmedRefreshed),
          });
        } else {
          setMessage({
            kind: 'error',
            text: intl.formatMessage(
              messages.roleChangeUnconfirmedNotRefreshed,
            ),
          });
          setRefreshRecovery({
            recoveredText: intl.formatMessage(messages.roleChangeRecovered),
          });
        }
        return;
      }

      if (outcome.refreshed) {
        setMessage({
          kind: 'success',
          text: intl.formatMessage(messages.roleUpdated),
        });
      } else {
        setMessage({
          kind: 'success',
          text: intl.formatMessage(messages.roleUpdatedNotRefreshed),
        });
        setRefreshRecovery({
          recoveredText: intl.formatMessage(messages.roleUpdatedRecovered),
        });
      }
    } finally {
      setUpdatingMemberId(null);
      finishMutation();
    }
  };

  const cancelInvitation = async (invitationId: string, email: string) => {
    if (!beginMutation()) return;
    setCancellingInvitationId(invitationId);
    setMessage(undefined);
    setRefreshRecovery(undefined);
    try {
      const outcome = await reconcileTeamMutation(
        () =>
          rpcClient.team.cancelInvitation({
            teamId: team.id,
            invitationId,
          }),
        refreshTeamState,
      );
      if (outcome.commit === 'unknown') {
        if (outcome.refreshed) {
          setMessage({
            kind: 'error',
            text: intl.formatMessage(
              messages.invitationCancelUnconfirmedRefreshed,
            ),
          });
        } else {
          setMessage({
            kind: 'error',
            text: intl.formatMessage(
              messages.invitationCancelUnconfirmedNotRefreshed,
            ),
          });
          setRefreshRecovery({
            recoveredText: intl.formatMessage(
              messages.invitationCancelRecovered,
            ),
          });
        }
        return;
      }

      if (outcome.refreshed) {
        setMessage({
          kind: 'success',
          text: intl.formatMessage(messages.invitationCancelled, { email }),
        });
      } else {
        setMessage({
          kind: 'success',
          text: intl.formatMessage(messages.invitationCancelledNotRefreshed, {
            email,
          }),
        });
        setRefreshRecovery({
          recoveredText: intl.formatMessage(
            messages.invitationCancelledRecovered,
            { email },
          ),
        });
      }
    } finally {
      setCancellingInvitationId(null);
      finishMutation();
    }
  };

  const teamMutationBlocked =
    mutationPending ||
    updatingMemberId !== null ||
    cancellingInvitationId !== null ||
    refreshingTeamDetails ||
    refreshRecovery !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="members-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading id="members-heading" level="h2" margin="none">
              {intl.formatMessage(messages.membersHeading)}
            </Heading>
            <Paragraph className="text-sm" margin="none">
              {intl.formatMessage(messages.membersIntro)}
            </Paragraph>
          </div>
          <Badge variant="secondary">
            {intl.formatMessage(messages.memberCount, {
              count: team.members.length,
            })}
          </Badge>
        </div>

        {message && (
          <Alert
            className="mt-4"
            variant={message.kind === 'error' ? 'destructive' : 'default'}
          >
            <span role="status">{message.text}</span>
            {refreshRecovery && (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                disabled={refreshingTeamDetails}
                onClick={() => void retryTeamRefresh()}
              >
                {intl.formatMessage(messages.refreshTeamDetails)}
              </Button>
            )}
          </Alert>
        )}

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{intl.formatMessage(messages.nameColumn)}</TableHead>
                <TableHead>
                  {intl.formatMessage(messages.emailColumn)}
                </TableHead>
                <TableHead>{intl.formatMessage(messages.roleColumn)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.members.map((member) => {
                const name = member.user.name || member.user.email;
                const roles = teamRoles(member.role);
                const editableRole =
                  roles.length === 1 && isTeamRole(roles[0])
                    ? roles[0]
                    : undefined;
                const memberIsOwner = roles.includes('owner');
                const canEditRole =
                  editableRole !== undefined &&
                  canManage &&
                  (canAssignOwner || !memberIsOwner);
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      {name}
                      {member.id === props.activeMemberId && (
                        <span className="ms-2 text-sm opacity-70">
                          {intl.formatMessage(messages.you)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{member.user.email}</TableCell>
                    <TableCell>
                      {canEditRole ? (
                        <>
                          <label
                            className="sr-only"
                            htmlFor={`member-role-${member.id}`}
                          >
                            {intl.formatMessage(messages.roleFor, { name })}
                          </label>
                          <NativeSelectField
                            id={`member-role-${member.id}`}
                            name={`member-role-${member.id}`}
                            size="sm"
                            value={editableRole}
                            options={assignableRoles}
                            disabled={teamMutationBlocked}
                            onChange={(value) => {
                              if (!isTeamRole(value)) {
                                setMessage({
                                  kind: 'error',
                                  text: intl.formatMessage(
                                    messages.unsupportedRole,
                                  ),
                                });
                                return;
                              }
                              void updateRole(member.id, value);
                            }}
                          />
                        </>
                      ) : (
                        <Badge variant="outline">
                          {teamRolesLabel(intl, member.role)}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="invitations-heading">
        <Heading id="invitations-heading" level="h2" margin="none">
          {intl.formatMessage(messages.invitationsHeading)}
        </Heading>
        <Paragraph className="text-sm" margin="none">
          {intl.formatMessage(messages.invitationsIntro)}
        </Paragraph>

        {canManage ? (
          <Form
            key={inviteFormKey}
            ref={inviteFormRef}
            className="tablet-portrait:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_auto] mt-4 grid items-end gap-4"
            onSubmit={async (values) => {
              const email =
                typeof values.email === 'string' ? values.email : '';
              const role = values.role;
              if (!isTeamRole(role)) {
                return {
                  success: false,
                  formErrors: [intl.formatMessage(messages.chooseValidRole)],
                };
              }
              if (refreshRecovery) {
                return {
                  success: false,
                  formErrors: [
                    intl.formatMessage(messages.refreshBeforeInvite),
                  ],
                };
              }
              if (!beginMutation()) {
                return {
                  success: false,
                  formErrors: [intl.formatMessage(messages.waitForChange)],
                };
              }
              setMessage(undefined);
              try {
                const outcome = await reconcileTeamMutation(
                  () =>
                    rpcClient.team.createInvitation({
                      teamId: team.id,
                      email,
                      role,
                    }),
                  refreshTeamState,
                );
                if (outcome.commit === 'unknown') {
                  if (!outcome.refreshed) {
                    setMessage({
                      kind: 'error',
                      text: intl.formatMessage(
                        messages.inviteUnconfirmedNotRefreshed,
                      ),
                    });
                    setRefreshRecovery({
                      recoveredText: intl.formatMessage(
                        messages.invitationCancelRecovered,
                      ),
                    });
                  }
                  return {
                    success: false,
                    formErrors: [
                      intl.formatMessage(
                        outcome.refreshed
                          ? messages.inviteUnconfirmedRefreshed
                          : messages.inviteRetryAfterRefresh,
                      ),
                    ],
                  };
                }

                if (outcome.refreshed) {
                  setMessage({
                    kind: 'success',
                    text: intl.formatMessage(messages.invitationCreated, {
                      email,
                    }),
                  });
                } else {
                  setMessage({
                    kind: 'success',
                    text: intl.formatMessage(
                      messages.invitationCreatedNotRefreshed,
                      { email },
                    ),
                  });
                  setRefreshRecovery({
                    recoveredText: intl.formatMessage(
                      messages.invitationCreatedRecovered,
                      { email },
                    ),
                  });
                }
                focusClearedInviteFormRef.current = true;
                setInviteFormKey((key) => key + 1);
                return { success: true };
              } finally {
                finishMutation();
              }
            }}
          >
            <Field
              name="email"
              label={intl.formatMessage(messages.inviteEmailLabel)}
              component={InputField}
              type="email"
              autoComplete="email"
              required
              pattern={studioEmailPattern(
                intl,
                intl.formatMessage(messages.inviteEmailHint),
              )}
            />
            <Field
              name="role"
              label={intl.formatMessage(messages.inviteRoleLabel)}
              component={NativeSelectField}
              options={assignableRoles}
              initialValue="member"
              required
            />
            <SubmitButton disabled={teamMutationBlocked}>
              {intl.formatMessage(messages.inviteSubmit)}
            </SubmitButton>
          </Form>
        ) : (
          <Alert className="mt-4">
            {intl.formatMessage(messages.onlyAdminsInvite)}
          </Alert>
        )}

        {pendingInvitations.length === 0 ? (
          <Paragraph className="mt-4">
            {intl.formatMessage(messages.noPendingInvitations)}
          </Paragraph>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>
                  {intl.formatMessage(messages.emailColumn)}
                </TableHead>
                <TableHead>{intl.formatMessage(messages.roleColumn)}</TableHead>
                <TableHead>
                  {intl.formatMessage(messages.expiresColumn)}
                </TableHead>
                {canManage && (
                  <TableHead>
                    {intl.formatMessage(messages.actionsColumn)}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{teamRolesLabel(intl, invitation.role)}</TableCell>
                  <TableCell>{intl.formatDate(invitation.expiresAt)}</TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="text"
                        color="destructive"
                        aria-label={intl.formatMessage(
                          messages.cancelInvitationFor,
                          { email: invitation.email },
                        )}
                        disabled={teamMutationBlocked}
                        onClick={() =>
                          void cancelInvitation(invitation.id, invitation.email)
                        }
                      >
                        {intl.formatMessage(commonMessages.cancel)}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
