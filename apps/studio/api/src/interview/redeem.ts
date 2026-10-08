import { Clock, Effect, Option, type Redacted } from 'effect';

import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import { LinkUnavailable } from '@codaco/studio-contract/schema/participant';

import { auditedAs, changed } from '../audit/audited.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { presentedTokenTeamAccess } from './access.ts';
import { participantAuditActor } from './actor.ts';
import { redemptionRefusal } from './availability.ts';
import {
  findLinkByTokenHash,
  findOrCreateSession,
  issueSessionToken,
  recordRedemption,
  reopenAbandonedSession,
} from './store.ts';
import { mintSessionToken, parsePresentedToken } from './token.ts';

export const redeemLink = Effect.fn('interview.redeemLink')(function* (
  linkToken: Redacted.Redacted,
  clientAddress: Redacted.Redacted,
) {
  yield* enforceRateLimit('participant_redeem_address', clientAddress);
  const presented = parsePresentedToken(linkToken);
  if (Option.isNone(presented)) return yield* new Unauthorized({});
  const { teamId, secretHash } = presented.value;
  const now = new Date(yield* Clock.currentTimeMillis);

  return yield* auditedAs(
    'participant.redeem',
    presentedTokenTeamAccess(teamId),
    Effect.gen(function* () {
      const link = yield* findLinkByTokenHash(secretHash);
      if (link === null) return yield* new Unauthorized({});
      if (link.participantId !== null) {
        yield* enforceRateLimit('participant_redeem_link', link.linkId);
      }
      const refusal = redemptionRefusal(link, now);
      if (refusal !== null) {
        return yield* new LinkUnavailable({ state: refusal });
      }
      const protocolVersionId = link.protocolVersionId;
      if (protocolVersionId === null) {
        return yield* new LinkUnavailable({ state: 'not_open' });
      }

      const opened = yield* findOrCreateSession({
        linkId: link.linkId,
        studyId: link.studyId,
        waveId: link.waveId,
        participantId: link.participantId,
        protocolVersionId,
      });
      if (opened.status === 'completed') {
        return yield* new LinkUnavailable({ state: 'finished' });
      }
      if (opened.status === 'abandoned') {
        yield* reopenAbandonedSession(opened.sessionId);
      }

      const minted = mintSessionToken(teamId);
      if (!(yield* issueSessionToken(opened.sessionId, minted.secretHash))) {
        return yield* Effect.die(
          new Error(`session ${opened.sessionId} refused its token`),
        );
      }
      yield* recordRedemption(link.linkId);

      return {
        actor: participantAuditActor(opened.sessionId, link.participantCode),
        result: changed(
          {
            sessionToken: minted.token,
            sessionId: opened.sessionId,
            anonymous: link.participantId === null,
          },
          [
            {
              eventType: 'interview.started',
              eventVersion: 1,
              category: 'participant_data',
              subjectType: link.participantId === null ? null : 'participant',
              subjectId: link.participantId,
              subjectLabel: link.participantCode,
              resourceType: 'interview_session',
              resourceId: opened.sessionId,
              resourceLabel: null,
              details: {
                studyId: link.studyId,
                waveId: link.waveId,
                resumed: !opened.created,
              },
            },
          ],
        ),
      };
    }),
  ).pipe(Effect.catchTag('NotFound', () => Effect.fail(new Unauthorized({}))));
});
