import { Redacted, Schema } from 'effect';

import {
  AuditActorKind,
  AuditCategory,
  type AuditEventDetail,
  type AuditEventSummary,
  AuditOutcome,
} from '@codaco/studio-contract/schema/audit';

import { AUDIT_EVENT_REGISTRY } from './events.ts';
import type { StoredAuditEvent } from './store.ts';

type RenderedSummary = Omit<(typeof AuditEventSummary)['Type'], 'id'> & {
  readonly id: string;
};
type RenderedDetail = RenderedSummary &
  Omit<(typeof AuditEventDetail)['Type'], keyof RenderedSummary>;

const decodeCategory = Schema.decodeUnknownSync(AuditCategory);
const decodeOutcome = Schema.decodeUnknownSync(AuditOutcome);
const decodeActorKind = Schema.decodeUnknownSync(AuditActorKind);

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
// allowlist for `details`. Presence is an own-property test: `in` would walk
// the prototype chain, so an allowlist entry sharing an Object.prototype name
// would emit an inherited member that the stored event never recorded.
function filteredDetails(
  entry: {
    detailFields: readonly string[];
    sensitiveFields: readonly string[];
  },
  details: Redacted.Redacted<Record<string, unknown>>,
): Redacted.Redacted<Record<string, unknown>> {
  const recorded = Redacted.value(details);
  return Redacted.make(
    Object.fromEntries(
      entry.detailFields
        .filter((field) => !entry.sensitiveFields.includes(field))
        .filter((field) => Object.hasOwn(recorded, field))
        .map((field) => [field, recorded[field]]),
    ),
  );
}

function reference(
  type: string | null,
  id: string | null,
  label: Redacted.Redacted | null,
): RenderedSummary['subject'] {
  return type === null ? null : { type, id, label };
}

export function renderAuditEventSummary(
  row: StoredAuditEvent,
): RenderedSummary {
  const entry = registryEntry(row);
  return {
    id: row.id,
    sequence: row.sequence,
    occurredAt: row.occurredAt,
    eventType: row.eventType,
    eventVersion: row.eventVersion,
    category: decodeCategory(row.category),
    outcome: decodeOutcome(row.outcome),
    actor: {
      kind: decodeActorKind(row.actorKind),
      id: row.actorId,
      label: row.actorLabel,
    },
    subject: reference(row.subjectType, row.subjectId, row.subjectLabel),
    resource: reference(row.resourceType, row.resourceId, row.resourceLabel),
    title: entry?.title ?? row.eventType,
    rendered: entry !== null,
  };
}

export function renderAuditEventDetail(row: StoredAuditEvent): RenderedDetail {
  const entry = registryEntry(row);
  return {
    ...renderAuditEventSummary(row),
    teamLabel: row.teamLabel,
    requestId: row.requestId,
    details: entry ? filteredDetails(entry, row.details) : Redacted.make({}),
  };
}
