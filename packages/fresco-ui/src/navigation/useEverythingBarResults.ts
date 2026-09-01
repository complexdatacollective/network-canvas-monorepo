'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { matchLabel } from './everythingBarMatching';
import {
  createEntryComparator,
  providersToFetchBeforeReveal,
  type EverythingBarEntry,
  type EverythingBarFrontier,
} from './everythingBarMerge';
import {
  EVERYTHING_BAR_GROUPS,
  isRemoteProvider,
  providerSetKey,
  qualifiedKey,
  type EverythingBarGroup,
  type EverythingBarItem,
  type EverythingBarProvider,
  type EverythingBarRemoteProvider,
} from './everythingBarModel';

/**
 * Result orchestration for the everything bar: local matching on every
 * keystroke, debounced and abortable remote searches, the fixed group order,
 * per-group bounds with frontier-bounded pagination, error containment, and a
 * highlight tracked by provider-qualified identity rather than by list
 * position.
 */

export const DEFAULT_GROUP_BOUND = 5;

/**
 * Rows that are not results still occupy the list. "Show more" and the
 * retryable error row are part of the arrow-key sequence, because a keyboard
 * user has to be able to reach them; the pending indicator is not, because
 * there is nothing there to activate.
 */
export type EverythingBarRow =
  | { kind: 'item'; key: string; entry: EverythingBarEntry }
  | { kind: 'show-more'; key: string; group: EverythingBarGroup }
  | {
      kind: 'error';
      key: string;
      group: EverythingBarGroup | 'other';
      providerId: string;
    }
  | { kind: 'pending'; key: string; group: EverythingBarGroup | 'other' };

export type EverythingBarSectionId =
  | 'recents'
  | EverythingBarGroup
  /** Rows from a provider whose group is not known yet. */
  | 'other';

export type EverythingBarSection = {
  id: EverythingBarSectionId;
  rows: EverythingBarRow[];
};

type ProviderState = {
  status: 'pending' | 'ready' | 'error';
  items: EverythingBarItem[];
  next?: string;
};

type ResultsState = {
  generation: number;
  providers: Record<string, ProviderState>;
  /** Rows revealed per group; absent means the default bound. */
  revealed: Partial<Record<EverythingBarGroup, number>>;
  /** Providers a group is waiting on before its next slice can be revealed. */
  awaiting: Partial<Record<EverythingBarGroup, string[]>>;
};

type ResultsAction =
  | {
      type: 'reset';
      generation: number;
      providers: Array<{ id: string; pending: boolean }>;
    }
  | {
      type: 'page';
      generation: number;
      providerId: string;
      items: EverythingBarItem[];
      next: string | undefined;
      append: boolean;
    }
  | { type: 'failed'; generation: number; providerId: string }
  | { type: 'pending'; generation: number; providerIds: string[] }
  | {
      type: 'awaiting';
      generation: number;
      group: EverythingBarGroup;
      providerIds: string[];
    }
  | {
      type: 'reveal';
      generation: number;
      group: EverythingBarGroup;
      revealed: number;
    };

const INITIAL_STATE: ResultsState = {
  generation: 0,
  providers: {},
  revealed: {},
  awaiting: {},
};

function resultsReducer(
  state: ResultsState,
  action: ResultsAction,
): ResultsState {
  if (action.type === 'reset') {
    return {
      generation: action.generation,
      providers: Object.fromEntries(
        action.providers.map(({ id, pending }) => [
          id,
          { status: pending ? 'pending' : 'ready', items: [] },
        ]),
      ),
      revealed: {},
      awaiting: {},
    };
  }

  // Everything else belongs to the generation it was issued for. Aborting a
  // request cannot revoke a promise the network already fulfilled, so this is
  // what discards a response that resolves after its query was superseded: it
  // is never rendered under the newer query.
  if (action.generation !== state.generation) return state;

  switch (action.type) {
    case 'page': {
      const previous = state.providers[action.providerId];
      return {
        ...state,
        providers: {
          ...state.providers,
          [action.providerId]: {
            status: 'ready',
            items: action.append
              ? [...(previous?.items ?? []), ...action.items]
              : action.items,
            next: action.next,
          },
        },
      };
    }
    case 'failed': {
      const previous = state.providers[action.providerId];
      return {
        ...state,
        providers: {
          ...state.providers,
          [action.providerId]: {
            status: 'error',
            items: previous?.items ?? [],
            next: previous?.next,
          },
        },
      };
    }
    case 'pending': {
      const providers = { ...state.providers };
      for (const providerId of action.providerIds) {
        const previous = providers[providerId];
        providers[providerId] = {
          status: 'pending',
          items: previous?.items ?? [],
          next: previous?.next,
        };
      }
      return { ...state, providers };
    }
    case 'awaiting':
      return {
        ...state,
        awaiting: { ...state.awaiting, [action.group]: action.providerIds },
      };
    case 'reveal': {
      const awaiting = { ...state.awaiting };
      delete awaiting[action.group];
      return {
        ...state,
        revealed: { ...state.revealed, [action.group]: action.revealed },
        awaiting,
      };
    }
  }
}

type GroupDerivation = {
  merged: EverythingBarEntry[];
  /** The first index that is not rendered. */
  visible: number;
  frontiers: EverythingBarFrontier[];
  hasMore: boolean;
};

type Derivation = Partial<Record<EverythingBarGroup, GroupDerivation>>;

function entriesOf({
  providerId,
  items,
  query,
  locale,
  filter,
}: {
  providerId: string;
  items: EverythingBarItem[];
  query: string;
  locale: string | undefined;
  filter: boolean;
}): EverythingBarEntry[] {
  const entries: EverythingBarEntry[] = [];

  for (const item of items) {
    const ranges = matchLabel(item.label, query, locale);
    // A remote provider already decided what matches; the component only maps
    // the highlight onto its labels.
    if (filter && ranges === null) continue;
    entries.push({
      key: qualifiedKey(providerId, item.id),
      providerId,
      item,
      ranges: ranges ?? [],
    });
  }

  return entries;
}

export function useEverythingBarResults({
  providers,
  open,
  query,
  recents,
  locale,
  bound = DEFAULT_GROUP_BOUND,
  debounceMs = 150,
}: {
  providers: EverythingBarProvider[];
  open: boolean;
  query: string;
  /** Already-resolved recents, deduplicated out of the inventory sections. */
  recents: EverythingBarEntry[];
  locale?: string;
  bound?: number;
  debounceMs?: number;
}) {
  const [state, dispatch] = useReducer(resultsReducer, INITIAL_STATE);
  const [committedQuery, setCommittedQuery] = useState('');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const providersRef = useRef(providers);
  providersRef.current = providers;
  const stateRef = useRef(state);
  stateRef.current = state;
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  /** What each provider last asked for, so its error row retries exactly that. */
  const lastRequestRef = useRef<
    Record<string, { cursor: string | undefined; append: boolean }>
  >({});
  /**
   * The groups each remote provider has been seen to serve, for a provider
   * that does not declare them.
   */
  const seenGroupsRef = useRef<Record<string, EverythingBarGroup[]>>({});

  const remoteProviders = providers.filter(isRemoteProvider);
  // Identity, not id. The array itself may be a fresh literal on every render;
  // only the provider objects inside it need stable references.
  const remoteKey = providerSetKey(remoteProviders);
  const compare = useMemo(() => createEntryComparator(locale), [locale]);

  const findRemoteProvider = useCallback((providerId: string) => {
    return providersRef.current
      .filter(isRemoteProvider)
      .find((candidate) => candidate.id === providerId);
  }, []);

  const runProviderSearch = useCallback(
    (
      provider: EverythingBarRemoteProvider,
      generation: number,
      signal: AbortSignal,
      request: { query: string; cursor?: string; append: boolean },
    ) => {
      lastRequestRef.current[provider.id] = {
        cursor: request.cursor,
        append: request.append,
      };

      const page =
        request.query === ''
          ? (provider.empty?.(signal) ?? Promise.resolve([])).then((items) => ({
              items,
              next: undefined,
            }))
          : provider.search(request.query, signal, request.cursor);

      const deliver = async () => {
        try {
          const result = await page;
          dispatch({
            type: 'page',
            generation,
            providerId: provider.id,
            items: result.items,
            next: result.next,
            append: request.append,
          });
        } catch {
          // An abort this component issued is not a failure: the newer query
          // owns the state, and its own reset has already cleared this
          // provider.
          if (signal.aborted) return;
          dispatch({ type: 'failed', generation, providerId: provider.id });
        }
      };

      void deliver();
    },
    [],
  );

  // Only the remote half is debounced. Local inventories filter synchronously
  // on every keystroke, so narrowing what the component already holds never
  // waits on the network.
  useEffect(() => {
    if (debounceMs <= 0) {
      setCommittedQuery(query);
      return undefined;
    }

    const timer = setTimeout(() => setCommittedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  useEffect(() => {
    if (!open) {
      // Closing ends the session's results. Keeping them would paint the
      // previous session's rows on the first frame of the next open — the
      // remote half reads as in sync there, so the stale items render before
      // this effect can reset them. Bumping the generation in the same breath
      // discards any response the closed session had already been handed by
      // the network.
      //
      // The committed query is deliberately left alone: the bar's own close
      // clears the query, and an app that closes the bar by flipping `open`
      // does not — dropping the committed value there would leave a reopened
      // bar showing a query it never searched for.
      const closing = generationRef.current + 1;
      generationRef.current = closing;
      dispatch({ type: 'reset', generation: closing, providers: [] });
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const controller = new AbortController();
    controllerRef.current = controller;
    lastRequestRef.current = {};

    const remote = providersRef.current.filter(isRemoteProvider);
    const trimmed = committedQuery.trim();
    const requested = remote.filter(
      (provider) => trimmed !== '' || provider.empty !== undefined,
    );

    dispatch({
      type: 'reset',
      generation,
      providers: remote.map((provider) => ({
        id: provider.id,
        pending: requested.includes(provider),
      })),
    });

    for (const provider of requested) {
      runProviderSearch(provider, generation, controller.signal, {
        query: trimmed,
        append: false,
      });
    }

    return () => controller.abort();
  }, [open, committedQuery, remoteKey, runProviderSearch]);

  const isEmptyQuery = query.trim() === '';
  const remoteIsEmptyQuery = committedQuery.trim() === '';
  // While the debounce still holds a newer query, the remote half is answering
  // a different question: its groups read as pending rather than rendering the
  // previous question's answers under this one.
  const remoteInSync = remoteIsEmptyQuery === isEmptyQuery;

  const localEntries: EverythingBarEntry[] = [];
  for (const provider of providers) {
    if (!provider.local) continue;
    localEntries.push(
      ...entriesOf({
        providerId: provider.id,
        items: provider.items(),
        query,
        locale,
        filter: !isEmptyQuery,
      }),
    );
  }

  const remoteEntries: EverythingBarEntry[] = [];
  if (remoteInSync) {
    for (const provider of remoteProviders) {
      const providerState = state.providers[provider.id];
      if (!providerState) continue;
      remoteEntries.push(
        ...entriesOf({
          providerId: provider.id,
          items: providerState.items,
          query,
          locale,
          filter: false,
        }),
      );
    }
  }

  const recentKeys = new Set(
    isEmptyQuery ? recents.map((entry) => entry.key) : [],
  );

  const groupsOfProvider = (provider: EverythingBarRemoteProvider) => {
    if (provider.groups && provider.groups.length > 0) return provider.groups;

    const delivered = [
      ...new Set(
        (state.providers[provider.id]?.items ?? []).map((i) => i.group),
      ),
    ];
    if (delivered.length > 0) {
      seenGroupsRef.current[provider.id] = delivered;
      return delivered;
    }

    return seenGroupsRef.current[provider.id] ?? [];
  };

  const derivation: Derivation = {};
  for (const group of EVERYTHING_BAR_GROUPS) {
    const byKey = new Map<string, EverythingBarEntry>();
    for (const entry of [...localEntries, ...remoteEntries]) {
      if (entry.item.group !== group) continue;
      // Recents take precedence, so a provider-qualified key never renders
      // twice in the empty state.
      if (recentKeys.has(entry.key)) continue;
      if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
    }

    const merged = [...byKey.values()].toSorted(compare);
    const revealed = state.revealed[group] ?? bound;
    const highlightIndex = merged.findIndex(
      (entry) => entry.key === highlightKey,
    );
    // Selection stability: an insertion above the highlight can push the
    // highlighted item past the group's bound. The window extends rather than
    // unmounting it, so `aria-activedescendant` always references a rendered
    // option.
    const visible = Math.max(revealed, highlightIndex + 1);

    const frontiers: EverythingBarFrontier[] = [];
    for (const provider of remoteProviders) {
      const providerState = state.providers[provider.id];
      if (providerState?.next === undefined) continue;
      if (providerState.status === 'error') continue;
      const delivered = merged.filter(
        (entry) => entry.providerId === provider.id,
      );
      if (
        delivered.length === 0 &&
        !groupsOfProvider(provider).includes(group)
      ) {
        continue;
      }
      frontiers.push({ providerId: provider.id, frontier: delivered.at(-1) });
    }

    derivation[group] = {
      merged,
      visible,
      frontiers,
      hasMore: merged.length > visible || frontiers.length > 0,
    };
  }

  const derivationRef = useRef(derivation);
  derivationRef.current = derivation;

  const sections: EverythingBarSection[] = [];
  if (isEmptyQuery && recents.length > 0) {
    sections.push({
      id: 'recents',
      rows: recents.map((entry) => ({ kind: 'item', key: entry.key, entry })),
    });
  }

  const placedRows: Partial<
    Record<EverythingBarGroup | 'other', EverythingBarRow[]>
  > = {};

  for (const provider of remoteProviders) {
    const providerState = state.providers[provider.id];
    if (!providerState) continue;
    const isPending = providerState.status === 'pending' || !remoteInSync;
    const isFailed = providerState.status === 'error' && remoteInSync;
    if (!isPending && !isFailed) continue;

    const groups = groupsOfProvider(provider);
    const targets: Array<EverythingBarGroup | 'other'> =
      groups.length > 0 ? [...groups] : ['other'];

    for (const target of targets) {
      const row: EverythingBarRow = isFailed
        ? {
            kind: 'error',
            key: `error:${provider.id}:${target}`,
            group: target,
            providerId: provider.id,
          }
        : {
            kind: 'pending',
            key: `pending:${provider.id}:${target}`,
            group: target,
          };
      (placedRows[target] ??= []).push(row);
    }
  }

  for (const group of EVERYTHING_BAR_GROUPS) {
    const groupDerivation = derivation[group];
    if (!groupDerivation) continue;

    const rows: EverythingBarRow[] = groupDerivation.merged
      .slice(0, groupDerivation.visible)
      .map((entry) => ({ kind: 'item', key: entry.key, entry }));

    rows.push(...(placedRows[group] ?? []));

    if (groupDerivation.hasMore) {
      rows.push({ kind: 'show-more', key: `show-more:${group}`, group });
    }

    if (rows.length > 0) sections.push({ id: group, rows });
  }

  const orphanRows = placedRows.other ?? [];
  if (orphanRows.length > 0) sections.push({ id: 'other', rows: orphanRows });

  const options = sections
    .flatMap((section) => section.rows)
    .filter((row) => row.kind !== 'pending');
  const optionKeysRef = useRef<string[]>([]);
  optionKeysRef.current = options.map((row) => row.key);
  // The rendered sequence as one value, so the effect below re-runs exactly
  // when the set of options changes — not on every render.
  const optionSequence = optionKeysRef.current.join('\u0000');

  // The highlight moves only when the researcher moves it, or when the item it
  // names has left the list entirely.
  useEffect(() => {
    const keys = optionKeysRef.current;
    if (highlightKey !== null && keys.includes(highlightKey)) return;
    setHighlightKey(keys[0] ?? null);
  }, [optionSequence, highlightKey]);

  const revealSlice = useCallback(
    (group: EverythingBarGroup) => {
      const groupDerivation = derivationRef.current[group];
      if (!groupDerivation) return;

      const firstRevealed = groupDerivation.merged[groupDerivation.visible];
      dispatch({
        type: 'reveal',
        generation: generationRef.current,
        group,
        revealed: groupDerivation.visible + bound,
      });
      if (firstRevealed) setHighlightKey(firstRevealed.key);
    },
    [bound],
  );

  // A group awaiting a continuation reveals its slice once every provider it
  // is waiting on has answered — so a held local row is never revealed ahead
  // of a page that could outrank it.
  useEffect(() => {
    for (const group of EVERYTHING_BAR_GROUPS) {
      const waitingFor = state.awaiting[group];
      if (!waitingFor) continue;
      const stillPending = waitingFor.some(
        (providerId) => state.providers[providerId]?.status === 'pending',
      );
      if (stillPending) continue;
      revealSlice(group);
    }
  }, [state, revealSlice]);

  const anyPending = Object.values(state.providers).some(
    (providerState) => providerState.status === 'pending',
  );
  const settled =
    open && remoteInSync && committedQuery === query && !anyPending;
  const resultCount = options.filter((row) => row.kind === 'item').length;

  const moveHighlight = useCallback((delta: number) => {
    setHighlightKey((current) => {
      const keys = optionKeysRef.current;
      if (keys.length === 0) return null;
      const index = current === null ? -1 : keys.indexOf(current);
      const next = Math.min(Math.max(index + delta, 0), keys.length - 1);
      return keys[next] ?? null;
    });
  }, []);

  const retry = useCallback(
    (providerId: string) => {
      const provider = findRemoteProvider(providerId);
      const controller = controllerRef.current;
      if (!provider || !controller || controller.signal.aborted) return;

      const request = lastRequestRef.current[providerId] ?? {
        cursor: undefined,
        append: false,
      };
      dispatch({
        type: 'pending',
        generation: generationRef.current,
        providerIds: [providerId],
      });
      runProviderSearch(provider, generationRef.current, controller.signal, {
        query: committedQuery.trim(),
        cursor: request.cursor,
        append: request.append,
      });
    },
    [committedQuery, findRemoteProvider, runProviderSearch],
  );

  const showMore = useCallback(
    (group: EverythingBarGroup) => {
      const groupDerivation = derivationRef.current[group];
      if (!groupDerivation) return;

      const controller = controllerRef.current;
      const targets = providersToFetchBeforeReveal({
        merged: groupDerivation.merged,
        revealed: groupDerivation.visible,
        bound,
        frontiers: groupDerivation.frontiers,
        compare,
      });

      if (targets.length === 0 || !controller || controller.signal.aborted) {
        revealSlice(group);
        return;
      }

      dispatch({
        type: 'awaiting',
        generation: generationRef.current,
        group,
        providerIds: targets,
      });
      dispatch({
        type: 'pending',
        generation: generationRef.current,
        providerIds: targets,
      });

      for (const providerId of targets) {
        const provider = findRemoteProvider(providerId);
        if (!provider) continue;
        runProviderSearch(provider, generationRef.current, controller.signal, {
          query: committedQuery.trim(),
          cursor: stateRef.current.providers[providerId]?.next,
          append: true,
        });
      }
    },
    [
      bound,
      committedQuery,
      compare,
      findRemoteProvider,
      revealSlice,
      runProviderSearch,
    ],
  );

  return {
    sections,
    options,
    highlightKey,
    setHighlightKey,
    moveHighlight,
    showMore,
    retry,
    settled,
    generation: state.generation,
    resultCount,
    isEmptyQuery,
  };
}
