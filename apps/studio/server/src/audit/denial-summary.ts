import {
  appendAuditedEvent,
  deniedAuditEventContext,
  type AuditedCommandContext,
} from './command.ts';
import type { DeniedAuditSummary } from './denial-rate-limit.ts';
import type { DeniedAuditOperation } from './events.ts';

export function createDeniedAuditSummaryWriter(
  context: AuditedCommandContext,
  operation: DeniedAuditOperation,
): (summary: DeniedAuditSummary) => Promise<void> {
  return (summary) =>
    appendAuditedEvent(context, (auditContext) => ({
      ...deniedAuditEventContext(auditContext),
      eventType: 'security.denied_attempts.rate_limited',
      category: 'security',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      details: {
        operation,
        suppressedCount: summary.suppressedCount,
        firstSuppressedAt: new Date(summary.firstSuppressedAt).toISOString(),
        lastSuppressedAt: new Date(summary.lastSuppressedAt).toISOString(),
      },
    }));
}
