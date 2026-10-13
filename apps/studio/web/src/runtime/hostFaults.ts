import { Effect, Layer, Predicate } from 'effect';
import * as Socket from 'effect/socket/Socket';

import { isTaggedError } from '@codaco/effect-query/errors';
import type { PayloadOf, RpcAdapter } from '@codaco/effect-query/types';
import type {
  ProtocolBuilderRpcs,
  ProtocolBuilderTag,
} from '@codaco/protocol-builder-core/contract';
import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import { logResearcher } from './browserLogs.ts';

type Log = (entry: ResearcherLogEntry) => void;

const NORMAL_CLOSURE = 1000;

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_ATTEMPTS = 1000;

const closeCode = (event: unknown): number | undefined =>
  Predicate.hasProperty(event, 'code') && Predicate.isNumber(event.code)
    ? event.code
    : undefined;

export const makeConnectionMonitor = (
  log: Log = logResearcher,
  now: () => number = Date.now,
): ((socket: Socket.WebSocketLike) => void) => {
  let lostAt: number | undefined;
  let attempts = 0;
  return (socket) => {
    if (lostAt !== undefined) attempts += 1;
    let opened = false;
    socket.addEventListener('open', () => {
      opened = true;
      if (lostAt === undefined) return;
      log({
        message: 'Editor connection restored',
        level: 'Info',
        attributes: {
          duration_ms: Math.min(Math.max(now() - lostAt, 0), MAX_DURATION_MS),
          attempt_count: Math.min(Math.max(attempts, 1), MAX_ATTEMPTS),
        },
      });
      lostAt = undefined;
      attempts = 0;
    });
    const lose = () => {
      if (!opened || lostAt !== undefined) return;
      lostAt = now();
      attempts = 0;
      log({ message: 'Editor connection lost', level: 'Warn', attributes: {} });
    };
    socket.addEventListener('error', lose);
    socket.addEventListener('close', (event) => {
      if (closeCode(event) !== NORMAL_CLOSURE) lose();
    });
  };
};

export const observedWebSocketConstructor = (
  watch: (socket: Socket.WebSocketLike) => void = makeConnectionMonitor(),
): Layer.Layer<Socket.WebSocketConstructor> =>
  Layer.effect(Socket.WebSocketConstructor)(
    Effect.map(Socket.WebSocketConstructor, (make) => (url, options) => {
      const socket = make(url, options);
      watch(socket);
      return socket;
    }),
  ).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal));

const isReadOnlyLock = (result: unknown): boolean =>
  Predicate.hasProperty(result, 'lock') && result.lock === 'readOnly';

export const observeLocks = (
  adapter: RpcAdapter<ProtocolBuilderRpcs>,
  log: Log = logResearcher,
): RpcAdapter<ProtocolBuilderRpcs> => ({
  ...adapter,
  rpcCall: async <Tag extends ProtocolBuilderTag>(
    tag: Tag,
    payload: PayloadOf<ProtocolBuilderRpcs, Tag>,
    signal?: AbortSignal,
  ) => {
    try {
      const result = await adapter.rpcCall(tag, payload, signal);
      if (tag === 'AcquireLock' && isReadOnlyLock(result)) {
        log({ message: 'Editing lock refused', level: 'Warn', attributes: {} });
      }
      return result;
    } catch (error) {
      if (isTaggedError(error, 'NotLockHolder')) {
        log({ message: 'Editing lock lost', level: 'Warn', attributes: {} });
      }
      throw error;
    }
  },
});
