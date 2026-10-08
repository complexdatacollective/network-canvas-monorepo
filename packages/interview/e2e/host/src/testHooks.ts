import { v4 as uuid } from 'uuid';

import { createInitialNetwork } from '../../../src/contract/network';
import type {
  ProtocolPayload,
  SessionSnapshot,
} from '../../../src/contract/types';
import {
  getFinishCalls,
  rejectManualFinish,
  resetFinishInstrumentation,
  resolveManualFinish,
  setFinishBehavior,
} from './mockCallbacks';

const STORAGE_KEY = '__e2e_test_state';

type InterviewEntry = {
  protocolId: string;
  participantId: string;
  session: SessionSnapshot & { finishStageId?: string | null };
};

type SerializableState = {
  protocols: Record<string, ProtocolPayload>;
  interviews: Record<string, InterviewEntry>;
  assetUrls: Record<string, string>;
};

type TestState = {
  protocols: Map<string, ProtocolPayload>;
  interviews: Map<string, InterviewEntry>;
  assetUrls: Map<string, string>;
};

type StateSubscriber = () => void;

let state: TestState = createEmptyState();
const subscribers = new Set<StateSubscriber>();

function createEmptyState(): TestState {
  return {
    protocols: new Map<string, ProtocolPayload>(),
    interviews: new Map<string, InterviewEntry>(),
    assetUrls: new Map<string, string>(),
  };
}

function notifySubscribers(): void {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function persistState(): void {
  try {
    const serializable: SerializableState = {
      protocols: Object.fromEntries(state.protocols),
      interviews: Object.fromEntries(state.interviews),
      assetUrls: Object.fromEntries(state.assetUrls),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage errors
  }
}

function restoreState(): TestState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw) as SerializableState;
    const restored = createEmptyState();
    for (const [k, v] of Object.entries(parsed.protocols)) {
      restored.protocols.set(k, v);
    }
    for (const [k, v] of Object.entries(parsed.interviews)) {
      restored.interviews.set(k, v);
    }
    for (const [k, v] of Object.entries(parsed.assetUrls)) {
      restored.assetUrls.set(k, v);
    }
    return restored;
  } catch {
    return createEmptyState();
  }
}

export function getTestState(): TestState {
  return state;
}

export function subscribe(fn: StateSubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function installProtocol(protocol: ProtocolPayload): void {
  state.protocols.set(protocol.id, protocol);
  for (const asset of protocol.assets) {
    state.assetUrls.set(asset.assetId, '');
  }
  persistState();
  notifySubscribers();
}

export function setAssetUrl(assetId: string, url: string): void {
  state.assetUrls.set(assetId, url);
  persistState();
  notifySubscribers();
}

export type SessionSeed = {
  network?: SessionSnapshot['network'];
  stageMetadata?: SessionSnapshot['stageMetadata'];
  /** Open the interview as already finished, at this finish stage. */
  finishedAt?: { stageId: string | null };
};

export function createInterview(
  protocolId: string,
  participantId: string,
  seed?: SessionSeed,
): string {
  const id = uuid();
  // This session is the initial payload Shell mounts with. After mount,
  // Shell owns its state in Redux — getNetworkState reads from that live
  // store, not from this snapshot. The step is NOT part of the session:
  // the host derives it from the URL (?step=) and passes it as a Shell prop.
  const session: InterviewEntry['session'] = {
    id,
    startTime: new Date().toISOString(),
    finishTime: seed?.finishedAt ? new Date().toISOString() : null,
    ...(seed?.finishedAt ? { finishStageId: seed.finishedAt.stageId } : {}),
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: seed?.network ?? createInitialNetwork(),
    localePreference: null,
    locale: null,
    ...(seed?.stageMetadata != null
      ? { stageMetadata: seed.stageMetadata }
      : {}),
  };
  state.interviews.set(id, { protocolId, participantId, session });
  persistState();
  notifySubscribers();
  return id;
}

// Reads live state from the running Shell's Redux store. Shell exposes it on
// window.__interviewStore when flags.isE2E is true.
function getNetworkState(): SessionSnapshot['network'] | undefined {
  return window.__interviewStore?.getState().session.network;
}

// Opt-in Shell stage navigation ("Go to a stage" drawer). Default OFF so the
// host's aria tree is unchanged for every suite that doesn't ask for it —
// enabling it unconditionally would add a "Go to a stage" button inside
// main[data-theme-interview], changing every committed aria baseline. Only the
// StagesMenu-exclusion scenario flips this on, via setAllowStageNavigation.
let allowStageNavigation = false;

export function getAllowStageNavigation(): boolean {
  return allowStageNavigation;
}

// Stands in for `navigator.languages`, which a real browser host passes. Empty
// by default so every suite runs in the protocol's default language and
// English built-in text, whatever locale the browser is launched with.
let requestedLocales: readonly string[] = [];

export function getRequestedLocales(): readonly string[] {
  return requestedLocales;
}

function setRequestedLocales(locales: readonly string[]) {
  requestedLocales = locales;
  notifySubscribers();
}

function setAllowStageNavigation(enabled: boolean): void {
  allowStageNavigation = enabled;
  notifySubscribers();
}

function reset(): void {
  state = createEmptyState();
  allowStageNavigation = false;
  requestedLocales = [];
  resetFinishInstrumentation();
  sessionStorage.removeItem(STORAGE_KEY);
  notifySubscribers();
}

export function installTestHooks(): void {
  // Restore persisted state so that protocols/interviews installed before
  // a page navigation (page.goto) survive the reload.
  state = restoreState();
  subscribers.clear();

  (globalThis as Record<string, unknown>).__test = {
    installProtocol,
    setAssetUrl,
    createInterview,
    getNetworkState,
    reset,
    setFinishBehavior,
    resolveManualFinish,
    rejectManualFinish,
    getFinishCalls,
    setAllowStageNavigation,
    setRequestedLocales,
  };
}
