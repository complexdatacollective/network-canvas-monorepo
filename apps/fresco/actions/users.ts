'use server';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { createAuthSchemas } from '~/schemas/auth';
import { createUsersSchemas } from '~/schemas/users';
import { hashPassword, verifyPassword } from '~/utils/password';

const messages = defineMessages({
  copyInvalidFormData: {
    id: 'fresco.actions.users.copyInvalidFormData',
    defaultMessage: 'Invalid form data',
    description: 'Researcher-facing actions / users: Invalid form data',
  },
  copyFailedToCreateUserUsernameMayAlready: {
    id: 'fresco.actions.users.copyFailedToCreateUserUsernameMayAlready',
    defaultMessage: 'Failed to create user. Username may already exist.',
    description:
      'Researcher-facing actions / users: Failed to create user. Username may already exist.',
  },
  copyInvalidData: {
    id: 'fresco.actions.users.copyInvalidData',
    defaultMessage: 'Invalid data',
    description: 'Researcher-facing actions / users: Invalid data',
  },
  copyNoValidUsersToDelete: {
    id: 'fresco.actions.users.copyNoValidUsersToDelete',
    defaultMessage: 'No valid users to delete',
    description: 'Researcher-facing actions / users: No valid users to delete',
  },
  copyCannotDeleteAllUsersAtLeastOne: {
    id: 'fresco.actions.users.copyCannotDeleteAllUsersAtLeastOne',
    defaultMessage: 'Cannot delete all users. At least one user must remain.',
    description:
      'Researcher-facing actions / users: Cannot delete all users. At least one user must remain.',
  },
  copyFailedToDeleteUsers: {
    id: 'fresco.actions.users.copyFailedToDeleteUsers',
    defaultMessage: 'Failed to delete users',
    description: 'Researcher-facing actions / users: Failed to delete users',
  },
  copyCurrentPasswordIsIncorrect: {
    id: 'fresco.actions.users.copyCurrentPasswordIsIncorrect',
    defaultMessage: 'Current password is incorrect',
    description:
      'Researcher-facing actions / users: Current password is incorrect',
  },
  copyFailedToUpdatePassword: {
    id: 'fresco.actions.users.copyFailedToUpdatePassword',
    defaultMessage: 'Failed to update password',
    description: 'Researcher-facing actions / users: Failed to update password',
  },
});

export async function createUser(data: unknown) {
  const { createUserSchema } = createAuthSchemas(createMessageError);

  const session = await requireApiAuth();

  const parsedData = createUserSchema.safeParse(data);

  if (!parsedData.success) {
    return {
      error: createMessageError(messages.copyInvalidFormData),
      data: null,
    };
  }

  const { username, password } = parsedData.data;

  try {
    const hashedPassword = await hashPassword(password);

    await prisma.user.create({
      data: {
        username,
        key: {
          create: {
            id: `username:${username}`,
            hashed_password: hashedPassword,
          },
        },
      },
    });

    void addEvent(
      'User Created',
      `User ${session.user.username} created user: ${username}`,
      {
        kind: 'userCreated',
        values: { username: session.user.username, target: username },
      },
    );
    safeUpdateTag('getUsers');
    safeUpdateTag('activityFeed');

    return { error: null, data: { username } };
  } catch (_error) {
    return {
      error: createMessageError(
        messages.copyFailedToCreateUserUsernameMayAlready,
      ),
      data: null,
    };
  }
}

export async function checkUsernameAvailable(
  username: string,
): Promise<{ available: boolean }> {
  await requireApiAuth();

  if (!username || username.length < 4 || username.includes(' ')) {
    return { available: false };
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  return { available: !existingUser };
}

export async function deleteUsers(data: unknown) {
  const { deleteUsersSchema } = createUsersSchemas(createMessageError);

  const session = await requireApiAuth();

  const parsedData = deleteUsersSchema.safeParse(data);

  if (!parsedData.success) {
    return {
      error: createMessageError(messages.copyInvalidData),
      data: null,
    };
  }

  const { ids } = parsedData.data;

  // Filter out current user from deletion
  const idsToDelete = ids.filter((id) => id !== session.user.userId);

  if (idsToDelete.length === 0) {
    return {
      error: createMessageError(messages.copyNoValidUsersToDelete),
      data: null,
    };
  }

  // Check if this would delete all users
  const userCount = await prisma.user.count();
  if (userCount - idsToDelete.length < 1) {
    return {
      error: createMessageError(messages.copyCannotDeleteAllUsersAtLeastOne),
      data: null,
    };
  }

  try {
    const usersToDelete = await prisma.user.findMany({
      where: { id: { in: idsToDelete } },
      select: { id: true, username: true },
    });

    // Cascade delete handles sessions and keys via Prisma schema
    await prisma.user.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    const deletedIds = usersToDelete.map((u) => u.id);
    const usernames = usersToDelete.map((u) => u.username).join(', ');
    void addEvent(
      'User Deleted',
      `User ${session.user.username} deleted user(s): ${usernames}`,
      {
        kind: 'usersDeleted',
        values: {
          username: session.user.username,
          count: usersToDelete.length,
          users: usersToDelete.map((user) => user.username),
        },
      },
    );
    safeUpdateTag('getUsers');
    safeUpdateTag('activityFeed');

    return { error: null, data: { deletedIds } };
  } catch (_error) {
    return {
      error: createMessageError(messages.copyFailedToDeleteUsers),
      data: null,
    };
  }
}

export async function changePassword(data: unknown) {
  const { changePasswordSchema } = createUsersSchemas(createMessageError);

  const session = await requireApiAuth();

  const parsedData = changePasswordSchema.safeParse(data);

  if (!parsedData.success) {
    const errors = parsedData.error.flatten();
    return {
      error:
        errors.fieldErrors.newPassword?.[0] ??
        createMessageError(messages.copyInvalidData),
      data: null,
    };
  }

  const { currentPassword, newPassword } = parsedData.data;

  try {
    const key = await prisma.key.findUnique({
      where: { id: `username:${session.user.username}` },
    });

    if (!key?.hashed_password) {
      return {
        error: createMessageError(messages.copyCurrentPasswordIsIncorrect),
        data: null,
      };
    }

    const valid = await verifyPassword(currentPassword, key.hashed_password);
    if (!valid) {
      return {
        error: createMessageError(messages.copyCurrentPasswordIsIncorrect),
        data: null,
      };
    }
  } catch (_error) {
    return {
      error: createMessageError(messages.copyCurrentPasswordIsIncorrect),
      data: null,
    };
  }

  try {
    const newHash = await hashPassword(newPassword);

    await prisma.key.update({
      where: { id: `username:${session.user.username}` },
      data: { hashed_password: newHash },
    });

    void addEvent(
      'Password Changed',
      `User ${session.user.username} changed their password`,
      { kind: 'passwordChanged', values: { username: session.user.username } },
    );
    safeUpdateTag('activityFeed');

    return { error: null, data: { success: true } };
  } catch (_error) {
    return {
      error: createMessageError(messages.copyFailedToUpdatePassword),
      data: null,
    };
  }
}
