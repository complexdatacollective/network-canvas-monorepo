import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { TeamInvitationIdSchema } from '@codaco/studio-rpc';

import { rpcClient } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { invalidateMemberships } from '../lib/landing.ts';
import { roleLabel } from '../lib/teamRoles.ts';

/**
 * This screen's `<h1>`, in whichever of its five states is showing.
 *
 * Every route's heading is its landing point (§7.2), and this route arrives at
 * one of five mutually exclusive headings — the last of them only after the
 * session read resolves, which is the late arrival `RouteFocus` watches for.
 * Written once so a sixth state cannot be added without it.
 */
function ScreenHeading({ children }: { children: ReactNode }) {
  return (
    <Heading level="h1" {...routeFocusTargetProps}>
      {children}
    </Heading>
  );
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
      try {
        const active = await authClient.organization.setActive({
          organizationId: result.teamId,
        });
        setActivationFailed(Boolean(active.error));
      } catch {
        setActivationFailed(true);
      }
      // The researcher's memberships have just changed, and §6.4's landing
      // resolution answers from a cache that was filled before they did —
      // for a teamless session, with an empty list that stays fresh for
      // thirty seconds. Both the app shell's guard and `/no-team`'s read that
      // same cache, so without this the "Open team" link below enters the
      // shell, is told the researcher belongs to no team, and is sent
      // straight back to `/no-team`, which agrees.
      //
      // Before the link is offered rather than after, because the link is the
      // navigation that would read it. A cache that could not be marked stale
      // is not a failed acceptance, so it cannot become the error below: the
      // researcher is in the team either way.
      await invalidateMemberships(queryClient).catch(() => undefined);
      setAccepted(result);
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
            <ScreenHeading>Invitation unavailable</ScreenHeading>
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
            <ScreenHeading>Invitation unavailable</ScreenHeading>
            <Alert variant="destructive">
              Studio could not check your account. Wait a moment and try again.
            </Alert>
          </>
        ) : accepted ? (
          <>
            <ScreenHeading>Invitation accepted</ScreenHeading>
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
            <ScreenHeading>Accept team invitation</ScreenHeading>
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
            <ScreenHeading>Accept team invitation</ScreenHeading>
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
