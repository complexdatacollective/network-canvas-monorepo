import {
  AuditActorKindSchema,
  AuditCategorySchema,
  AuditOutcomeSchema,
  type AuditEventDetail,
  type AuditEventSummary,
} from '@codaco/studio-rpc';

import { AUDIT_EVENT_REGISTRY } from './events.ts';
import type { StoredAuditEvent } from './store.ts';

// Server-controlled presentation for stored audit events. Interpretation is
// keyed by the raw `${eventType}@${eventVersion}` pair; a pair this build does
// not register — a row appended by a newer server — renders generically with
// its machine type and no details, never through another version's entry.

type RegistryEntry =
  (typeof AUDIT_EVENT_REGISTRY)[keyof typeof AUDIT_EVENT_REGISTRY];

function registryEntry(row: StoredAuditEvent): RegistryEntry | null {
  const key = `${row.eventType}@${row.eventVersion}`;
  return (
    (AUDIT_EVENT_REGISTRY as Record<string, RegistryEntry | undefined>)[key] ??
    null
  );
}

// The registry's per-version detailFields, minus sensitiveFields, is the wire
// allowlist for `details`.
function filteredDetails(
  entry: {
    detailFields: readonly string[];
    sensitiveFields: readonly string[];
  },
  details: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    entry.detailFields
      .filter((field) => !entry.sensitiveFields.includes(field))
      .filter((field) => field in details)
      .map((field) => [field, details[field]]),
  );
}

function reference(
  type: string | null,
  id: string | null,
  label: string | null,
): AuditEventSummary['subject'] {
  return type === null ? null : { type, id, label };
}

export function renderAuditEventSummary(
  row: StoredAuditEvent,
): AuditEventSummary {
  const entry = registryEntry(row);
  return {
    id: row.id,
    sequence: row.sequence,
    occurredAt: row.occurredAt,
    eventType: row.eventType,
    eventVersion: row.eventVersion,
    category: AuditCategorySchema.parse(row.category),
    outcome: AuditOutcomeSchema.parse(row.outcome),
    actor: {
      kind: AuditActorKindSchema.parse(row.actorKind),
      id: row.actorId,
      label: row.actorLabel,
    },
    subject: reference(row.subjectType, row.subjectId, row.subjectLabel),
    resource: reference(row.resourceType, row.resourceId, row.resourceLabel),
    title: entry?.title ?? row.eventType,
    rendered: entry !== null,
  };
}

export function renderAuditEventDetail(
  row: StoredAuditEvent,
): AuditEventDetail {
  const entry = registryEntry(row);
  return {
    ...renderAuditEventSummary(row),
    teamLabel: row.teamLabel,
    requestId: row.requestId,
    details: entry ? filteredDetails(entry, row.details) : {},
  };
}
