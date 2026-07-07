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

export type UseAppUpdateOptions = {
  app: AppId;
  currentVersion: string;
  needRefresh: boolean;
  hasUnsavedWork: boolean;
  installUpdate: () => void;
};

export type UseAppUpdateResult = {
  status: UpdateStatus;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  install: () => void;
};

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
  const hasUnsavedWorkRef = useRef(hasUnsavedWork);
  hasUnsavedWorkRef.current = hasUnsavedWork;

  // Version-change detection runs exactly once.
  useEffect(() => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    setJustUpdated(detectJustUpdated(app, currentVersion));
  }, [app, currentVersion]);

  // One-shot auto-apply: the first time an update is pending while no work is in
  // progress, apply it (which reloads). Later detections, or one arriving while
  // work is in progress, fall through to the manual button.
  useEffect(() => {
    if (!needRefresh || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    if (!hasUnsavedWorkRef.current) installUpdate();
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
