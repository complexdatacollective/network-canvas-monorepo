import { Effect } from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import type {
  PayloadOf,
  RpcAdapter,
  SuccessOf,
} from '@codaco/effect-query/types';

import {
  ParticipantClient,
  participantRequestInit,
  type ParticipantRpcsType,
  participantRuntime,
} from './participantRuntime.ts';

const KEEPALIVE_MAX_BYTES = 60_000;

const adapter: RpcAdapter<ParticipantRpcsType> = makeRpcAdapter({
  runtime: participantRuntime,
  client: ParticipantClient,
  keyPrefix: 'participant',
});

export const { rpcCall: participantCall } = adapter;

type SyncPayload = PayloadOf<ParticipantRpcsType, 'participant.sync'>;
type SyncSuccess = SuccessOf<ParticipantRpcsType, 'participant.sync'>;

export const participantUnloadingSync = (
  payload: SyncPayload,
): Promise<SyncSuccess> =>
  participantRuntime.runPromise(
    Effect.flatMap(ParticipantClient, (client) =>
      client('participant.sync', payload),
    ).pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        ...participantRequestInit,
        keepalive:
          new Blob([JSON.stringify(payload)]).size <= KEEPALIVE_MAX_BYTES,
      }),
    ),
  );
