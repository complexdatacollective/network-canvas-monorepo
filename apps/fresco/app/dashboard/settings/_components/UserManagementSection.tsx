import { defineMessages } from '@codaco/app-i18n/messages';
import SettingsCard from '~/components/settings/SettingsCard';
import { env } from '~/env';
import { getServerIntl } from '~/i18n/server';
import { prisma } from '~/lib/db';
import { getUsers } from '~/queries/users';

import UserManagement from './UserManagement';

const messages = defineMessages({
  userManagement: {
    id: 'fresco.settings.UserManagementSection.userManagement',
    defaultMessage: 'User Management',
    description:
      'Researcher-facing settings / UserManagementSection: User Management',
  },
});

async function getHasTwoFactor(userId: string) {
  const result = await prisma.totpCredential.findFirst({
    where: { user_id: userId, verified: true },
    select: { id: true },
  });

  return !!result;
}

async function getPasskeys(userId: string) {
  return prisma.webAuthnCredential.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      friendlyName: true,
      deviceType: true,
      createdAt: true,
      lastUsedAt: true,
      backedUp: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function getHasPassword(userId: string) {
  const key = await prisma.key.findFirst({
    where: { user_id: userId },
    select: { hashed_password: true },
  });

  return !!key?.hashed_password;
}

export default async function UserManagementSection({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const intl = await getServerIntl();

  const usersPromise = getUsers();
  const hasTwoFactorPromise = getHasTwoFactor(userId);
  const passkeysPromise = getPasskeys(userId);
  const hasPasswordPromise = getHasPassword(userId);

  return (
    <SettingsCard
      id="user-management"
      title={intl.formatMessage(messages.userManagement)}
    >
      <UserManagement
        usersPromise={usersPromise}
        hasTwoFactorPromise={hasTwoFactorPromise}
        currentUserId={userId}
        currentUsername={username}
        passkeysPromise={passkeysPromise}
        hasPasswordPromise={hasPasswordPromise}
        sandboxMode={!!env.SANDBOX_MODE}
      />
    </SettingsCard>
  );
}
