import {
  createDebouncedSyncHandler,
  type FinishHandler,
  type SessionPayload,
  type SyncHandler,
} from '@codaco/interview/contract';
import { SessionOutOfDate } from '@codaco/studio-contract/schema/participant';

import { retryAfterSeconds } from '../runtime/errors.ts';
import {
  participantCall,
  participantUnloadingSync,
} from '../runtime/participantRpc.ts';
import { noticeFor, type ParticipantNoticeKind } from './ParticipantNotice.tsx';

const SYNC_WAIT_MS = 3000;
const RATE_LIMIT_ATTEMPTS = 3;
const RATE_LIMIT_LONGEST_WAIT_SECONDS = 60;
const ORDINARY = { immediate: false, unloading: false };

type SyncPayload = Parameters<typeof participantUnloadingSync>[0];

type Args = {
  readonly holderEpoch: number;
  readonly revision: string;
  readonly session: SessionPayload;
  readonly stageIds: readonly string[];
  readonly getCurrentStep: () => number;
  readonly onNotice: (kind: ParticipantNoticeKind) => void;
};

type ParticipantHandlers = {
  readonly onSync: SyncHandler;
  readonly onFinish: FinishHandler;
  readonly saveStep: () => void;
};

const wait = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

export function createParticipantHandlers({
  holderEpoch,
  revision,
  session,
  stageIds,
  getCurrentStep,
  onNotice,
}: Args): ParticipantHandlers {
  let issued = BigInt(revision);
  // The newest snapshot the runtime has handed over, which a save the host
  // starts itself must send: the last one written may be older than an answer
  // still waiting out the debounce, and sending it would settle that answer's
  // waiter on a write that never carried it.
  let offered = session;
  let stopped = false;

  const stop = (kind: ParticipantNoticeKind): void => {
    stopped = true;
    onNotice(kind);
  };

  const noticeOf = (error: unknown): ParticipantNoticeKind | undefined => {
    const kind = noticeFor(error, 'session');
    return kind === 'rateLimited' ? undefined : kind;
  };

  const payloadFor = (snapshot: SessionPayload): SyncPayload => {
    issued += 1n;
    const stageIndex = getCurrentStep();
    return {
      holderEpoch,
      revision: String(issued),
      stageIndex,
      stageId: stageIds[stageIndex] ?? null,
      network: snapshot.network,
      stageMetadata: snapshot.stageMetadata ?? {},
    };
  };

  const deliver = async (payload: SyncPayload): Promise<bigint> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await participantCall('participant.sync', payload);
        return BigInt(result.revision);
      } catch (error) {
        const delay = retryAfterSeconds(error);
        if (
          noticeFor(error, 'session') !== 'rateLimited' ||
          delay === undefined ||
          delay > RATE_LIMIT_LONGEST_WAIT_SECONDS ||
          attempt >= RATE_LIMIT_ATTEMPTS
        ) {
          throw error;
        }
        await wait(Math.max(delay, 1));
        if (stopped) throw error;
      }
    }
  };

  const send = async (snapshot: SessionPayload): Promise<void> => {
    const payload = payloadFor(snapshot);
    const stored = await deliver(payload);
    if (stored > issued) {
      issued = stored;
      await deliver(payloadFor(snapshot));
    }
  };

  const debouncedSync = createDebouncedSyncHandler(
    async (_id, snapshot, { unloading }) => {
      if (stopped) return;
      try {
        await (unloading
          ? participantUnloadingSync(payloadFor(snapshot))
          : send(snapshot));
      } catch (error) {
        const kind = noticeOf(error);
        if (kind !== undefined) stop(kind);
        throw error;
      }
    },
    { waitMs: SYNC_WAIT_MS },
  );

  const onSync: SyncHandler = (id, snapshot, options) => {
    offered = snapshot;
    return debouncedSync(id, snapshot, options);
  };

  const finish = () =>
    participantCall('participant.finish', {
      holderEpoch,
      revision: String(issued),
    });

  const onFinish: FinishHandler = async () => {
    try {
      try {
        await finish();
      } catch (error) {
        if (!(error instanceof SessionOutOfDate)) throw error;
        await send(offered);
        await finish();
      }
    } catch (error) {
      const kind = noticeOf(error);
      if (kind === undefined) throw error;
      stop(kind);
      return;
    }
    stop('finished');
  };

  const saveStep = (): void => {
    debouncedSync(offered.id, offered, ORDINARY).catch(() => undefined);
  };

  return { onSync, onFinish, saveStep };
}
