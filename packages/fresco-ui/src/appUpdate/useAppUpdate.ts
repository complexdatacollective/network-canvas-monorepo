import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AppId,
  fetchLatestReleaseNotes,
  fetchReleaseNotesForVersion,
  readCachedNotes,
  type ReleaseNotes,
  writeCachedNotes,
} from './releaseNotes';

export type { AppId, ReleaseNotes };

export type UpdateStatus = 'idle' | 'available' | 'updated';
export type InstallAppUpdate = () => boolean | void | Promise<boolean | void>;

export type UseAppUpdateOptions = {
  app: AppId;
  currentVersion: string;
  needRefresh: boolean;
  installUpdate: InstallAppUpdate;
  /** @deprecated Updates are never installed automatically. */
  hasUnsavedWork?: boolean;
  /** @deprecated Updates are never installed automatically. */
  checkUnsavedWork?: () => boolean;
  /** @deprecated Updates are never installed automatically. */
  autoApplyWindowMs?: number;
};

export type UseAppUpdateResult = {
  status: UpdateStatus;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  install: InstallAppUpdate;
};

const lastVersionKey = (app: AppId) => `nc:lastLaunchedVersion:${app}`;
const pendingUpdateKey = (app: AppId) => `nc:pendingAppUpdate:${app}`;

/** @deprecated Updates are never installed automatically. */
export const FRESH_LOAD_AUTO_APPLY_MS = 20_000;

// Records the current version and reports whether the previous launch ran a
// different one. Called once (guarded by a ref) so the write happens exactly
// once per mount.
function detectJustUpdated(app: AppId, currentVersion: string): boolean {
  try {
    const previous = localStorage.getItem(lastVersionKey(app));
    const requestedUpdate =
      localStorage.getItem(pendingUpdateKey(app)) !== null;
    localStorage.removeItem(pendingUpdateKey(app));
    localStorage.setItem(lastVersionKey(app), currentVersion);
    return (
      requestedUpdate || (previous !== null && previous !== currentVersion)
    );
  } catch {
    return false;
  }
}

export default function useAppUpdate({
  app,
  currentVersion,
  needRefresh,
  installUpdate,
}: UseAppUpdateOptions): UseAppUpdateResult {
  const [justUpdated, setJustUpdated] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<
    ReleaseNotes | 'loading' | null
  >(() => readCachedNotes(app));
  const [availableVersion, setAvailableVersion] = useState<
    string | undefined
  >();

  const detectedRef = useRef(false);

  // Version-change detection runs exactly once.
  useEffect(() => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    setJustUpdated(detectJustUpdated(app, currentVersion));
  }, [app, currentVersion]);

  // An available update means we just completed an online SW check — fetch the
  // latest notes and cache them so the dialog (and the post-reload "updated"
  // state) can read them offline.
  useEffect(() => {
    if (!needRefresh) return undefined;
    let active = true;
    setReleaseNotes((prev) => (prev && prev !== 'loading' ? prev : 'loading'));
    void fetchLatestReleaseNotes(app).then((notes) => {
      if (!active) return undefined;
      if (!notes) {
        // Fetch failed (offline / rate-limited / release not yet published):
        // fall back to "unavailable" rather than a stuck loading state, but keep
        // any good cached value we already had.
        setReleaseNotes((prev) => (prev === 'loading' ? null : prev));
        return undefined;
      }
      writeCachedNotes(app, notes);
      setReleaseNotes(notes);
      setAvailableVersion(notes.version);
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [needRefresh, app]);

  // On a "just updated" load, prefer the cached notes for the running version
  // (written when it was "available"); otherwise fetch them by tag.
  useEffect(() => {
    if (!justUpdated) return undefined;
    const cached = readCachedNotes(app);
    if (cached && cached.version === currentVersion) {
      setReleaseNotes(cached);
      return undefined;
    }
    let active = true;
    setReleaseNotes('loading');
    void fetchReleaseNotesForVersion(app, currentVersion).then((notes) => {
      if (!active) return undefined;
      if (!notes) {
        setReleaseNotes((prev) => (prev === 'loading' ? null : prev));
        return undefined;
      }
      writeCachedNotes(app, notes);
      setReleaseNotes(notes);
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [justUpdated, app, currentVersion]);

  const status: UpdateStatus = needRefresh
    ? 'available'
    : justUpdated
      ? 'updated'
      : 'idle';

  const install = useCallback(async () => {
    try {
      localStorage.setItem(pendingUpdateKey(app), currentVersion);
    } catch {
      // The update can still be installed when storage is unavailable; only
      // the post-reload "recently updated" state will be unavailable.
    }

    try {
      const result = await installUpdate();
      if (result === false) {
        try {
          localStorage.removeItem(pendingUpdateKey(app));
        } catch {
          // Storage is best-effort, as above.
        }
      }
      return result;
    } catch (error) {
      try {
        localStorage.removeItem(pendingUpdateKey(app));
      } catch {
        // Storage is best-effort, as above.
      }
      throw error;
    }
  }, [app, currentVersion, installUpdate]);

  return { status, availableVersion, releaseNotes, install };
}
