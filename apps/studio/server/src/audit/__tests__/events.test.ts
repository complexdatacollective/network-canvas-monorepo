import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_REGISTRY,
  auditEventDefinition,
  auditEventKey,
  AuditEventInputSchema,
  parseAuditEventInput,
  type AuditEventKey,
} from '../events.ts';

const retainedV2Key: AuditEventKey = 'team.invitation.cancelled@2';
// @ts-expect-error -- event versions belong only to their registered event type.
const invalidCrossProductKey: AuditEventKey = 'protocol.created@2';
void retainedV2Key;
void invalidCrossProductKey;

describe('audit event registry', () => {
  it('has a complete valid definition and fixture for every event type', () => {
    expect(Object.keys(AUDIT_EVENT_REGISTRY).toSorted()).toEqual([
      'protocol.created@1',
      'protocol.draft.committed@1',
      'security.denied_attempts.rate_limited@1',
      'team.invitation.acceptance_denied@1',
      'team.invitation.acceptance_failed@1',
      'team.invitation.accepted@1',
      'team.invitation.cancellation_denied@1',
      'team.invitation.cancelled@1',
      'team.invitation.cancelled@2',
      'team.invitation.created@1',
      'team.invitation.creation_denied@1',
      'team.member.role_change_denied@1',
      'team.member.role_change_failed@1',
      'team.member.role_changed@1',
    ]);

    const definitions = Object.entries(AUDIT_EVENT_REGISTRY);
    expect(definitions.length).toBeGreaterThan(0);
    for (const [key, definition] of definitions) {
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.detailFields.length).toBeGreaterThan(0);
      expect(definition.sensitiveFields).toEqual([]);
      expect(definition.createsAlert).toBe(
        key === 'security.denied_attempts.rate_limited@1',
      );
      const parsed = parseAuditEventInput(definition.fixture);
      expect(auditEventKey(parsed)).toBe(key);
      expect(auditEventDefinition(parsed)).toBe(definition);
    }
  });

  it('keeps rate-limit summaries bounded and timestamped', () => {
    const fixture =
      AUDIT_EVENT_REGISTRY['security.denied_attempts.rate_limited@1'].fixture;
    expect(parseAuditEventInput(fixture).details).toEqual({
      operation: 'team.updateMemberRole',
      suppressedCount: 3,
      firstSuppressedAt: '2026-08-31T10:00:00.000Z',
      lastSuppressedAt: '2026-08-31T10:00:42.000Z',
    });
    expect(() =>
      parseAuditEventInput({
        ...fixture,
        details: { ...fixture.details, suppressedCount: 0 },
      }),
    ).toThrow();
  });

  it('rejects an unknown retained-event version instead of applying v1 rules', () => {
    const v1 = AUDIT_EVENT_REGISTRY['team.invitation.created@1'].fixture;
    expect(() => parseAuditEventInput({ ...v1, eventVersion: 2 })).toThrow(
      'unregistered audit event definition: team.invitation.created@2',
    );
  });

  it('rejects unregistered fields and overlong display snapshots', () => {
    const fixture = AUDIT_EVENT_REGISTRY['team.invitation.created@1'].fixture;
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
    expect(() =>
      AuditEventInputSchema.parse({
        ...fixture,
        teamLabel: 'x'.repeat(321),
      }),
    ).toThrow();
  });
});
