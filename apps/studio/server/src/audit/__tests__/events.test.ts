import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_REGISTRY,
  AuditEventInputSchema,
  parseAuditEventInput,
} from '../events.ts';

describe('audit event registry', () => {
  it('has a complete valid definition and fixture for every event type', () => {
    expect(Object.keys(AUDIT_EVENT_REGISTRY).toSorted()).toEqual([
      'team.invitation.cancelled',
      'team.invitation.created',
      'team.member.role_change_denied',
      'team.member.role_changed',
    ]);

    for (const [eventType, definition] of Object.entries(
      AUDIT_EVENT_REGISTRY,
    )) {
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.detailFields.length).toBeGreaterThan(0);
      expect(definition.sensitiveFields).toEqual([]);
      expect(definition.createsAlert).toBe(false);
      expect(parseAuditEventInput(definition.fixture).eventType).toBe(
        eventType,
      );
    }
  });

  it('rejects unregistered fields and overlong display snapshots', () => {
    const fixture = AUDIT_EVENT_REGISTRY['team.invitation.created'].fixture;
    expect(() =>
      AuditEventInputSchema.parse({
        ...fixture,
        invitationToken: 'must-never-be-recorded',
      }),
    ).toThrow();
    expect(() =>
      AuditEventInputSchema.parse({
        ...fixture,
        details: { role: 'member', rawRequest: { password: 'secret' } },
      }),
    ).toThrow();
    expect(() =>
      AuditEventInputSchema.parse({
        ...fixture,
        subjectLabel: `${'x'.repeat(321)}@example.com`,
      }),
    ).toThrow();
  });
});
