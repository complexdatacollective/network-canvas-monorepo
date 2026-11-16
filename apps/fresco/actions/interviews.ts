'use server';

import { createId } from '@paralleldrive/cuid2';
import { createInitialNetwork as createLegacyInitialNetwork } from 'fresco-schema-8/interview/contract';
import { after } from 'next/server';

import {
  createMessageError,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { createInitialNetwork } from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { ensureError } from '@codaco/shared-consts';
import type { InterviewsSearchParams } from '~/app/dashboard/_components/InterviewsTable/searchParams';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import { safeRevalidateTag, safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { Prisma } from '~/lib/db/generated/client';
import { parseStoredProtocol } from '~/lib/db/storedProtocol';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { parseLegacyStoredProtocol } from '~/lib/schema-8/storedProtocol';
import { isLegacySchemaVersion } from '~/lib/schema-8/version';
import { getAppSetting } from '~/queries/appSettings';
import { getInterviewIdsMatching } from '~/queries/interviews';
import type {
  CreateInterview,
  CreateInterviewResult,
  DeleteInterviews,
} from '~/schemas/interviews';
import { createParticipantSchemas } from '~/schemas/participant';

const messages = defineMessages({
  copyFailedToDeleteInterviews: {
    id: 'fresco.actions.interviews.copyFailedToDeleteInterviews',
    defaultMessage: 'Failed to delete interviews',
    description:
      'Error returned when deleting the selected interviews from the database fails. The delete confirmation dialog on the Interviews page does not currently display it.',
  },
  copyFailedToCommitExport: {
    id: 'fresco.actions.interviews.copyFailedToCommitExport',
    defaultMessage: 'Failed to commit export',
    description:
      'Error returned when marking interviews as exported fails after their data export has been downloaded. The researcher is not shown this wording; it is only the internal error text.',
  },
  copyFailedToResolveInterviews: {
    id: 'fresco.actions.interviews.copyFailedToResolveInterviews',
    defaultMessage: 'Failed to resolve interviews',
    description:
      'Error shown in a toast on the Interviews page when the list of interviews matching the current filter, or the details of the selected interviews, could not be loaded before an export, selection or deletion.',
  },
  copyFailedToLoadIncompleteInterviews: {
    id: 'fresco.actions.interviews.copyFailedToLoadIncompleteInterviews',
    defaultMessage: 'Failed to load incomplete interviews',
    description:
      'Error shown in a toast when the unfinished interviews of a protocol could not be loaded while generating their interview links for export.',
  },
  copyProtocolNotFound: {
    id: 'fresco.actions.interviews.copyProtocolNotFound',
    defaultMessage: 'Protocol not found',
    description:
      'Error returned when an interview cannot be started because the protocol no longer exists. Triggered by a participant opening an interview link; used internally, the participant sees a separate invalid-link page.',
  },
  copyProtocolIsStoredUnderASchemaVersion: {
    id: 'fresco.actions.interviews.copyProtocolIsStoredUnderASchemaVersion',
    defaultMessage:
      'Protocol is stored under a schema version this deployment cannot run. Repair it in Architect and upload it again.',
    description:
      'Error returned when an interview cannot be started because the stored protocol uses a schema version this installation cannot run. Architect is the protocol design app. Recorded internally; the participant sees a generic error page.',
  },
  copyProtocolCouldNotBeRead: {
    id: 'fresco.actions.interviews.copyProtocolCouldNotBeRead',
    defaultMessage:
      'This protocol could not be read, so interviews cannot be started with it.',
    description:
      'Error returned when an interview cannot be started because the stored protocol (its stages, codebook or experiments) is damaged and cannot be read. Recorded internally; the participant sees a generic error page.',
  },
  copyInvalidParticipantIdentifier: {
    id: 'fresco.actions.interviews.copyInvalidParticipantIdentifier',
    defaultMessage: 'Invalid participant identifier',
    description:
      'Error returned when an interview cannot be started because the participant identifier in the interview link is not valid (for example too long or only whitespace). Recorded internally; the participant sees a generic error page.',
  },
  copyAnonymousRecruitmentIsNotEnabled: {
    id: 'fresco.actions.interviews.copyAnonymousRecruitmentIsNotEnabled',
    defaultMessage: 'Anonymous recruitment is not enabled',
    description:
      'Error returned when an interview link carries no participant identifier but the installation does not allow anonymous recruitment. Recorded internally; the participant sees a separate page explaining this.',
  },
  copyAnonymousParticipant: {
    id: 'fresco.actions.interviews.copyAnonymousParticipant',
    defaultMessage: 'Anonymous Participant',
    description:
      'Label stored on the participant record created automatically when someone starts an interview without a participant identifier. The researcher sees it in the participants list and interview table.',
  },
  copyFailedToCreateInterview: {
    id: 'fresco.actions.interviews.copyFailedToCreateInterview',
    defaultMessage: 'Failed to create interview',
    description:
      'Error returned when an interview could not be created because of an unexpected failure. Recorded internally; the participant who opened the link sees a generic error page.',
  },
});

export async function deleteInterviews(data: DeleteInterviews) {
  const session = await requireApiAuth();

  const idsToDelete = data.map((p) => p.id);

  try {
    const deletedInterviews = await prisma.interview.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
      },
    });

    void addEvent(
      'Interview(s) Deleted',
      `User ${session.user.username} deleted ${deletedInterviews.count} interview(s)`,
      {
        kind: 'interviewsDeleted',
        values: {
          username: session.user.username,
          count: deletedInterviews.count,
        },
      },
    );

    safeUpdateTag('getInterviews');
    safeUpdateTag('summaryStatistics');
    safeUpdateTag('activityFeed');

    return { error: null, interview: deletedInterviews };
  } catch (error) {
    return {
      error: createMessageError(messages.copyFailedToDeleteInterviews),
      interview: null,
    };
  }
}

/**
 * Marks interviews exported after the browser has assembled and downloaded the
 * complete zip. This is the single commit point for a (possibly batched)
 * export: it sets exportTime, logs one activity event, and — because it is a
 * server action — triggers Next's route refresh via safeUpdateTag
 * (read-your-own-writes), so the interviews table shows the new status.
 */
export async function commitInterviewExport(interviewIds: string[]) {
  const session = await requireApiAuth();
  const ids = [...new Set(interviewIds)];
  if (ids.length === 0) {
    return { error: null, data: { count: 0 } };
  }

  try {
    const result = await prisma.interview.updateMany({
      where: { id: { in: ids } },
      data: { exportTime: new Date() },
    });
    await addEvent(
      'Data Exported',
      `User ${session.user.username} exported data for ${String(result.count)} interview(s)`,
      {
        kind: 'dataExported',
        values: { username: session.user.username, count: result.count },
      },
      { interviewCount: result.count },
    );
    safeUpdateTag('getInterviews');
    safeUpdateTag('activityFeed');
    return { error: null, data: { count: result.count } };
  } catch {
    return {
      error: createMessageError(messages.copyFailedToCommitExport),
      data: null,
    };
  }
}

export async function resolveInterviewIds(
  searchParams: InterviewsSearchParams,
  extra?: { onlyUnexported?: boolean; onlyCompleted?: boolean },
): Promise<{ error: string | null; ids: string[] }> {
  await requireApiAuth();
  try {
    const ids = await getInterviewIdsMatching(searchParams, extra);
    return { error: null, ids };
  } catch {
    return {
      error: createMessageError(messages.copyFailedToResolveInterviews),
      ids: [],
    };
  }
}

export async function getInterviewDeletionInfo(ids: string[]): Promise<{
  error: string | null;
  data: { id: string; exportTime: Date | null }[];
}> {
  await requireApiAuth();
  try {
    const uniqueIds = [...new Set(ids)];
    const interviews = await prisma.interview.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, exportTime: true },
    });
    return { error: null, data: interviews };
  } catch {
    return {
      error: createMessageError(messages.copyFailedToResolveInterviews),
      data: [],
    };
  }
}

export type IncompleteInterviewUrlData = {
  id: string;
  identifier: string;
};

/**
 * Returns the minimal data needed to build incomplete-interview URL CSVs for a
 * single protocol: the interview id (for the URL) and participant identifier.
 * Scoped to incomplete interviews (no finishTime) so the client no longer needs
 * the full interview list to generate these URLs.
 */
export async function getIncompleteInterviewUrlData(
  protocolId: string,
): Promise<{ error: string | null; data: IncompleteInterviewUrlData[] }> {
  await requireApiAuth();
  try {
    const interviews = await prisma.interview.findMany({
      where: { protocolId, finishTime: null },
      select: { id: true, participant: { select: { identifier: true } } },
    });
    return {
      error: null,
      data: interviews.map((interview) => ({
        id: interview.id,
        identifier: interview.participant.identifier,
      })),
    };
  } catch {
    return {
      error: createMessageError(messages.copyFailedToLoadIncompleteInterviews),
      data: [],
    };
  }
}

/**
 * Prisma raises P2025 when a nested `connect` cannot resolve the record it
 * points at. For `createInterview` that can only be the protocol connect, so
 * it means the protocol was deleted between the existence check below and the
 * write — the one gap that check cannot close on its own.
 */
function isMissingProtocol(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

export async function createInterview(
  data: CreateInterview,
): Promise<CreateInterviewResult> {
  // Participant onboarding remains independent of researcher locale until #1313.
  const intl = createAppIntl({ locale: 'en' });
  const { participantIdentifierSchema } = createParticipantSchemas(
    intl.formatMessage,
  );

  const { participantIdentifier, protocolId } = data;

  try {
    // A protocol that no longer exists is the whole answer: nothing else about
    // the request can be acted on, and reporting any other reason sends the
    // researcher after a fix that cannot help — enabling anonymous
    // recruitment, or correcting an identifier on a link that is dead either
    // way. So this precedes every other return, rather than being reached only
    // when nothing else fails first.
    const protocol = await prisma.protocol.findUnique({
      where: { id: protocolId },
      select: {
        id: true,
        schemaVersion: true,
        stages: true,
        codebook: true,
        localization: true,
        interfaceText: true,
        experiments: true,
      },
    });

    if (!protocol) {
      return {
        errorType: 'no-protocol',
        error: intl.formatMessage(messages.copyProtocolNotFound),
        createdInterviewId: null,
      };
    }

    // A schema 8 protocol is kept as it was imported and runs in the bundled
    // schema 8 interview; any other version than that or the runtime's cannot
    // run an interview at all, and the payload builders refuse it. Refuse
    // here, before anything is persisted, so a recruitment link to such a
    // protocol does not record a started-but-unusable interview per attempt.
    const legacy = isLegacySchemaVersion(protocol.schemaVersion);
    if (
      !legacy &&
      protocol.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION
    ) {
      return {
        errorType: 'incompatible-protocol',
        error: intl.formatMessage(
          messages.copyProtocolIsStoredUnderASchemaVersion,
        ),
        createdInterviewId: null,
      };
    }

    // Likewise a protocol whose stored design does not parse: the interview
    // page would refuse to start every interview created for it.
    const readable = legacy
      ? parseLegacyStoredProtocol(protocol).success
      : parseStoredProtocol(protocol).success;
    if (!readable) {
      return {
        errorType: 'incompatible-protocol',
        error: intl.formatMessage(messages.copyProtocolCouldNotBeRead),
        createdInterviewId: null,
      };
    }

    // The participant identifier may arrive unauthenticated via /onboard, so
    // validate it (length, trim, non-whitespace) before it is persisted and
    // later embedded in activity-feed messages and CSV exports.
    let validatedIdentifier: string | undefined;
    if (participantIdentifier !== undefined && participantIdentifier !== '') {
      const parsed = participantIdentifierSchema.safeParse(
        participantIdentifier,
      );
      if (!parsed.success) {
        return {
          errorType: 'invalid-identifier',
          error: intl.formatMessage(messages.copyInvalidParticipantIdentifier),
          createdInterviewId: null,
        };
      }
      validatedIdentifier = parsed.data;
    }

    if (!validatedIdentifier) {
      const allowAnonymousRecruitment = await getAppSetting(
        'allowAnonymousRecruitment',
      );
      if (!allowAnonymousRecruitment) {
        return {
          errorType: 'no-anonymous-recruitment',
          error: intl.formatMessage(
            messages.copyAnonymousRecruitmentIsNotEnabled,
          ),
          createdInterviewId: null,
        };
      }
    }

    /**
     * If a participant identifier is provided, we attempt to connect to an existing participant
     * or create a new one with that identifier. If no participant identifier is provided,
     * we create a new anonymous participant with a generated identifier.
     */
    const participantStatement = validatedIdentifier
      ? {
          connectOrCreate: {
            create: {
              identifier: validatedIdentifier,
            },
            where: {
              identifier: validatedIdentifier,
            },
          },
        }
      : {
          create: {
            identifier: `p-${createId()}`,
            label: intl.formatMessage(messages.copyAnonymousParticipant),
          },
        };

    const createdInterview = await prisma.interview.create({
      select: {
        participant: true,
        id: true,
      },
      data: {
        network: legacy ? createLegacyInitialNetwork() : createInitialNetwork(),
        participant: participantStatement,
        protocol: {
          connect: {
            id: protocolId,
          },
        },
      },
    });

    const { label, identifier } = createdInterview.participant;
    const participantDisplay = label ? `${label} (${identifier})` : identifier;

    // The deployment's one analytics event for a new interview.
    void addEvent(
      'Interview Started',
      `Participant "${participantDisplay}" started an interview`,
      { kind: 'interviewStarted', values: { participant: participantDisplay } },
      { usingAnonymousParticipant: !participantIdentifier },
    );

    /**
     * NOTE: this function is called from a route handler, so it has to use
     * revalidateTag rather than updateTag!
     */
    safeRevalidateTag('getInterviews');
    safeRevalidateTag('getParticipants');
    safeRevalidateTag('summaryStatistics');
    safeRevalidateTag('activityFeed');

    return {
      error: null,
      createdInterviewId: createdInterview.id,
      errorType: null,
      schemaVersion: protocol.schemaVersion,
    };
  } catch (error) {
    // A participant following a link to a protocol that no longer exists is an
    // expected outcome of an unauthenticated, user-supplied id — report it to
    // the caller so it can be explained, but never as an application exception.
    if (isMissingProtocol(error)) {
      return {
        errorType: 'no-protocol',
        error: intl.formatMessage(messages.copyProtocolNotFound),
        createdInterviewId: null,
      };
    }

    const e = ensureError(error);

    after(async () => {
      await captureException(e);
      await flushPostHog();
    });

    return {
      errorType: 'unknown',
      error: intl.formatMessage(messages.copyFailedToCreateInterview),
      createdInterviewId: null,
    };
  }
}
