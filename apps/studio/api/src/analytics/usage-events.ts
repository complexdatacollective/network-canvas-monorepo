import { Effect, Schema } from 'effect';

import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';
import { type UsageEvent, UsageEventSchema } from '@codaco/studio-sync/jobs';

import { Jobs } from '../jobs/jobs.ts';
import {
  Analytics,
  type AnalyticsCapture,
  participantDistinctId,
} from '../platform/analytics.ts';
import { STUDIO_VERSION } from '../version.ts';

const STUDIO_APP = 'studio';
const STUDIO_APP_NAME = 'Network Canvas Studio';

const isDeclaredUsage = Schema.is(UsageEventSchema);

export const recordUsage = Effect.fnUntraced(function* (usage: UsageEvent) {
  const analytics = yield* Analytics;
  if (!analytics.enabled) return;
  const name = usage.event;
  if (!isDeclaredUsage(usage)) {
    return yield* Effect.logWarning(
      'A usage event did not fit its declaration and was not recorded',
    ).pipe(Effect.annotateLogs({ usage_event: name }));
  }
  const jobs = yield* Jobs;
  yield* jobs
    .enqueue('analytics-delivery', { usage })
    .pipe(Effect.catchTag('JobRefused', Effect.die));
});

const appProperties = {
  [POSTHOG_APP_PROPS.APP]: STUDIO_APP,
  [POSTHOG_APP_PROPS.APP_NAME]: STUDIO_APP_NAME,
  [POSTHOG_APP_PROPS.APP_VERSION]: STUDIO_VERSION,
  [POSTHOG_APP_PROPS.HOST_VERSION]: STUDIO_VERSION,
};

const researcherCapture = (
  usage: Extract<UsageEvent, { accountId: string }>,
  properties: Readonly<Record<string, unknown>>,
): AnalyticsCapture => ({
  event: usage.event,
  distinctId: usage.accountId,
  timestamp: new Date(usage.occurredAt).toISOString(),
  properties: { ...properties, ...appProperties },
  groups: 'teamId' in usage ? { team: usage.teamId } : undefined,
});

const interviewCapture = (
  usage: Extract<UsageEvent, { sessionId: string }>,
  installationId: string,
  properties: Readonly<Record<string, unknown>>,
): AnalyticsCapture => ({
  event: usage.event,
  distinctId: participantDistinctId(installationId, usage.sessionId),
  timestamp: new Date(usage.occurredAt).toISOString(),
  properties: {
    study_id: usage.studyId,
    wave_id: usage.waveId,
    ...properties,
    ...appProperties,
    $process_person_profile: false,
  },
  groups: { team: usage.teamId },
});

export const usageCapture = (
  usage: UsageEvent,
  installationId: string,
): AnalyticsCapture => {
  switch (usage.event) {
    case 'researcher_signed_up':
    case 'researcher_signed_in':
      return researcherCapture(usage, {});
    case 'team_invitation_sent':
    case 'team_invitation_accepted':
      return researcherCapture(usage, {
        invitation_id: usage.invitationId,
        role: usage.role,
      });
    case 'team_member_role_changed':
      return researcherCapture(usage, {
        member_id: usage.memberId,
        previous_roles: usage.previousRoles,
        new_roles: usage.newRoles,
      });
    case 'study_created':
      return researcherCapture(usage, {
        study_id: usage.studyId,
        protocol_id: usage.protocolId,
        participation_mode: usage.participationMode,
      });
    case 'protocol_created':
      return researcherCapture(usage, { protocol_id: usage.protocolId });
    case 'protocol_draft_committed':
      return researcherCapture(usage, {
        protocol_id: usage.protocolId,
        interface_types: usage.interfaceTypes,
        operation_count: usage.operationCount,
      });
    case 'interview_started':
      return interviewCapture(usage, installationId, {
        resumed: usage.resumed,
      });
    case 'interview_completed':
      return interviewCapture(usage, installationId, {
        node_count: usage.nodeCount,
        edge_count: usage.edgeCount,
      });
  }
};
