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

// Browsers give keepalive requests a 64 KB budget. A body over it goes as an
// ordinary request, which a closing page may cancel: for an interview that
// large, answers given in the debounce window before the tab is closed can be
// lost. Accepted as a known limit (a hidden page still finishes the request);
// the durable alternatives keep answers in the browser or compress the body.
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
