import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { isRefusalOf } from './attempt.ts';
import {
  lockQueryKey,
  presenceQueryKey,
  useProtocolBuilderContext,
  type LockState,
  type ProtocolBuilderAdapter,
} from './context.ts';

const FIRST_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 4_000;

type ChannelDeps = Readonly<{
  adapter: ProtocolBuilderAdapter;
  queryClient: QueryClient;
  protocolId: string;
}>;

type SectionList = Readonly<{ sectionIds: readonly ProtocolSectionId[] }>;
type SectionAtRevision = Readonly<{
  document: Readonly<Record<string, unknown>>;
  revision: Readonly<{ sequence: bigint; contentHash: string }>;
}>;

/**
 * The one subscription an open protocol has.
 *
 * Every revision, lock change and presence change arrives here and is written
 * into the cache from outside React's render, so a component re-renders only
 * when the key it observes changes. The iterator ending or failing is a
 * reconnect, resumed from the last cursor seen — which is what stops a
 * revision published during the gap from being missed.
 */
export function useProtocolChannel(protocolId: string): void {
  const { adapter } = useProtocolBuilderContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    const deps: ChannelDeps = { adapter, queryClient, protocolId };
    void streamProtocolEvents(
      adapter,
      protocolId,
      (event) => applyEvent(deps, event),
      controller.signal,
    );
    return () => controller.abort();
  }, [adapter, queryClient, protocolId]);
}

/**
 * Consumes `WatchProtocol` until the signal aborts, resuming from the last
 * cursor seen whenever the stream ends or fails.
 *
 * The wait before a resume doubles up to a cap, so a host that is down stops
 * being asked four times a second by every open tab, and goes back to the
 * first delay as soon as a stream delivers something — an editor whose socket
 * flaps is reconnected promptly rather than paying for the last outage.
 *
 * Separate from the cache so the WebSocket spike drives the resume this
 * channel actually uses rather than a copy of it.
 */
export async function streamProtocolEvents(
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
  onEvent: (event: ProtocolEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let since: string | undefined;
  let delay = FIRST_RECONNECT_DELAY_MS;
  while (!signal.aborted) {
    try {
      await adapter.rpcStream(
        'WatchProtocol',
        { protocolId, ...(since === undefined ? {} : { since }) },
        (event) => {
          delay = FIRST_RECONNECT_DELAY_MS;
          if (event.type !== 'presence' && event.cursor !== undefined) {
            since = event.cursor;
          }
          onEvent(event);
        },
        signal,
      );
    } catch (error: unknown) {
      // A refusal the contract names — no such protocol — is not going to
      // become true on the next attempt, so it ends the channel. Everything
      // else is a dropped stream, and the resume below is its recovery.
      if (isRefusalOf('WatchProtocol', error)) return;
    }
    if (signal.aborted) return;
    await sleep(delay, signal);
    delay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
  }
}

function applyEvent(deps: ChannelDeps, event: ProtocolEvent): void {
  const { queryClient, adapter, protocolId } = deps;
  switch (event.type) {
    case 'revision': {
      const key = adapter.rpcKey('GetSection', {
        protocolId,
        sectionId: event.sectionId,
      });
      if (event.document === undefined) {
        queryClient.removeQueries({ queryKey: key, exact: true });
        updateSectionList(deps, event.sectionId, 'removed');
        return;
      }
      queryClient.setQueryData<SectionAtRevision>(key, {
        document: event.document,
        revision: event.revision,
      });
      updateSectionList(deps, event.sectionId, 'present');
      return;
    }
    case 'lock': {
      queryClient.setQueryData<LockState>(
        lockQueryKey(protocolId, event.sectionId),
        event.holder === undefined ? {} : { holder: event.holder },
      );
      return;
    }
    case 'presence': {
      queryClient.setQueryData(presenceQueryKey(protocolId), event.present);
      return;
    }
  }
}

function updateSectionList(
  deps: ChannelDeps,
  sectionId: ProtocolSectionId,
  state: 'present' | 'removed',
  awaited = false,
): void {
  const options = deps.adapter.rpcQuery('ListSections', {
    protocolId: deps.protocolId,
  });
  const key = options.queryKey;
  let applied = false;
  deps.queryClient.setQueryData<SectionList>(key, (current) => {
    if (current === undefined) return current;
    applied = true;
    const has = current.sectionIds.includes(sectionId);
    if (state === 'present') {
      return has ? current : { sectionIds: [...current.sectionIds, sectionId] };
    }
    return has
      ? { sectionIds: current.sectionIds.filter((id) => id !== sectionId) }
      : current;
  });
  if (applied || awaited) return;
  // The list is still on its way, and the answer was formed before this
  // section existed — nothing refetches it afterwards, so the delta is applied
  // again once that answer is in the cache. A list nobody is asking for needs
  // no repair: the first component to ask reads the section in.
  if (deps.queryClient.getQueryState(key)?.fetchStatus !== 'fetching') return;
  void deps.queryClient
    .ensureQueryData(options)
    .then(() => updateSectionList(deps, sectionId, state, true))
    .catch(() => undefined);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}
