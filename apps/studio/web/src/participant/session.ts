import { Option, Redacted, Schema } from 'effect';

import type {
  InterviewPayload,
  ProtocolPayload,
} from '@codaco/interview/contract';
import { NcNetworkSchema, StageMetadataSchema } from '@codaco/shared-consts';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import { LinkToken, SessionToken } from '@codaco/studio-contract/schema/ids';
import { SessionEnded } from '@codaco/studio-contract/schema/participant';

import { refusalOf } from '../runtime/errors.ts';
import { participantCall } from '../runtime/participantRpc.ts';
import { setParticipantSessionToken } from '../runtime/participantRuntime.ts';
import { pageHolderId } from './holder.ts';
import {
  forgetStoredSession,
  readStoredSession,
  storeSession,
} from './storedSessions.ts';

let holderId: string | undefined;

const refuseUnless = <A>(decoded: Option.Option<A>): A =>
  Option.getOrThrowWith(decoded, () => new Unauthorized({}));

const decodeLinkToken = Schema.decodeUnknownOption(LinkToken);
const decodeSessionToken = Schema.decodeUnknownOption(SessionToken);

const readSession = (sessionToken: SessionToken) => {
  setParticipantSessionToken(Redacted.value(sessionToken));
  holderId ??= pageHolderId();
  return participantCall('participant.session', { holderId });
};

let entered:
  | {
      readonly sessionToken: SessionToken;
      readonly loaded: Awaited<ReturnType<typeof readSession>>;
    }
  | undefined;

export const openSession = async (rawSessionToken: string) => {
  const sessionToken = refuseUnless(decodeSessionToken(rawSessionToken));
  const loaded =
    entered !== undefined &&
    Redacted.value(entered.sessionToken) === Redacted.value(sessionToken)
      ? entered.loaded
      : await readSession(sessionToken);
  entered = undefined;
  const protocol = Redacted.value(loaded.protocol) as ProtocolPayload;
  // Loaded with the interview runtime, which already depends on it, rather
  // than pulled into this module statically.
  const { getLocaleMetadata } = await import('@codaco/protocol-validation');
  const payload: InterviewPayload = {
    session: {
      ...loaded.session,
      network: NcNetworkSchema.parse(Redacted.value(loaded.session.network)),
      stageMetadata: StageMetadataSchema.parse(
        Redacted.value(loaded.session.stageMetadata),
      ),
      // Studio does not store a participant's language yet: each visit starts
      // from the browser's languages, and a choice lasts for the page.
      localePreference: null,
      locale: null,
      localeOptions: protocol.localization.locales.map((locale) =>
        getLocaleMetadata(locale),
      ),
    },
    protocol,
  };
  return {
    holderEpoch: loaded.holderEpoch,
    revision: loaded.revision,
    stageIndex: loaded.stageIndex,
    analytics: loaded.analytics,
    payload,
  };
};

const isReplaceable = (error: unknown): boolean =>
  refusalOf(error)?.kind === 'unauthorized' ||
  (error instanceof SessionEnded && error.state === 'abandoned');

export const enterSession = async (
  rawLinkToken: string,
): Promise<SessionToken> => {
  const linkToken = refuseUnless(decodeLinkToken(rawLinkToken));
  const stored = readStoredSession(linkToken);
  if (stored !== undefined) {
    try {
      entered = { sessionToken: stored, loaded: await readSession(stored) };
      return stored;
    } catch (error) {
      if (!isReplaceable(error)) throw error;
      forgetStoredSession(linkToken);
    }
  }
  setParticipantSessionToken(null);
  const { sessionToken, anonymous } = await participantCall(
    'participant.redeem',
    { linkToken },
  );
  storeSession(linkToken, sessionToken, { anonymous });
  return sessionToken;
};
