import { useEffect, useRef, useState } from 'react';

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
  hasUnsavedWork: boolean;
  installUpdate: InstallAppUpdate;
  /**
   * How long after mount an update may still be auto-applied. Auto-apply is for
   * updates present at (or detected shortly after) a fresh load; an update the
   * hourly poll surfaces later in a long-lived session is not reloaded under the
   * user — it waits behind the manual button. Defaults to
   * {@link FRESH_LOAD_AUTO_APPLY_MS}.
   */
  autoApplyWindowMs?: number;
};

export type UseAppUpdateResult = {
  status: UpdateStatus;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  install: InstallAppUpdate;
};

// Auto-apply is a fresh-load affordance: an update already waiting when the app
// loads (or one the initial service-worker check surfaces within this window) is
// applied automatically when no work is in progress. After the window closes,
// updates found by the hourly poll surface the manual button instead of
// reloading a long-lived idle session.
export const FRESH_LOAD_AUTO_APPLY_MS = 20_000;

const lastVersionKey = (app: AppId) => `nc:lastLaunchedVersion:${app}`;

// Records the current version and reports whether the previous launch ran a
// different one. Called once (guarded by a ref) so the write happens exactly
// once per mount.
function detectJustUpdated(app: AppId, currentVersion: string): boolean {
  try {
    const previous = localStorage.getItem(lastVersionKey(app));
    localStorage.setItem(lastVersionKey(app), currentVersion);
    return previous !== null && previous !== currentVersion;
  } catch {
    return false;
  }
}

export default function useAppUpdate({
  app,
  currentVersion,
  needRefresh,
  hasUnsavedWork,
  installUpdate,
  autoApplyWindowMs = FRESH_LOAD_AUTO_APPLY_MS,
}: UseAppUpdateOptions): UseAppUpdateResult {
  const [justUpdated, setJustUpdated] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<
    ReleaseNotes | 'loading' | null
  >(() => readCachedNotes(app));
  const [availableVersion, setAvailableVersion] = useState<
    string | undefined
  >();

  const detectedRef = useRef(false);
  const autoAppliedRef = useRef(false);
  const freshLoadWindowOpenRef = useRef(true);
  const hasUnsavedWorkRef = useRef(hasUnsavedWork);
  hasUnsavedWorkRef.current = hasUnsavedWork;

  // Version-change detection runs exactly once.
  useEffect(() => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    setJustUpdated(detectJustUpdated(app, currentVersion));
  }, [app, currentVersion]);

  // Close the fresh-load auto-apply window a short time after mount.
  useEffect(() => {
    const id = window.setTimeout(() => {
      freshLoadWindowOpenRef.current = false;
    }, autoApplyWindowMs);
    return () => window.clearTimeout(id);
  }, [autoApplyWindowMs]);

  // One-shot auto-apply, limited to a fresh load: the first time an update is
  // pending, apply it only if we're still within the fresh-load window and no
  // work is in progress. An update surfaced later (the hourly poll, or one that
  // arrives while work is in progress) falls through to the manual button.
  useEffect(() => {
    if (!needRefresh || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    if (freshLoadWindowOpenRef.current && !hasUnsavedWorkRef.current) {
      void Promise.resolve()
        .then(installUpdate)
        .catch(() => {
          // Leave needRefresh unchanged so the user can retry manually.
        });
    }
  }, [needRefresh, installUpdate]);

  // An available update means we just completed an online SW check — fetch the
  // latest notes and cache them so the dialog (and the post-reload "updated"
  // state) can read them offline.
  useEffect(() => {
    if (!needRefresh) return undefined;
    let active = true;
    setReleaseNotes((prev) => (prev && prev !== 'loading' ? prev : 'loading'));
    void fetchLatestReleaseNotes(app).then((notes) => {
      if (!active) return;
      if (!notes) {
        // Fetch failed (offline / rate-limited / release not yet published):
        // fall back to "unavailable" rather than a stuck loading state, but keep
        // any good cached value we already had.
        setReleaseNotes((prev) => (prev === 'loading' ? null : prev));
        return;
      }
      writeCachedNotes(app, notes);
      setReleaseNotes(notes);
      setAvailableVersion(notes.version);
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
      if (!active) return;
      if (!notes) {
        setReleaseNotes((prev) => (prev === 'loading' ? null : prev));
        return;
      }
      writeCachedNotes(app, notes);
      setReleaseNotes(notes);
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

  return { status, availableVersion, releaseNotes, install: installUpdate };
}
