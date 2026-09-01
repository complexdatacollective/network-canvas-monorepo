import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { TeamInvitationIdSchema, type TeamRole } from '@codaco/studio-rpc';

import { rpcClient } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';

function roleLabel(role: TeamRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
  }
  return role;
}

type AcceptedInvitation = Awaited<
  ReturnType<typeof rpcClient.team.acceptInvitation>
>;

export default function AcceptInvitation(props: { invitationId: string }) {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null);
  const [activationFailed, setActivationFailed] = useState(false);
  const [error, setError] = useState<'accept' | 'signOut' | null>(null);
  const invitationId = TeamInvitationIdSchema.safeParse(props.invitationId);

  const useDifferentAccount = async () => {
    if (!invitationId.success) return;
    setSwitchingAccount(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError('signOut');
        return;
      }
      queryClient.clear();
      await navigate({
        to: '/sign-in',
        search: { invitationId: invitationId.data },
      });
    } catch {
      setError('signOut');
    } finally {
      setSwitchingAccount(false);
    }
  };

  const accept = async () => {
    if (!invitationId.success) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await rpcClient.team.acceptInvitation({
        invitationId: invitationId.data,
      });
      setAccepted(result);
      try {
        const active = await authClient.organization.setActive({
          organizationId: result.teamId,
        });
        setActivationFailed(Boolean(active.error));
      } catch {
        setActivationFailed(true);
      }
    } catch {
      setError('accept');
    } finally {
      setAccepting(false);
    }
  };

  return (
    // Every route in §5.2 renders exactly one `<main id="main-content">`
    // (§11.2). A focused screen has no area layout to own that landmark, so
    // it owns its own.
    <main
      id="main-content"
      className="flex h-full items-center justify-center p-4"
    >
      <Surface className="max-w-xl" spacing="lg">
        {!invitationId.success ? (
          <>
            <Heading level="h1">Invitation unavailable</Heading>
            <Alert variant="destructive">
              This invitation link is not valid. Ask the team owner for a new
              invitation.
            </Alert>
          </>
        ) : session.isPending ? (
          <div className="flex items-center gap-3" role="status">
            <Spinner size="sm" />
            <Paragraph margin="none">Checking your account…</Paragraph>
          </div>
        ) : session.error ? (
          <>
            <Heading level="h1">Invitation unavailable</Heading>
            <Alert variant="destructive">
              Studio could not check your account. Wait a moment and try again.
            </Alert>
          </>
        ) : accepted ? (
          <>
            <Heading level="h1">Invitation accepted</Heading>
            <Paragraph role="status">
              You joined {accepted.teamName} as {roleLabel(accepted.role)}.
            </Paragraph>
            {activationFailed && (
              <Alert>
                The team was joined, but Studio could not make it active. You
                can select it from the team list.
              </Alert>
            )}
            <Button asChild>
              {/*
                The accepted team, not `/`: an invitation is team-scoped and
                carries no study target, so §10.2's landing resolution with
                that team pinned is its studies list. `/` is marketing.
              */}
              <Link to="/team/$teamId" params={{ teamId: accepted.teamId }}>
                Open team
              </Link>
            </Button>
          </>
        ) : !session.data ? (
          <>
            <Heading level="h1">Accept team invitation</Heading>
            <Paragraph>
              Sign in with the email address that received this invitation. You
              will review it before joining the team.
            </Paragraph>
            <Button asChild>
              <Link to="/sign-in" search={{ invitationId: invitationId.data }}>
                Sign in to continue
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Heading level="h1">Accept team invitation</Heading>
            <Paragraph>
              Signed in as {session.data.user.email}. Joining gives this team
              access according to the role chosen by its owner.
            </Paragraph>
            {error === 'accept' && (
              <Alert variant="destructive">
                This invitation is not available for the signed-in account. It
                may have expired, been cancelled, or been sent to a different
                email address.
              </Alert>
            )}
            {error === 'signOut' && (
              <Alert variant="destructive">
                Studio could not sign out. Wait a moment and try again.
              </Alert>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={accepting || switchingAccount}
                aria-busy={accepting}
                icon={accepting ? <Spinner size="xs" /> : undefined}
                onClick={() => void accept()}
              >
                Join team
              </Button>
              <Button
                variant="outline"
                disabled={accepting || switchingAccount}
                aria-busy={switchingAccount}
                onClick={() => void useDifferentAccount()}
              >
                Use a different account
              </Button>
            </div>
          </>
        )}
      </Surface>
    </main>
  );
}
