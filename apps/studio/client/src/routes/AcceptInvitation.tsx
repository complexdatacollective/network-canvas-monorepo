import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

const messages = defineMessages({
  unavailableHeading: {
    id: 'studio.invitation.unavailableHeading',
    defaultMessage: 'Invitation unavailable',
    description:
      'Heading of the invitation screen when the invitation cannot be shown.',
  },
  invalidLink: {
    id: 'studio.invitation.invalidLink',
    defaultMessage:
      'This invitation link is not valid. Ask the team owner for a new invitation.',
    description:
      'Shown when the invitation link the researcher followed is malformed.',
  },
  checkingAccount: {
    id: 'studio.invitation.checkingAccount',
    defaultMessage: 'Checking your account…',
    description:
      'Shown while the invitation screen resolves whether the visitor is signed in.',
  },
  accountCheckFailed: {
    id: 'studio.invitation.accountCheckFailed',
    defaultMessage:
      'Studio could not check your account. Wait a moment and try again.',
    description:
      'Shown when the invitation screen could not read the session at all.',
  },
  acceptedHeading: {
    id: 'studio.invitation.acceptedHeading',
    defaultMessage: 'Invitation accepted',
    description: 'Heading of the invitation screen after joining the team.',
  },
  joined: {
    id: 'studio.invitation.joined',
    defaultMessage: 'You joined {teamName} as {role}.',
    description:
      "Confirmation after joining a team; {teamName} is the team's name and {role} the granted role (Owner, Admin or Member).",
  },
  activationFailed: {
    id: 'studio.invitation.activationFailed',
    defaultMessage:
      'The team was joined, but Studio could not make it active. You can select it from the team list.',
    description:
      'Shown when joining succeeded but making the new team the active one failed.',
  },
  openTeam: {
    id: 'studio.invitation.openTeam',
    defaultMessage: 'Open team',
    description: 'Button opening the team the researcher just joined.',
  },
  acceptHeading: {
    id: 'studio.invitation.acceptHeading',
    defaultMessage: 'Accept team invitation',
    description:
      'Heading of the invitation screen while the invitation is still open.',
  },
  signInPrompt: {
    id: 'studio.invitation.signInPrompt',
    defaultMessage:
      'Sign in with the email address that received this invitation. You will review it before joining the team.',
    description: 'Shown to a signed-out visitor holding an invitation link.',
  },
  signInToContinue: {
    id: 'studio.invitation.signInToContinue',
    defaultMessage: 'Sign in to continue',
    description:
      'Button sending a signed-out invitation holder to the sign-in screen.',
  },
  signedInAs: {
    id: 'studio.invitation.signedInAs',
    defaultMessage:
      'Signed in as {email}. Joining gives this team access according to the role chosen by its owner.',
    description:
      "What accepting will do; {email} is the signed-in account's address.",
  },
  acceptFailed: {
    id: 'studio.invitation.acceptFailed',
    defaultMessage:
      'This invitation is not available for the signed-in account. It may have expired, been cancelled, or been sent to a different email address.',
    description: 'Shown when accepting the invitation was refused.',
  },
  signOutFailed: {
    id: 'studio.invitation.signOutFailed',
    defaultMessage: 'Studio could not sign out. Wait a moment and try again.',
    description:
      'Shown when switching to a different account failed because sign-out failed.',
  },
  joinTeam: {
    id: 'studio.invitation.joinTeam',
    defaultMessage: 'Join team',
    description: 'Button accepting the team invitation.',
  },
  useDifferentAccount: {
    id: 'studio.invitation.useDifferentAccount',
    defaultMessage: 'Use a different account',
    description:
      'Button signing out so the invitation can be accepted from another account.',
  },
});

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
  const intl = useAppIntl();
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
            <ScreenHeading>
              {intl.formatMessage(messages.unavailableHeading)}
            </ScreenHeading>
            <Alert variant="destructive">
              {intl.formatMessage(messages.invalidLink)}
            </Alert>
          </>
        ) : session.isPending ? (
          <div className="flex items-center gap-3" role="status">
            <Spinner size="sm" />
            <Paragraph margin="none">
              {intl.formatMessage(messages.checkingAccount)}
            </Paragraph>
          </div>
        ) : session.error ? (
          <>
            <ScreenHeading>
              {intl.formatMessage(messages.unavailableHeading)}
            </ScreenHeading>
            <Alert variant="destructive">
              {intl.formatMessage(messages.accountCheckFailed)}
            </Alert>
          </>
        ) : accepted ? (
          <>
            <ScreenHeading>
              {intl.formatMessage(messages.acceptedHeading)}
            </ScreenHeading>
            <Paragraph role="status">
              {intl.formatMessage(messages.joined, {
                teamName: accepted.teamName,
                role: roleLabel(intl, accepted.role),
              })}
            </Paragraph>
            {activationFailed && (
              <Alert>{intl.formatMessage(messages.activationFailed)}</Alert>
            )}
            <Button asChild>
              {/*
                The accepted team, not `/`: an invitation is team-scoped and
                carries no study target, so §10.2's landing resolution with
                that team pinned is its studies list. `/` is marketing.
              */}
              <Link to="/team/$teamId" params={{ teamId: accepted.teamId }}>
                {intl.formatMessage(messages.openTeam)}
              </Link>
            </Button>
          </>
        ) : !session.data ? (
          <>
            <ScreenHeading>
              {intl.formatMessage(messages.acceptHeading)}
            </ScreenHeading>
            <Paragraph>{intl.formatMessage(messages.signInPrompt)}</Paragraph>
            <Button asChild>
              <Link to="/sign-in" search={{ invitationId: invitationId.data }}>
                {intl.formatMessage(messages.signInToContinue)}
              </Link>
            </Button>
          </>
        ) : (
          <>
            <ScreenHeading>
              {intl.formatMessage(messages.acceptHeading)}
            </ScreenHeading>
            <Paragraph>
              {intl.formatMessage(messages.signedInAs, {
                email: session.data.user.email,
              })}
            </Paragraph>
            {error === 'accept' && (
              <Alert variant="destructive">
                {intl.formatMessage(messages.acceptFailed)}
              </Alert>
            )}
            {error === 'signOut' && (
              <Alert variant="destructive">
                {intl.formatMessage(messages.signOutFailed)}
              </Alert>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={accepting || switchingAccount}
                aria-busy={accepting}
                icon={accepting ? <Spinner size="xs" /> : undefined}
                onClick={() => void accept()}
              >
                {intl.formatMessage(messages.joinTeam)}
              </Button>
              <Button
                variant="outline"
                disabled={accepting || switchingAccount}
                aria-busy={switchingAccount}
                onClick={() => void useDifferentAccount()}
              >
                {intl.formatMessage(messages.useDifferentAccount)}
              </Button>
            </div>
          </>
        )}
      </Surface>
    </main>
  );
}
