import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Redacted } from 'effect';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import StudioLocaleSwitcher from '../i18n/StudioLocaleSwitcher.tsx';
import { rpcQuery } from '../runtime/rpc.ts';
import NoTeamSignOut from '../shell/NoTeamSignOut.tsx';
import UpdateNotice from '../shell/UpdateNotice.tsx';
import { useCreateTeam } from '../shell/useCreateTeam.tsx';

const messages = defineMessages({
  heading: {
    id: 'studio.noTeam.heading',
    defaultMessage: 'No team yet',
    description: 'Heading of the screen at /no-team.',
  },
  intro: {
    id: 'studio.noTeam.intro',
    defaultMessage:
      'You do not belong to any team yet. Studies in Studio belong to a team, so you need one before you can start.',
    description:
      'Introduction on the screen shown to a signed-in researcher who belongs to no team.',
  },
  createIntro: {
    id: 'studio.noTeam.createIntro',
    defaultMessage:
      'Create a team of your own. You will be its owner, and can invite others once it exists.',
    description:
      'Shown on /no-team to a researcher who is allowed to create a team, above the button that does it.',
  },
  createTeam: {
    id: 'studio.noTeam.createTeam',
    defaultMessage: 'Create a team',
    description: 'Button or link on /no-team that starts creating a new team.',
  },
  ownerOnly: {
    id: 'studio.noTeam.ownerOnly',
    defaultMessage:
      'On this Studio instance, only its owner can create teams, so a team owner or admin has to invite you.',
    description:
      'Shown on /no-team of a self-hosted instance to a researcher who is not allowed to create a team.',
  },
  invitationWithEmail: {
    id: 'studio.noTeam.invitationWithEmail',
    defaultMessage:
      'To join an existing team, ask one of its owners or admins to invite {email}. The invitation email has a link that adds you to the team.',
    description:
      'Explains on /no-team how to join a team by invitation; {email} is the address the researcher is signed in with.',
  },
  invitation: {
    id: 'studio.noTeam.invitation',
    defaultMessage:
      'To join an existing team, ask one of its owners or admins to invite the email address you signed in with. The invitation email has a link that adds you to the team.',
    description:
      'Explains on /no-team how to join a team by invitation, while the signed-in address is not yet known.',
  },
});

/**
 * Every redirect a teamless session can trigger ends here, and no screen it
 * can reach carries the account menu or the account area. So besides the way
 * forward, it owns the sign-out, the language choice, and the update notice
 * that the app shell carries everywhere else (#1901).
 */
export default function NoTeam() {
  const intl = useAppIntl();
  const status = useQuery(rpcQuery('status', undefined));
  const me = useQuery(rpcQuery('me', undefined));
  const createTeam = useCreateTeam();

  const mode = status.data?.deployment.mode;
  const canCreateTeam = me.data?.canCreateTeam;

  let creation;
  if (mode === 'managed') {
    creation = (
      <Button asChild color="primary">
        <Link to="/sign-up/team">
          {intl.formatMessage(messages.createTeam)}
        </Link>
      </Button>
    );
  } else if (mode === 'self-hosted' && canCreateTeam === true) {
    creation = (
      <Button color="primary" onClick={() => void createTeam()}>
        {intl.formatMessage(messages.createTeam)}
      </Button>
    );
  }

  return (
    <main
      id="main-content"
      className="flex h-full items-center justify-center p-4"
    >
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <UpdateNotice className="m-0" />
        <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
        {creation !== undefined && (
          <>
            <Paragraph>{intl.formatMessage(messages.createIntro)}</Paragraph>
            {creation}
          </>
        )}
        {mode === 'self-hosted' && canCreateTeam === false && (
          <Paragraph>{intl.formatMessage(messages.ownerOnly)}</Paragraph>
        )}
        <Paragraph>
          {me.data
            ? intl.formatMessage(messages.invitationWithEmail, {
                email: Redacted.value(me.data.email),
              })
            : intl.formatMessage(messages.invitation)}
        </Paragraph>
        <NoTeamSignOut />
        <StudioLocaleSwitcher />
      </Surface>
    </main>
  );
}
