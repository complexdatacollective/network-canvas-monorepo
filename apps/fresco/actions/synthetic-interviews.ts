'use server';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';

const messages = defineMessages({
  copyFailedToDeleteSyntheticData: {
    id: 'fresco.actions.syntheticinterviews.copyFailedToDeleteSyntheticData',
    defaultMessage: 'Failed to delete synthetic data',
    description:
      'Researcher-facing actions / syntheticinterviews: Failed to delete synthetic data',
  },
});

export async function revalidateSyntheticData() {
  await requireApiAuth();

  safeUpdateTag([
    'getInterviews',
    'getParticipants',
    'interviewCount',
    'participantCount',
    'summaryStatistics',
    'activityFeed',
  ]);
}

export async function deleteSyntheticData() {
  const session = await requireApiAuth();

  try {
    const interviewCount = await prisma.interview.count({
      where: { isSynthetic: true },
    });
    const participantCount = await prisma.participant.count({
      where: { isSynthetic: true },
    });

    // Delete interviews first (foreign key constraint)
    await prisma.interview.deleteMany({
      where: { isSynthetic: true },
    });

    await prisma.participant.deleteMany({
      where: { isSynthetic: true },
    });

    safeUpdateTag([
      'getInterviews',
      'getParticipants',
      'interviewCount',
      'participantCount',
      'summaryStatistics',
      'activityFeed',
    ]);

    void addEvent(
      'Synthetic Data Deleted',
      `User ${session.user.username} deleted ${String(interviewCount)} synthetic interviews and ${String(participantCount)} test participants`,
      {
        kind: 'syntheticDeleted',
        values: {
          username: session.user.username,
          interviews: interviewCount,
          participants: participantCount,
        },
      },
    );

    return { error: null, deleted: { interviewCount, participantCount } };
  } catch (_error) {
    return {
      error: createMessageError(messages.copyFailedToDeleteSyntheticData),
      deleted: null,
    };
  }
}
