import type { AuditFilterOptions } from '@codaco/studio-rpc';

import { AUDIT_EVENT_REGISTRY } from './events.ts';
import type { AuditFacets } from './store.ts';

// Server-controlled presentation for the activity screen's filter values, the
// same way render.ts is for events. Kept out of render.ts because a facet is a
// bare event_type with no version: the store's distinct scan cannot carry one,
// and the registry is keyed by the `${eventType}@${eventVersion}` pair.

const TITLES_BY_EVENT_TYPE: ReadonlyMap<string, string> = new Map(
  // Ascending by version, so the highest registered version is the last write
  // and supplies the filter label for a retitled newer version. An event_type
  // this build does not register — a row appended by a newer server — falls
  // back to its machine type, the same fallback renderAuditEventSummary
  // applies to the row itself.
  Object.entries(AUDIT_EVENT_REGISTRY)
    .map(([key, entry]) => {
      const at = key.lastIndexOf('@');
      return {
        eventType: key.slice(0, at),
        version: Number(key.slice(at + 1)),
        title: entry.title,
      };
    })
    .toSorted((a, b) => a.version - b.version)
    .map(({ eventType, title }) => [eventType, title] as const),
);

export function renderAuditFilterOptions(
  facets: AuditFacets,
): AuditFilterOptions {
  return {
    actions: facets.eventTypes.map((eventType) => ({
      eventType,
      title: TITLES_BY_EVENT_TYPE.get(eventType) ?? eventType,
    })),
    actors: facets.actors,
    truncated: facets.truncated,
  };
}
