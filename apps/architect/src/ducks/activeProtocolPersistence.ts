import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { Locus } from './middleware/timeline';

// The persisted shape of the `activeProtocol` remembered key. The live slice is
// a full timeline (past/present/future); only the `present` is persisted — the
// past/future can hold up to 1000 protocol clones, which would bloat the tab's
// sessionStorage. On reload the present is restored into a fresh, empty-history
// timeline. The durable protocol content (including autosaved edits) always
// lives in IndexedDB regardless.
//
// The owning library id is stamped alongside the present so a reload can detect
// an id/present mismatch. redux-remember persists the `app` (which holds
// `activeProtocolId`) and `activeProtocol` keys non-atomically, so a reload that
// lands between the two writes can rehydrate a NEW id paired with the PREVIOUS
// protocol's present; without this stamp the autosave would flush that old
// content into the new library row.
type PersistedActiveProtocol = {
  present: CurrentProtocol | null;
  activeProtocolId: string | null;
};

// A view of the live timeline slice — enough to read `present` when serialising
// and to reconstruct an empty-history timeline when rehydrating. The rehydrated
// slice also carries the stamped `activeProtocolId` so the rehydrate reconcile
// can compare it against `app.activeProtocolId` before autosave runs.
type TimelineSlice = {
  past: CurrentProtocol[];
  present: CurrentProtocol | null;
  timeline: Locus[];
  future: CurrentProtocol[];
  futureTimeline: Locus[];
  activeProtocolId: string | null;
};

const emptyTimeline = (
  present: CurrentProtocol | null,
  activeProtocolId: string | null = null,
): TimelineSlice => ({
  past: [],
  present,
  timeline: [],
  future: [],
  futureTimeline: [],
  activeProtocolId,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readPresent = (value: unknown): CurrentProtocol | null =>
  isRecord(value) && 'present' in value
    ? (value.present as CurrentProtocol | null)
    : null;

const readStampedId = (value: unknown): string | null =>
  isRecord(value) &&
  'activeProtocolId' in value &&
  typeof value.activeProtocolId === 'string'
    ? value.activeProtocolId
    : null;

// Persist only the timeline `present` (not the up-to-1000-entry past/future
// history that would otherwise fill the tab's sessionStorage) and stamp the
// owning library id so rehydrate can reject a mismatched id/present pair.
export const serializeActiveProtocol = (
  data: unknown,
  activeProtocolId: string | null,
): string => {
  const payload: PersistedActiveProtocol = {
    present: readPresent(data),
    activeProtocolId,
  };
  return JSON.stringify(payload);
};

// Rebuild the persisted `{ present, activeProtocolId }` into a full,
// empty-history timeline slice so the timeline reducer and selectors see the
// shape they expect after reload. The stamped id is carried through so the
// rehydrate reconcile can validate it against `app.activeProtocolId`.
export const deserializeActiveProtocol = (raw: string): TimelineSlice => {
  const parsed: unknown = JSON.parse(raw);
  return emptyTimeline(readPresent(parsed), readStampedId(parsed));
};

type ReconciledActiveProtocol = {
  activeProtocol: TimelineSlice;
  // When the persisted present is discarded for a mismatched id, the paired
  // `app.activeProtocolId` is stale too; the caller clears it so autosave can't
  // later write into a row the present never belonged to.
  clearActiveProtocolId: boolean;
};

// Validate a rehydrated `activeProtocol` timeline against the rehydrated
// `app.activeProtocolId`, dropping the persisted `present` when its stamped
// library id does not match. A non-atomic cross-key persist can leave the two
// keys describing different protocols; rehydrating that pair would autosave one
// protocol's content into another's library row, so we discard the suspect
// present and signal the caller to clear the stale id. A legacy payload with no
// stamped id is left untouched.
export const reconcileRehydratedActiveProtocol = (
  activeProtocol: Pick<TimelineSlice, 'present'> &
    Partial<Pick<TimelineSlice, 'activeProtocolId'>>,
  appActiveProtocolId: string | null,
): ReconciledActiveProtocol => {
  const present = readPresent(activeProtocol);
  const stampedId = readStampedId(activeProtocol);

  if (present && stampedId !== null && stampedId !== appActiveProtocolId) {
    return {
      activeProtocol: emptyTimeline(null),
      clearActiveProtocolId: true,
    };
  }

  return {
    activeProtocol: emptyTimeline(present, stampedId),
    clearActiveProtocolId: false,
  };
};
