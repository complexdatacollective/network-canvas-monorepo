import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import StudioLocaleSwitcher from '../i18n/StudioLocaleSwitcher.tsx';
import NoTeamSignOut from '../shell/NoTeamSignOut.tsx';
import {
  createTeamMessages,
  TeamNameField,
  useTeamCreation,
} from '../shell/useCreateTeam.tsx';

const messages = defineMessages({
  heading: {
    id: 'studio.signUpTeam.heading',
    defaultMessage: 'Name your team',
    description:
      'Heading of the team creation step of sign-up, at /sign-up/team.',
  },
  intro: {
    id: 'studio.signUpTeam.intro',
    defaultMessage:
      'Studies in Studio belong to a team. Name yours to start building studies.',
    description:
      'Introduction on the team creation step of sign-up, explaining why a team is needed.',
  },
  invited: {
    id: 'studio.signUpTeam.invited',
    defaultMessage:
      'Joining a colleague’s team instead? Open the link in the invitation email they sent you.',
    description:
      'Shown on the team creation step of sign-up for researchers who were invited to an existing team.',
  },
});

export default function SignUpTeam() {
  const intl = useAppIntl();
  const { create, openTeam } = useTeamCreation();

  return (
    <main
      id="main-content"
      className="flex h-full items-center justify-center p-4"
    >
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
        <Paragraph>
          {intl.formatMessage(createTeamMessages.description)}
        </Paragraph>
        <Form
          onSubmit={async (values) => {
            const outcome = await create(values);
            if (outcome.teamId !== undefined) await openTeam(outcome.teamId);
            return outcome.result;
          }}
        >
          <TeamNameField />
          <SubmitButton>
            {intl.formatMessage(createTeamMessages.submit)}
          </SubmitButton>
        </Form>
        <Paragraph intent="smallText">
          {intl.formatMessage(messages.invited)}
        </Paragraph>
        <NoTeamSignOut />
        <StudioLocaleSwitcher />
      </Surface>
    </main>
  );
}
