import { getEventMeta, isDefinedError } from '@orpc/client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../contract/contract.ts';
import type { ProtocolEvent } from '../contract/schemas.ts';
import {
  lockQueryKey,
  presenceQueryKey,
  useProtocolBuilderContext,
  type LockState,
  type ProtocolQueryUtils,
} from './context.ts';

const FIRST_RECONNECT_DELAY_MS = 250;
const MAX_RECONNECT_DELAY_MS = 4_000;

type ChannelDeps = Readonly<{
  client: ProtocolBuilderClient;
  utils: ProtocolQueryUtils;
  queryClient: QueryClient;
  protocolId: string;
}>;

type SectionList = Readonly<{ sectionIds: ProtocolSectionId[] }>;
type SectionAtRevision = Readonly<{
  document: Record<string, unknown>;
  revision: { sequence: bigint; contentHash: string };
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
  const { client, utils } = useProtocolBuilderContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    const deps: ChannelDeps = { client, utils, queryClient, protocolId };
    void streamProtocolEvents(
      client,
      protocolId,
      (event) => applyEvent(deps, event),
      controller.signal,
    );
    return () => controller.abort();
  }, [client, utils, queryClient, protocolId]);
}

/**
 * Consumes `watchProtocol` until the signal aborts, resuming from the last
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
  client: ProtocolBuilderClient,
  protocolId: string,
  onEvent: (event: ProtocolEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let since: string | undefined;
  let delay = FIRST_RECONNECT_DELAY_MS;
  while (!signal.aborted) {
    try {
      const events = await client.watchProtocol(
        { protocolId, ...(since === undefined ? {} : { since }) },
        { signal },
      );
      for await (const event of events) {
        delay = FIRST_RECONNECT_DELAY_MS;
        since = getEventMeta(event)?.id ?? since;
        onEvent(event);
      }
    } catch (error) {
      // A refusal the contract names — no such protocol — is not going to
      // become true on the next attempt, so it ends the channel. Everything
      // else is a dropped stream, and the resume below is its recovery.
      if (isDefinedError(error)) return;
    }
    if (signal.aborted) return;
    await sleep(delay, signal);
    delay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
  }
}

function applyEvent(deps: ChannelDeps, event: ProtocolEvent): void {
  const { queryClient, utils, protocolId } = deps;
  switch (event.type) {
    case 'revision': {
      const key = utils.getSection.queryKey({
        input: { protocolId, sectionId: event.sectionId },
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
  const options = deps.utils.listSections.queryOptions({
    input: { protocolId: deps.protocolId },
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
