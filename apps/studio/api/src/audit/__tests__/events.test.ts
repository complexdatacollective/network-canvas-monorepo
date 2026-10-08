import { Redacted, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_PARSE_OPTIONS,
  AUDIT_EVENT_REGISTRY,
  auditEventDefinition,
  auditEventKey,
  AuditEventInputSchema,
  encodeAuditEventInput,
  parseAuditEventInput,
  type AuditEventKey,
} from '../events.ts';

const retainedV2Key: AuditEventKey = 'team.invitation.cancelled@2';
// @ts-expect-error -- event versions belong only to their registered event type.
const invalidCrossProductKey: AuditEventKey = 'protocol.created@2';
void retainedV2Key;
void invalidCrossProductKey;

const decodeUnion = Schema.decodeUnknownSync(
  AuditEventInputSchema,
  AUDIT_EVENT_PARSE_OPTIONS,
);

describe('audit event registry', () => {
  it('has a complete valid definition and fixture for every event type', () => {
    expect(Object.keys(AUDIT_EVENT_REGISTRY).toSorted()).toEqual([
      'audit.read_denied@1',
      'interview.completed@1',
      'interview.started@1',
      'protocol.created@1',
      'protocol.draft.committed@1',
      'security.denied_attempts.rate_limited@1',
      'study.created@1',
      'study.creation_denied@1',
      'team.invitation.acceptance_denied@1',
      'team.invitation.acceptance_failed@1',
      'team.invitation.accepted@1',
      'team.invitation.cancellation_denied@1',
      'team.invitation.cancellation_failed@1',
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
      expect(Redacted.isRedacted(parsed.teamLabel)).toBe(true);
      expect(Redacted.isRedacted(parsed.actorLabel)).toBe(true);
      expect(encodeAuditEventInput(parsed)).toEqual(definition.fixture);
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
      decodeUnion({
        ...fixture,
        invitationToken: 'must-never-be-recorded',
      }),
    ).toThrow();
    expect(() =>
      decodeUnion({
        ...fixture,
        details: { role: 'member', rawRequest: { password: 'secret' } },
      }),
    ).toThrow();
    expect(() =>
      decodeUnion({
        ...fixture,
        subjectLabel: `${'x'.repeat(321)}@example.com`,
      }),
    ).toThrow();
    expect(() =>
      decodeUnion({
        ...fixture,
        teamLabel: 'x'.repeat(321),
      }),
    ).toThrow();
  });
  it('decodes every fixture through the union to what its own definition decodes', () => {
    for (const definition of Object.values(AUDIT_EVENT_REGISTRY)) {
      expect(encodeAuditEventInput(decodeUnion(definition.fixture))).toEqual(
        encodeAuditEventInput(parseAuditEventInput(definition.fixture)),
      );
    }
    const v1 = AUDIT_EVENT_REGISTRY['team.invitation.cancelled@1'].fixture;
    const v2 = AUDIT_EVENT_REGISTRY['team.invitation.cancelled@2'].fixture;
    expect(decodeUnion(v1).details).toEqual({ role: 'member' });
    expect(decodeUnion(v2).details).toEqual({ roles: ['admin', 'member'] });
    expect(() => decodeUnion({ ...v1, details: v2.details })).toThrow();
    expect(() => decodeUnion({ ...v2, details: v1.details })).toThrow();
  });

  it('refuses an undeclared key at the top level and inside details', () => {
    const fixture = AUDIT_EVENT_REGISTRY['team.invitation.created@1'].fixture;
    expect(encodeAuditEventInput(parseAuditEventInput(fixture))).toEqual(
      fixture,
    );
    expect(() =>
      parseAuditEventInput({ ...fixture, invitationToken: 'secret' }),
    ).toThrow();
    expect(() =>
      parseAuditEventInput({
        ...fixture,
        details: { ...fixture.details, rawRequest: 'secret' },
      }),
    ).toThrow();
  });

  it('bounds an email subject label at 320 characters', () => {
    const fixture = AUDIT_EVENT_REGISTRY['team.invitation.created@1'].fixture;
    const address = (length: number) =>
      `${'a'.repeat(length - '@example.com'.length)}@example.com`;
    const { subjectLabel } = parseAuditEventInput({
      ...fixture,
      subjectLabel: address(320),
    });
    expect(subjectLabel === null ? null : Redacted.value(subjectLabel)).toBe(
      address(320),
    );
    expect(() =>
      parseAuditEventInput({ ...fixture, subjectLabel: address(321) }),
    ).toThrow();
  });

  it('holds requestId to the uuid rule z.uuid() applied', () => {
    const fixture = AUDIT_EVENT_REGISTRY['protocol.created@1'].fixture;
    const accepts = (requestId: string) =>
      parseAuditEventInput({ ...fixture, requestId }).requestId === requestId;
    expect(accepts('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(accepts('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11')).toBe(true);
    expect(accepts('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(accepts('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
    for (const requestId of [
      'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-9000-8000-000000000001',
      '00000000-0000-4000-c000-000000000001',
      '00000000000040008000000000000001',
      'not-a-uuid',
    ]) {
      expect(
        () => parseAuditEventInput({ ...fixture, requestId }),
        requestId,
      ).toThrow();
    }
  });

  it('holds suppression timestamps to an offset date-time', () => {
    const fixture =
      AUDIT_EVENT_REGISTRY['security.denied_attempts.rate_limited@1'].fixture;
    const withFirst = (firstSuppressedAt: string) => ({
      ...fixture,
      details: { ...fixture.details, firstSuppressedAt },
    });
    for (const accepted of [
      '2026-08-31T10:00:42.000Z',
      '2026-08-31T10:00:42+02:00',
      '2028-02-29T00:00:00Z',
    ]) {
      expect(
        parseAuditEventInput(withFirst(accepted)).details,
        accepted,
      ).toMatchObject({ firstSuppressedAt: accepted });
    }
    for (const refused of [
      '2026-08-31',
      '2026-08-31T10:00Z',
      '2026-08-31T10:00:42',
      '2026-08-31T10:00:42+0200',
      '2026-02-29T10:00:42Z',
    ]) {
      expect(() => parseAuditEventInput(withFirst(refused)), refused).toThrow();
    }
  });

  it('holds every bound the zod schemas carried', () => {
    const withDetails = <Key extends AuditEventKey>(
      key: Key,
      details: Record<string, unknown>,
    ) => {
      const fixture = AUDIT_EVENT_REGISTRY[key].fixture;
      return { ...fixture, details: { ...fixture.details, ...details } };
    };
    const withField = (field: string, value: unknown) => ({
      ...AUDIT_EVENT_REGISTRY['protocol.created@1'].fixture,
      [field]: value,
    });
    const roles = (newRoles: readonly string[]) =>
      withDetails('team.member.role_changed@1', { newRoles });
    const committed = (details: Record<string, unknown>) =>
      withDetails('protocol.draft.committed@1', details);
    const sections = (count: number) =>
      Array.from({ length: count }, (_, index) => `stage:${index}`);
    const cases: [string, unknown, boolean][] = [
      ['three roles', roles(['owner', 'admin', 'member']), true],
      ['four roles', roles(['owner', 'admin', 'member', 'member']), false],
      ['no roles', roles([]), false],
      ['a 20-digit revision', committed({ revision: '1'.repeat(20) }), true],
      ['a 21-digit revision', committed({ revision: '1'.repeat(21) }), false],
      ['a 255-character id', withField('teamId', 'x'.repeat(255)), true],
      ['a 256-character id', withField('teamId', 'x'.repeat(256)), false],
      ['an empty id', withField('teamId', ''), false],
      [
        'a fractional suppressed count',
        withDetails('security.denied_attempts.rate_limited@1', {
          suppressedCount: 1.5,
        }),
        false,
      ],
      ['1000 operations', committed({ operationCount: 1_000 }), true],
      ['1001 operations', committed({ operationCount: 1_001 }), false],
      ['128 sections', committed({ affectedSectionIds: sections(128) }), true],
      ['129 sections', committed({ affectedSectionIds: sections(129) }), false],
      ['no sections', committed({ affectedSectionIds: [] }), false],
      [
        'seven operation types',
        committed({ operationTypes: Array(7).fill('set') }),
        true,
      ],
      [
        'eight operation types',
        committed({ operationTypes: Array(8).fill('set') }),
        false,
      ],
      ['no operation types', committed({ operationTypes: [] }), false],
      ['a zero revision', committed({ revision: '0' }), true],
      ['a zero-padded revision', committed({ revision: '01' }), false],
      ['an empty label', withField('teamLabel', ''), false],
      [
        'an unknown participation mode',
        withDetails('study.created@1', { participationMode: 'broadcast' }),
        false,
      ],
      [
        'a v2 cancellation labelled with a non-address',
        {
          ...AUDIT_EVENT_REGISTRY['team.invitation.cancelled@2'].fixture,
          subjectLabel: 'Fixture invitee',
        },
        false,
      ],
    ];
    for (const [label, input, accepted] of cases) {
      if (accepted) {
        expect(
          encodeAuditEventInput(parseAuditEventInput(input)),
          label,
        ).toEqual(input);
      } else {
        expect(() => parseAuditEventInput(input), label).toThrow();
      }
    }
  });
});
