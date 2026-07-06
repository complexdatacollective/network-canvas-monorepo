import type { PostHog } from 'posthog-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { APP_VERSION } from '~/lib/appVersion';
import { useAuth } from '~/lib/auth/AuthContext';
import { getSettings, updateSettings } from '~/lib/db/api';
import { getInstallationId } from '~/lib/installationId';

import { getAnalyticsClient } from './client';

export type AnalyticsContextValue = {
  // Current opt-in state, sourced from StoredSettings.analyticsEnabled.
  enabled: boolean;
  // The shared posthog-js client, or null if it failed to load. Passed to the
  // `@codaco/interview` Shell so interview-engine events use the same instance.
  client: PostHog | null;
  // Persist a new preference and apply it immediately (opt in/out).
  setEnabled: (enabled: boolean) => Promise<void>;
  // App-level event tracking. No-ops when disabled or the client is missing.
  track: (event: string, properties?: Record<string, unknown>) => void;
  // App-level error reporting. No-ops when disabled or the client is missing.
  captureException: (
    error: unknown,
    properties?: Record<string, unknown>,
  ) => void;
};

const NOOP_CONTEXT: AnalyticsContextValue = {
  enabled: false,
  client: null,
  setEnabled: async () => {},
  track: () => {},
  captureException: () => {},
};

const AnalyticsContext = createContext<AnalyticsContextValue>(NOOP_CONTEXT);

// Super properties attached to every app-level event. Keys are snake_case to
// match the `@codaco/interview` package so app and interview events share a
// consistent schema in PostHog. Crucially, this is anonymous and per-device:
// `installation_id` identifies the installation, never a user or participant.
function registerSuperProperties(client: PostHog) {
  client.register({
    // No Electron/Capacitor host remains; this app is the only host.
    app: 'interviewer',
    installation_id: getInstallationId(),
    host_version: APP_VERSION,
  });
}

// Apply the preference to the live client: register identity + super props and
// opt in, or opt out so nothing is sent.
function applyPreference(client: PostHog, enabled: boolean) {
  if (enabled) {
    registerSuperProperties(client);
    client.identify(getInstallationId());
    client.opt_in_capturing();
  } else {
    client.opt_out_capturing();
  }
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const [enabled, setEnabledState] = useState(false);
  const clientRef = useRef<PostHog | null>(null);
  const [client, setClient] = useState<PostHog | null>(null);
  // Bumped on every explicit user toggle. The async init() captures this at
  // start and bails if it changed, so a slow settings load can't clobber a
  // newer user choice that landed while it was in flight.
  const preferenceRevisionRef = useRef(0);

  // Load the stored preference once the app is unlocked. Reading settings is
  // DB-backed; the Dexie vault is only readable after unlock, so we must wait
  // for that. Analytics stays opted out (the safe default) until then. The
  // PostHog client is constructed ONLY when the stored preference is opted in —
  // when opted out we never call getAnalyticsClient(), so the app makes no
  // network contact with the relay. Re-runs on a lock/unlock cycle are
  // idempotent.
  useEffect(() => {
    if (kind !== 'unlocked') return;
    let active = true;
    const revisionAtStart = preferenceRevisionRef.current;
    const init = async () => {
      try {
        const settings = await getSettings();
        if (!active || revisionAtStart !== preferenceRevisionRef.current)
          return;
        setEnabledState(settings.analyticsEnabled);
        if (!settings.analyticsEnabled) return;
        const resolved = await getAnalyticsClient();
        // Re-check after the async client load: bail if torn down, or if the
        // user toggled while we were loading — their choice (already applied by
        // setEnabled) must win.
        if (!active || revisionAtStart !== preferenceRevisionRef.current)
          return;
        clientRef.current = resolved;
        setClient(resolved);
        if (resolved) applyPreference(resolved, true);
      } catch {
        // Never let telemetry setup break the app.
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, [kind]);

  const setEnabled = useCallback(async (next: boolean) => {
    // Reflect the choice in the UI immediately, then persist + apply. Callers
    // often `void` this, so the promise must never reject: a DB/IPC failure in
    // updateSettings or a misbehaving client must not surface as an unhandled
    // rejection (telemetry must never break the app).
    const revision = (preferenceRevisionRef.current += 1);
    setEnabledState(next);
    // Apply an opt-OUT immediately, before persistence: if the settings write
    // rejects, the client must still stop capturing (privacy). Opt-IN stays
    // gated behind a successful persist (and lazy client construction) below.
    if (!next && clientRef.current) {
      try {
        applyPreference(clientRef.current, false);
      } catch {
        // Telemetry never breaks preference updates.
      }
    }
    try {
      await updateSettings({ analyticsEnabled: next });
      // Opting in lazily constructs the client on first use, so a user who
      // opted out at startup (when we deliberately skip getAnalyticsClient) can
      // still opt in later without a reload.
      if (next && !clientRef.current) {
        const resolved = await getAnalyticsClient();
        // Bail if a newer toggle landed while the client was loading.
        if (revision !== preferenceRevisionRef.current) return;
        if (resolved) {
          clientRef.current = resolved;
          setClient(resolved);
        }
      }
      if (next && clientRef.current) applyPreference(clientRef.current, true);
    } catch {
      // Swallow — the in-memory preference still took effect above.
    }
  }, []);

  const track = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      const c = clientRef.current;
      if (!c || !enabled) return;
      try {
        c.capture(event, properties);
      } catch {
        // Telemetry never throws.
      }
    },
    [enabled],
  );

  const captureException = useCallback(
    (error: unknown, properties?: Record<string, unknown>) => {
      const c = clientRef.current;
      if (!c || !enabled) return;
      try {
        const err = error instanceof Error ? error : new Error(String(error));
        c.captureException(err, properties);
      } catch {
        // Telemetry never throws.
      }
    },
    [enabled],
  );

  const value = useMemo<AnalyticsContextValue>(
    () => ({ enabled, client, setEnabled, track, captureException }),
    [enabled, client, setEnabled, track, captureException],
  );

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}
