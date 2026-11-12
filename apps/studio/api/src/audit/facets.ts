import type { AuditFilterOptions } from '@codaco/studio-contract/schema/audit';

import type { AuditFacets } from './store.ts';

// The activity screen's filter values, as the store found them. Each is a bare
// event_type: the client names it in the reader's language, and one this
// build does not register — a row appended by a newer server — reaches it
// unnamed, the same way renderAuditEventSummary leaves such a row.
export function renderAuditFilterOptions(
  facets: AuditFacets,
): AuditFilterOptions {
  return {
    eventTypes: facets.eventTypes,
    actors: facets.actors,
    truncated: facets.truncated,
  };
}
