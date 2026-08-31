import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { createUuid } from '../lib/createUuid.ts';
import { studioEmailPattern } from '../lib/emailValidation.ts';

type Team = NonNullable<
  ReturnType<typeof authClient.useListOrganizations>['data']
>[number];

const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
type TeamRole = (typeof TEAM_ROLES)[number];
type ProtocolCreationAttempt = {
  teamId: string;
  name: string;
  protocolId: string;
  draftId: string;
};
const TEAM_ROLE_OPTIONS = TEAM_ROLES.map((role) => ({
  value: role,
  label: roleLabel(role),
}));

function isTeamRole(value: unknown): value is TeamRole {
  return TEAM_ROLES.some((role) => role === value);
}

function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
    default:
      return role;
  }
}

function teamRoles(role: string | undefined): string[] {
  return (
    role
      ?.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '') ?? []
  );
}

function teamRolesLabel(role: string): string {
  const roles = teamRoles(role);
  return roles.length === 0
    ? 'Unassigned'
    : roles.map((entry) => roleLabel(entry)).join(', ');
}

function canManageTeam(role: string | undefined): boolean {
  return teamRoles(role).some(
    (entry) => entry === 'owner' || entry === 'admin',
  );
}

export default function TeamWorkspace(props: { teams: readonly Team[] }) {
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const refetchActiveTeam = activeTeam.refetch;
  const refetchActiveMember = activeMember.refetch;
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null);
  const [retryingActiveTeam, setRetryingActiveTeam] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const [creatingProtocolTeamId, setCreatingProtocolTeamId] = useState<
    string | null
  >(null);
  const [mutatingTeamId, setMutatingTeamId] = useState<string | null>(null);
  const protocolCreationAttempts = useRef(
    new Map<string, ProtocolCreationAttempt>(),
  );

  const switchToTeam = useCallback(
    async (teamId: string) => {
      setSwitchingTeamId(teamId);
      setSwitchError(false);
      let switchFailed = false;
      try {
        const result = await authClient.organization.setActive(
          { organizationId: teamId },
          // Better Auth otherwise schedules its own delayed active-team
          // refresh. Studio reconciles both access queries below, so suppress
          // that overlapping request and keep one authoritative refresh path.
          { disableSignal: true },
        );
        switchFailed = result.error !== null;
      } catch {
        switchFailed = true;
      } finally {
        const reconciliation = await Promise.allSettled([
          refetchActiveTeam(),
          refetchActiveMember(),
        ]);
        if (reconciliation.some((result) => result.status === 'rejected')) {
          switchFailed = true;
        }
        setSwitchError(switchFailed);
        setSwitchingTeamId(null);
      }
    },
    [refetchActiveMember, refetchActiveTeam],
  );

  const activeTeamId = activeTeam.data?.id;
  const activeTeamIdRef = useRef(activeTeamId);
  useLayoutEffect(() => {
    activeTeamIdRef.current = activeTeamId;
  }, [activeTeamId]);
  const selectedTeam = props.teams.find((team) => team.id === activeTeamId);
  const membershipMatchesTeam =
    selectedTeam !== undefined &&
    activeMember.data?.organizationId === selectedTeam.id;
  const activeTeamLoadError = activeTeam.error || activeMember.error;
  const activeTeamAccessPending =
    activeTeam.isPending ||
    activeMember.isPending ||
    activeTeam.isRefetching ||
    activeMember.isRefetching;
  const protocolCreationPending = creatingProtocolTeamId !== null;
  const teamMutationPending = mutatingTeamId !== null;

  const setProtocolCreationPending = useCallback(
    (teamId: string, pending: boolean) => {
      setCreatingProtocolTeamId((currentTeamId) => {
        if (pending) return teamId;
        return currentTeamId === teamId ? null : currentTeamId;
      });
    },
    [],
  );

  const setTeamMutationPending = useCallback(
    (teamId: string, pending: boolean) => {
      setMutatingTeamId((currentTeamId) => {
        if (pending) return teamId;
        return currentTeamId === teamId ? null : currentTeamId;
      });
    },
    [],
  );

  const isTeamStillActive = useCallback(
    (teamId: string) => activeTeamIdRef.current === teamId,
    [],
  );

  const retryActiveTeam = async () => {
    setRetryingActiveTeam(true);
    setSwitchError(false);
    try {
      await refetchActiveTeam();
      await refetchActiveMember();
    } catch {
      setSwitchError(true);
    } finally {
      setRetryingActiveTeam(false);
    }
  };

  useEffect(() => {
    const firstTeam = props.teams[0];
    if (
      firstTeam !== undefined &&
      selectedTeam === undefined &&
      !activeTeamAccessPending &&
      switchingTeamId === null &&
      !activeTeam.error &&
      !switchError
    ) {
      void switchToTeam(firstTeam.id);
    }
  }, [
    activeTeam.error,
    activeTeamAccessPending,
    props.teams,
    selectedTeam,
    switchError,
    switchToTeam,
    switchingTeamId,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Surface spacing="lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-64 flex-1">
            <label
              className="font-heading block font-bold"
              htmlFor="active-team"
            >
              Active team
            </label>
            <NativeSelectField
              id="active-team"
              name="active-team"
              className="mt-2 max-w-xl"
              value={selectedTeam?.id ?? ''}
              placeholder="Choose a team…"
              options={props.teams.map((team) => ({
                value: team.id,
                label: team.name,
              }))}
              disabled={
                activeTeamAccessPending ||
                switchingTeamId !== null ||
                retryingActiveTeam ||
                protocolCreationPending ||
                teamMutationPending
              }
              onChange={(value) => {
                const teamId = String(value);
                if (teamId !== '') void switchToTeam(teamId);
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            {selectedTeam && <Badge>Currently active</Badge>}
            {(activeTeamAccessPending ||
              switchingTeamId !== null ||
              retryingActiveTeam ||
              protocolCreationPending ||
              teamMutationPending) && <Spinner size="sm" />}
          </div>
        </div>
        {switchError && (
          <Alert className="mt-4" variant="destructive">
            Studio could not switch teams. Try again.
          </Alert>
        )}
      </Surface>

      {activeTeamLoadError ? (
        <Surface spacing="lg">
          <Alert variant="destructive">
            Studio could not load the active team and your access to it.
          </Alert>
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            disabled={retryingActiveTeam}
            onClick={() => void retryActiveTeam()}
          >
            Retry team access
          </Button>
        </Surface>
      ) : selectedTeam && activeTeam.data && membershipMatchesTeam ? (
        <ActiveTeamWorkspace
          key={selectedTeam.id}
          team={activeTeam.data}
          activeMemberId={activeMember.data?.id}
          activeMemberRole={activeMember.data?.role}
          creationAttempts={protocolCreationAttempts.current}
          protocolCreationPending={protocolCreationPending}
          setProtocolCreationPending={setProtocolCreationPending}
          teamMutationPending={teamMutationPending}
          setTeamMutationPending={setTeamMutationPending}
          isTeamStillActive={isTeamStillActive}
        />
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

function ActiveTeamWorkspace(props: {
  team: NonNullable<
    ReturnType<typeof authClient.useActiveOrganization>['data']
  >;
  activeMemberId: string | undefined;
  activeMemberRole: string | undefined;
  creationAttempts: Map<string, ProtocolCreationAttempt>;
  protocolCreationPending: boolean;
  setProtocolCreationPending: (teamId: string, pending: boolean) => void;
  teamMutationPending: boolean;
  setTeamMutationPending: (teamId: string, pending: boolean) => void;
  isTeamStillActive: (teamId: string) => boolean;
}) {
  const teamId = props.team.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const protocols = useQuery(
    orpc.protocols.list.queryOptions({ input: { teamId } }),
  );
  const createProtocol = useMutation(
    orpc.protocols.create.mutationOptions({
      onSuccess: async (created, variables) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.protocols.list.key({
            input: { teamId: variables.teamId },
          }),
        });
        if (!props.isTeamStillActive(variables.teamId)) return;
        await navigate({
          to: '/teams/$teamId/protocols/$protocolId/drafts/$draftId',
          params: {
            teamId: variables.teamId,
            protocolId: created.protocolId,
            draftId: created.draftId,
          },
        });
      },
    }),
  );

  return (
    <>
      <Surface spacing="lg">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="protocols-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Heading id="protocols-heading" level="h2" margin="none">
                  {props.team.name} protocols
                </Heading>
                <Paragraph className="text-sm" margin="none">
                  Protocols belong to the currently active team.
                </Paragraph>
              </div>
              {protocols.isPending && <Spinner size="sm" />}
            </div>
            {protocols.isError && (
              <Alert className="mt-4" variant="destructive">
                Protocols could not be loaded. Try again.
              </Alert>
            )}
            {protocols.data?.length === 0 && (
              <Paragraph>
                No protocols have been created for this team.
              </Paragraph>
            )}
            {protocols.data && protocols.data.length > 0 && (
              <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
                {protocols.data.map((protocol) => (
                  <li key={protocol.id}>
                    {protocol.draftId === null ? (
                      <div className="bg-surface-1 text-surface-1-contrast elevation-low block rounded p-4 opacity-70">
                        <span className="font-heading block font-bold">
                          {protocol.name}
                        </span>
                        <span className="text-sm">No editable draft</span>
                      </div>
                    ) : (
                      <Link
                        className="focusable bg-surface-1 text-surface-1-contrast elevation-low hover:elevation-medium block rounded p-4 no-underline"
                        to="/teams/$teamId/protocols/$protocolId/drafts/$draftId"
                        params={{
                          teamId,
                          protocolId: protocol.id,
                          draftId: protocol.draftId,
                        }}
                      >
                        <span className="font-heading block font-bold">
                          {protocol.name}
                        </span>
                        <span className="text-sm">
                          Created {protocol.createdAt.toLocaleDateString()}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="new-protocol-heading">
            <Heading id="new-protocol-heading" level="h2">
              New protocol
            </Heading>
            <Form
              className="mt-4 max-w-xl"
              onSubmit={async (values) => {
                const name = typeof values.name === 'string' ? values.name : '';
                const previousAttempt = props.creationAttempts.get(teamId);
                const attempt =
                  previousAttempt?.name === name
                    ? previousAttempt
                    : {
                        teamId,
                        name,
                        protocolId: createUuid(),
                        draftId: createUuid(),
                      };
                props.creationAttempts.set(teamId, attempt);
                props.setProtocolCreationPending(teamId, true);
                try {
                  await createProtocol.mutateAsync(attempt);
                  if (props.creationAttempts.get(teamId) === attempt) {
                    props.creationAttempts.delete(teamId);
                  }
                  return { success: true };
                } catch {
                  return {
                    success: false,
                    formErrors: [
                      'The protocol could not be created. Wait a moment and try again.',
                    ],
                  };
                } finally {
                  props.setProtocolCreationPending(teamId, false);
                }
              }}
            >
              <Field
                name="name"
                label="Protocol name"
                component={InputField}
                required
              />
              <SubmitButton disabled={props.protocolCreationPending}>
                Create protocol
              </SubmitButton>
            </Form>
          </section>
        </div>
      </Surface>

      <TeamManagement
        team={props.team}
        activeMemberId={props.activeMemberId}
        activeMemberRole={props.activeMemberRole}
        mutationPending={props.teamMutationPending}
        setMutationPending={props.setTeamMutationPending}
      />
    </>
  );
}

function TeamManagement(props: {
  team: NonNullable<
    ReturnType<typeof authClient.useActiveOrganization>['data']
  >;
  activeMemberId: string | undefined;
  activeMemberRole: string | undefined;
  mutationPending: boolean;
  setMutationPending: (teamId: string, pending: boolean) => void;
}) {
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const [inviteFormKey, setInviteFormKey] = useState(0);
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
  const pendingInvitations = props.team.invitations.filter(
    (invitation) =>
      invitation.status === 'pending' &&
      invitation.expiresAt.getTime() > Date.now(),
  );

  const beginMutation = () => {
    if (mutationPendingRef.current) return false;
    mutationPendingRef.current = true;
    props.setMutationPending(props.team.id, true);
    return true;
  };

  const finishMutation = () => {
    mutationPendingRef.current = false;
    props.setMutationPending(props.team.id, false);
  };

  useLayoutEffect(() => {
    if (!focusClearedInviteFormRef.current) return;
    focusClearedInviteFormRef.current = false;
    const email = inviteFormRef.current?.elements.namedItem('email');
    if (email instanceof HTMLInputElement) email.focus();
  }, [inviteFormKey]);

  const reconcileInvitations = async () => {
    try {
      await activeTeam.refetch();
    } catch {
      // Preserve the original invitation failure when reconciliation also
      // fails. The next active-team refresh can still recover the list.
    }
  };

  const reconcileRoleChange = async () => {
    await Promise.allSettled([activeTeam.refetch(), activeMember.refetch()]);
  };

  const updateRole = async (memberId: string, role: TeamRole) => {
    if (!beginMutation()) return;
    setMessage(undefined);
    try {
      const result = await authClient.organization.updateMemberRole({
        memberId,
        role,
        organizationId: props.team.id,
      });
      await reconcileRoleChange();
      if (result.error) {
        setMessage({
          kind: 'error',
          text: 'The team role could not be changed. Check that the team still has an owner, then try again.',
        });
      } else {
        setMessage({ kind: 'success', text: 'Team role updated.' });
      }
    } catch {
      await reconcileRoleChange();
      setMessage({
        kind: 'error',
        text: 'The team role could not be changed. Try again.',
      });
    } finally {
      finishMutation();
    }
  };

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
            {props.team.members.length}{' '}
            {props.team.members.length === 1 ? 'member' : 'members'}
          </Badge>
        </div>

        {message && (
          <Alert
            className="mt-4"
            variant={message.kind === 'error' ? 'destructive' : 'default'}
          >
            <span role="status">{message.text}</span>
          </Alert>
        )}

        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.team.members.map((member) => {
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
                          disabled={props.mutationPending}
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
            className="mt-4 grid items-end gap-4 md:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_auto]"
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
              if (!beginMutation()) {
                return {
                  success: false,
                  formErrors: ['Wait for the current team change to finish.'],
                };
              }
              setMessage(undefined);
              try {
                const result = await authClient.organization.inviteMember({
                  email,
                  role,
                  organizationId: props.team.id,
                });
                if (result.error) {
                  await reconcileInvitations();
                  return {
                    success: false,
                    formErrors: [
                      'Studio could not confirm the invitation. Pending invitations were refreshed; check the list before trying again.',
                    ],
                  };
                }
                await activeTeam.refetch();
                setMessage({
                  kind: 'success',
                  text: `Invitation created for ${email}.`,
                });
                focusClearedInviteFormRef.current = true;
                setInviteFormKey((key) => key + 1);
                return { success: true };
              } catch {
                await reconcileInvitations();
                return {
                  success: false,
                  formErrors: [
                    'Studio could not confirm the invitation. Pending invitations were refreshed; check the list before trying again.',
                  ],
                };
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
            <SubmitButton disabled={props.mutationPending}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
