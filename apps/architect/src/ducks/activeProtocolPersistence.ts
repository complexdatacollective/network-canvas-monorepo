import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { Locus } from './middleware/timeline';

// The live `activeProtocol` slice is a full undo timeline (past/present/future),
// but only the `present` is persisted: the past/future can hold up to 1000
// protocol clones, which would bloat the tab's sessionStorage. On reload the
// present is restored into a fresh, empty-history timeline. The durable protocol
// content (including autosaved edits) always lives in IndexedDB regardless.
type PersistedActiveProtocol = {
  present: CurrentProtocol | null;
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

const readPresent = (value: unknown): CurrentProtocol | null =>
  isRecord(value) && 'present' in value
    ? (value.present as CurrentProtocol | null)
    : null;

// Persist only the timeline `present`, dropping the up-to-1000-entry past/future
// history that would otherwise fill the tab's sessionStorage.
export const serializeActiveProtocol = (data: unknown): string => {
  const payload: PersistedActiveProtocol = { present: readPresent(data) };
  return JSON.stringify(payload);
};

// Rebuild the persisted `{ present }` into a full, empty-history timeline slice
// so the timeline reducer and selectors see the shape they expect after reload.
export const deserializeActiveProtocol = (raw: string): TimelineSlice => {
  const parsed: unknown = JSON.parse(raw);
  return emptyTimeline(readPresent(parsed));
};
