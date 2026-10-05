import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { renderAuditEventDetail } from '../render.ts';
import type { StoredAuditEvent } from '../store.ts';

function storedEvent(details: Record<string, unknown>): StoredAuditEvent {
  return {
    id: randomUUID(),
    teamId: 'render-team',
    teamLabel: 'Render Team',
    sequence: '1',
    occurredAt: new Date('2026-08-30T10:00:00.000Z'),
    eventType: 'audit.read_denied',
    eventVersion: 1,
    category: 'audit',
    outcome: 'denied',
    actorKind: 'user',
    actorId: 'render-user',
    actorLabel: 'Render User',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    requestId: randomUUID(),
    details,
  };
}

describe('renderAuditEventDetail details allowlist', () => {
  it('emits allowlisted fields the stored event actually owns', () => {
    // 'audit.read_denied@1' allowlists exactly ['procedure', 'reason'].
    const rendered = renderAuditEventDetail(
      storedEvent({
        procedure: 'audit.list',
        reason: 'insufficient_permission',
        notAllowlisted: 'dropped',
      }),
    );

    expect(rendered.details).toEqual({
      procedure: 'audit.list',
      reason: 'insufficient_permission',
    });
  });

  it('does not emit allowlisted fields inherited from the prototype chain', () => {
    // The allowlist filter must be an own-property test. A `field in details`
    // check walks the prototype chain, so an allowlist entry that shares an
    // Object.prototype name (`toString`, `constructor`, `valueOf`) would read
    // as present and emit a value the stored event never recorded. This row
    // stands in for that shape: `procedure` and `reason` resolve only through
    // the prototype, so an own-property filter must drop both.
    const inherited = Object.create({
      procedure: 'not-recorded',
      reason: 'not-recorded',
    }) as Record<string, unknown>;

    const rendered = renderAuditEventDetail(storedEvent(inherited));

    expect(rendered.details).toEqual({});
  });
});
