'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { logout } from '~/actions/auth';
import SubmitButton from '~/components/SubmitButton';

const messages = defineMessages({
  signOut: {
    id: 'fresco.UserMenu.signOut',
    defaultMessage: 'Sign out',
    description:
      'Button in the dashboard header that signs the researcher out of Fresco. A verb, not a status.',
  },
});

const UserMenu = () => {
  const intl = useAppIntl();

  return (
    <form action={() => void logout()}>
      <SubmitButton color="secondary" type="submit">
        {intl.formatMessage(messages.signOut)}
      </SubmitButton>
    </form>
  );
};

export default UserMenu;
