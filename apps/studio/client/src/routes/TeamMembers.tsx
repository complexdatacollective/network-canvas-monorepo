import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';

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

const TEAM_ROLE_OPTIONS = TEAM_ROLES.map((role) => ({
  value: role,
  label: roleLabel(role),
}));

function isTeamRole(value: unknown): value is TeamRole {
  return TEAM_ROLES.some((role) => role === value);
}

export default function TeamMembers({ teamId }: { teamId: string }) {
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
          Members
        </Heading>
        <Paragraph margin="none">
          Who belongs to this team, and which invitations are still outstanding.
        </Paragraph>
      </div>

      {accessUnavailable ? (
        <Surface spacing="lg">
          <Alert variant="destructive">
            Studio could not load this team and your access to it.
          </Alert>
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            disabled={retrying}
            onClick={() => void retryTeamAccess()}
          >
            Retry team access
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
            <Paragraph margin="none">Loading team access…</Paragraph>
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
  const assignableRoles = canAssignOwner
    ? TEAM_ROLE_OPTIONS
    : TEAM_ROLE_OPTIONS.filter((role) => role.value !== 'owner');
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
            text: 'Studio could not confirm whether the team role changed. Team details were refreshed; review the current role before making another change.',
          });
        } else {
          setMessage({
            kind: 'error',
            text: 'Studio could not confirm whether the team role changed, and team details could not be refreshed. Refresh them before making another change.',
          });
          setRefreshRecovery({
            recoveredText:
              'Team details refreshed. Review the current role before making another change.',
          });
        }
        return;
      }

      if (outcome.refreshed) {
        setMessage({ kind: 'success', text: 'Team role updated.' });
      } else {
        setMessage({
          kind: 'success',
          text: 'Team role updated, but the latest team details could not be refreshed.',
        });
        setRefreshRecovery({
          recoveredText: 'Team role updated. Team details refreshed.',
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
            text: 'Studio could not confirm whether the invitation was cancelled. Team details were refreshed; check the pending invitations before trying again.',
          });
        } else {
          setMessage({
            kind: 'error',
            text: 'Studio could not confirm whether the invitation was cancelled, and team details could not be refreshed. Refresh them before trying again.',
          });
          setRefreshRecovery({
            recoveredText:
              'Team details refreshed. Check the pending invitations before trying again.',
          });
        }
        return;
      }

      if (outcome.refreshed) {
        setMessage({
          kind: 'success',
          text: `Invitation cancelled for ${email}.`,
        });
      } else {
        setMessage({
          kind: 'success',
          text: `Invitation cancelled for ${email}, but pending invitations could not be refreshed.`,
        });
        setRefreshRecovery({
          recoveredText: `Invitation cancelled for ${email}. Team details refreshed.`,
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
              Team members
            </Heading>
            <Paragraph className="text-sm" margin="none">
              View who can access this team and the role assigned to each
              person.
            </Paragraph>
          </div>
          <Badge variant="secondary">
            {team.members.length}{' '}
            {team.members.length === 1 ? 'member' : 'members'}
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
                Refresh team details
              </Button>
            )}
          </Alert>
        )}

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
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
                        <span className="ml-2 text-sm opacity-70">(you)</span>
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
                            Role for {name}
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
                                  text: 'Studio received an unsupported team role.',
                                });
                                return;
                              }
                              void updateRole(member.id, value);
                            }}
                          />
                        </>
                      ) : (
                        <Badge variant="outline">
                          {teamRolesLabel(member.role)}
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
          Invitations
        </Heading>
        <Paragraph className="text-sm" margin="none">
          Invite a collaborator and choose the role they will receive when they
          join.
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
                  formErrors: ['Choose a valid role for this invitation.'],
                };
              }
              if (refreshRecovery) {
                return {
                  success: false,
                  formErrors: [
                    'Refresh team details before creating another invitation.',
                  ],
                };
              }
              if (!beginMutation()) {
                return {
                  success: false,
                  formErrors: ['Wait for the current team change to finish.'],
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
                      text: 'Studio could not confirm the invitation, and team details could not be refreshed.',
                    });
                    setRefreshRecovery({
                      recoveredText:
                        'Team details refreshed. Check the pending invitations before trying again.',
                    });
                  }
                  return {
                    success: false,
                    formErrors: [
                      outcome.refreshed
                        ? 'Studio could not confirm the invitation. Pending invitations were refreshed; check the list before trying again.'
                        : 'Refresh team details before trying to create another invitation.',
                    ],
                  };
                }

                if (outcome.refreshed) {
                  setMessage({
                    kind: 'success',
                    text: `Invitation created for ${email}. Email delivery is queued.`,
                  });
                } else {
                  setMessage({
                    kind: 'success',
                    text: `Invitation created for ${email}. Email delivery is queued, but pending invitations could not be refreshed.`,
                  });
                  setRefreshRecovery({
                    recoveredText: `Invitation created for ${email}. Team details refreshed.`,
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
              label="Email address"
              component={InputField}
              type="email"
              autoComplete="email"
              required
              pattern={studioEmailPattern(
                'The email address of the person you want to invite.',
              )}
            />
            <Field
              name="role"
              label="Team role"
              component={NativeSelectField}
              options={assignableRoles}
              initialValue="member"
              required
            />
            <SubmitButton disabled={teamMutationBlocked}>
              Invite user
            </SubmitButton>
          </Form>
        ) : (
          <Alert className="mt-4">
            Only team owners and admins can invite people or change roles.
          </Alert>
        )}

        {pendingInvitations.length === 0 ? (
          <Paragraph className="mt-4">No pending invitations.</Paragraph>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{teamRolesLabel(invitation.role)}</TableCell>
                  <TableCell>
                    {invitation.expiresAt.toLocaleDateString()}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="text"
                        color="destructive"
                        aria-label={`Cancel invitation for ${invitation.email}`}
                        disabled={teamMutationBlocked}
                        onClick={() =>
                          void cancelInvitation(invitation.id, invitation.email)
                        }
                      >
                        Cancel
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
