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
const RESEND_ATTEMPTS = 3;
const ORDINARY = { immediate: false, unloading: false };
const UNLOADING = { immediate: true, unloading: true };

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
  /** Sends the stage reached as the unloading save when no save holds it. */
  readonly flushStep: () => void;
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
  // The stage the newest applied save recorded.
  let savedStep = getCurrentStep();
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

  const deliver = async (
    payload: SyncPayload,
  ): Promise<{ readonly stored: bigint; readonly applied: boolean }> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await participantCall('participant.sync', payload);
        return { stored: BigInt(result.revision), applied: result.applied };
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

  type Saved = { readonly stored: bigint; readonly applied: boolean };

  const deliverUnloading = async (payload: SyncPayload): Promise<Saved> => {
    const result = await participantUnloadingSync(payload);
    return { stored: BigInt(result.revision), applied: result.applied };
  };

  // A save the server did not apply found a write at or past its number. That
  // write may be this page's own or one from a page sharing the holder — the
  // reloaded tab's last saves — and a revision number cannot say which, so the
  // page resends the newest snapshot it holds past everything the server
  // holds. Whoever wrote what was in the way, the server ends with this page's
  // newest answers; when it was this page's own, the resend repeats them.
  const send = async (
    snapshot: SessionPayload,
    { unloading }: { readonly unloading: boolean },
  ): Promise<void> => {
    let next = snapshot;
    for (let attempt = 1; attempt <= RESEND_ATTEMPTS; attempt += 1) {
      const payload = payloadFor(next);
      const { stored, applied } = await (unloading
        ? deliverUnloading(payload)
        : deliver(payload));
      if (applied) {
        savedStep = payload.stageIndex;
        return;
      }
      if (stored > issued) issued = stored;
      next = offered;
    }
    throw new Error(
      `the server kept another save at revision ${String(issued)} through ${String(RESEND_ATTEMPTS)} attempts`,
    );
  };

  const debouncedSync = createDebouncedSyncHandler(
    async (_id, snapshot, { unloading }) => {
      if (stopped) return;
      try {
        await send(snapshot, { unloading });
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

  const finish = (signal: AbortSignal) =>
    participantCall(
      'participant.finish',
      { holderEpoch, revision: String(issued) },
      signal,
    );

  // Cancelling the finish dialog aborts `signal`: the request in flight is
  // abandoned, and nothing after it runs, so a cancelled finish never shows
  // the finished notice or finishes again after a resend.
  const onFinish: FinishHandler = async (_id, signal) => {
    try {
      try {
        await finish(signal);
      } catch (error) {
        if (!(error instanceof SessionOutOfDate)) throw error;
        await send(offered, ORDINARY);
        signal.throwIfAborted();
        await finish(signal);
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

  // Moving between stages that change no answer leaves the runtime's session
  // clean, so its own unload flush writes nothing: a stage save still waiting
  // or on the wire would be lost with the page. The host sends it as the
  // unloading save itself.
  const flushStep = (): void => {
    if (stopped || savedStep === getCurrentStep()) return;
    debouncedSync(offered.id, offered, UNLOADING).catch(() => undefined);
  };

  return { onSync, onFinish, saveStep, flushStep };
}
