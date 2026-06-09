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

import { useAuth } from '~/lib/auth/AuthContext';
import { getSettings, updateSettings } from '~/lib/db/api';
import { APP_VERSION } from '~/lib/platform/appVersion';
import { getInstallationId } from '~/lib/platform/installationId';
import { hostAppName } from '~/lib/platform/platform';

import { getAnalyticsClient } from './client';
import { writeNativeAnalyticsPreference } from './nativePreference';

export type AnalyticsContextValue = {
  // Current opt-in state, sourced from StoredSettings.analyticsEnabled.
  enabled: boolean;
  // The shared posthog-js client, or null if it failed to load. Passed to the
  // `@codaco/interview` Shell so interview-engine events use the same instance.
  client: PostHog | null;
  // Persist a new preference and apply it immediately (opt in/out + native).
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
    app: hostAppName,
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

  // Load the stored preference once the app is unlocked, then initialise the
  // client and apply. Reading settings is DB-backed; on Electron the SQLCipher
  // database is only open after unlock, so we must wait for that. Analytics
  // stays opted out (the safe default) until then. Re-runs on a lock/unlock
  // cycle are idempotent.
  useEffect(() => {
    if (kind !== 'unlocked') return;
    let active = true;
    const init = async () => {
      try {
        const [settings, resolved] = await Promise.all([
          getSettings(),
          getAnalyticsClient(),
        ]);
        if (!active) return;
        clientRef.current = resolved;
        setClient(resolved);
        setEnabledState(settings.analyticsEnabled);
        if (resolved) applyPreference(resolved, settings.analyticsEnabled);
        void writeNativeAnalyticsPreference(settings.analyticsEnabled);
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
    await updateSettings({ analyticsEnabled: next });
    setEnabledState(next);
    if (clientRef.current) applyPreference(clientRef.current, next);
    await writeNativeAnalyticsPreference(next);
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
