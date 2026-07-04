import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { Locus } from './middleware/timeline';

// The persisted shape of the `activeProtocol` remembered key. The live slice is
// a full timeline (past/present/future); we persist only the `present` plus the
// owning library id so a reload can (a) not carry a multi-megabyte undo history
// into localStorage and (b) detect a cross-tab id/present mismatch.
type PersistedActiveProtocol = {
  present: CurrentProtocol | null;
  activeProtocolId: string | null;
};

// A view of the live timeline slice — enough to read `present` when serialising
// and to reconstruct an empty-history timeline when rehydrating.
type TimelineSlice = {
  past: CurrentProtocol[];
  present: CurrentProtocol | null;
  timeline: Locus[];
  future: CurrentProtocol[];
  futureTimeline: Locus[];
};

const emptyTimeline = (present: CurrentProtocol | null): TimelineSlice => ({
  past: [],
  present,
  timeline: [],
  future: [],
  futureTimeline: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Persist only the timeline `present` (not the up-to-1000-entry past/future
// history that otherwise fills localStorage until setItem throws) and stamp the
// owning library id so rehydrate can reject a cross-tab mismatch.
export const serializeActiveProtocol = (
  data: unknown,
  activeProtocolId: string | null,
): string => {
  const present =
    isRecord(data) && 'present' in data
      ? (data.present as CurrentProtocol | null)
      : null;

  const payload: PersistedActiveProtocol = { present, activeProtocolId };
  return JSON.stringify(payload);
};

type ReconciledActiveProtocol = {
  activeProtocol: TimelineSlice;
  // When the persisted present is discarded for a mismatched id, the paired
  // `app.activeProtocolId` is stale too; the caller clears it so autosave can't
  // later write into a row the present never belonged to.
  clearActiveProtocolId: boolean;
};

// Normalise a rehydrated `activeProtocol` value into a full (empty-history)
// timeline, dropping the persisted `present` when its stamped library id does
// not match `app.activeProtocolId`. A partial cross-tab write can leave the two
// keys describing different protocols; rehydrating that pair would autosave one
// protocol's content into another's library row, so we discard the suspect
// present and the stale id.
export const reconcileRehydratedActiveProtocol = (
  activeProtocol: unknown,
  appActiveProtocolId: string | null,
): ReconciledActiveProtocol => {
  if (isRecord(activeProtocol) && 'present' in activeProtocol) {
    const present = activeProtocol.present as CurrentProtocol | null;
    const stampedId =
      'activeProtocolId' in activeProtocol &&
      typeof activeProtocol.activeProtocolId === 'string'
        ? activeProtocol.activeProtocolId
        : null;

    if (present && stampedId !== null && stampedId !== appActiveProtocolId) {
      return {
        activeProtocol: emptyTimeline(null),
        clearActiveProtocolId: true,
      };
    }

    return {
      activeProtocol: emptyTimeline(present),
      clearActiveProtocolId: false,
    };
  }

  return { activeProtocol: emptyTimeline(null), clearActiveProtocolId: false };
};
