import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { Me, UpdateAccountLocaleResult } from '../schema/account.ts';
import {
  AuditEventDetail,
  AuditEventSummary,
  AuditFilterOptions,
  AuditListInput,
  AuditListOutput,
} from '../schema/audit.ts';
import { StudyId, TeamId } from '../schema/ids.ts';
import {
  ManifestRevision,
  ProtocolDraft,
  ProtocolSummary,
} from '../schema/protocol.ts';
import { CompleteSetupResult } from '../schema/setup.ts';
import { InstanceStatus } from '../schema/status.ts';
import { StudyDetail, StudySummary } from '../schema/study.ts';
import {
  AcceptTeamInvitationResult,
  CreateTeamInvitationResult,
} from '../schema/team.ts';

// What a Studio client actually receives. The rpc transport encodes every
// payload, success and error through `Schema.toCodecJson(schema)` — that is
// the `codecFor` `RpcServer` installs — so encoding through the same codec
// here is the wire, not an approximation of it.
//
// The expected documents are written out in full rather than derived from the
// schemas, because the point of each is that a field the contract never
// declared cannot appear and a field it declares cannot silently change shape.

// The service channels are pinned to `never` so that the sync parsers accept
// the derived codec: a contract schema that grew a service requirement would
// stop compiling here rather than be encoded by something else at runtime.
const encode = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Schema.encodeUnknownSync(Schema.toCodecJson(schema));
const decode = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Schema.decodeUnknownSync(Schema.toCodecJson(schema));

const STUDY_UUID = '3f1b2c8e-6a4d-4f5b-9c2e-7d8a1b0c3e4f';
const PROTOCOL_UUID = '5c4b3a29-1d0e-4f8a-9b7c-6d5e4f3a2b1c';
const DRAFT_UUID = '9b7c6d5e-4f3a-42b1-8c0d-1e2f3a4b5c6d';
const EVENT_UUID = '7a6b5c4d-3e2f-41a0-b9c8-d7e6f5a4b3c2';
const REQUEST_UUID = '2c1e5f7a-8b9d-4e0f-a1b2-c3d4e5f60718';

const OCCURRED_AT = new Date('2026-09-16T10:11:12.013Z');
const OCCURRED_AT_ISO = '2026-09-16T10:11:12.013Z';

const VALID_ME = {
  userId: 'user-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  locale: null,
  teams: [{ teamId: TeamId.make('team-1'), role: 'owner' }],
};

const VALID_STATUS = {
  name: 'Our Studio',
  version: '1.2.3',
  auth: {
    enabled: true,
    magicLink: false,
    emailAndPassword: true,
    socialProviders: ['google'],
  },
  deployment: { mode: 'self-hosted', billing: false },
  setup: { required: false },
};

const ENCODED_ME = {
  userId: 'user-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  locale: null,
  teams: [{ teamId: 'team-1', role: 'owner' }],
};

const ENCODED_STATUS = {
  name: 'Our Studio',
  version: '1.2.3',
  auth: {
    enabled: true,
    magicLink: false,
    emailAndPassword: true,
    socialProviders: ['google'],
  },
  deployment: { mode: 'self-hosted', billing: false },
  setup: { required: false },
};

const VALID_STUDY_SUMMARY = {
  id: STUDY_UUID,
  name: 'Belfast pilot',
  state: 'draft',
  participationMode: 'managed',
  protocolId: null,
  createdAt: OCCURRED_AT,
  waveCount: 0,
  participantCount: 2,
};

const ENCODED_STUDY_SUMMARY = {
  id: STUDY_UUID,
  name: 'Belfast pilot',
  state: 'draft',
  participationMode: 'managed',
  protocolId: null,
  createdAt: OCCURRED_AT_ISO,
  waveCount: 0,
  participantCount: 2,
};

const VALID_AUDIT_EVENT = {
  id: EVENT_UUID,
  sequence: '42',
  occurredAt: OCCURRED_AT,
  eventType: 'team.member.added',
  eventVersion: 1,
  category: 'team_access',
  outcome: 'succeeded',
  actor: { kind: 'user', id: 'user-1', label: 'Ada Lovelace' },
  subject: { type: 'user', id: 'user-2', label: 'Grace Hopper' },
  resource: null,
  title: 'Added a member',
  rendered: true,
};

const ENCODED_AUDIT_EVENT = {
  id: EVENT_UUID,
  sequence: '42',
  occurredAt: OCCURRED_AT_ISO,
  eventType: 'team.member.added',
  eventVersion: 1,
  category: 'team_access',
  outcome: 'succeeded',
  actor: { kind: 'user', id: 'user-1', label: 'Ada Lovelace' },
  subject: { type: 'user', id: 'user-2', label: 'Grace Hopper' },
  resource: null,
  title: 'Added a member',
  rendered: true,
};

describe('the documents the rpc plane puts on the wire', () => {
  it('encodes InstanceStatus', () => {
    expect(encode(InstanceStatus)(VALID_STATUS)).toStrictEqual(ENCODED_STATUS);
  });

  it('encodes Me', () => {
    expect(encode(Me)(VALID_ME)).toStrictEqual(ENCODED_ME);
  });

  it('encodes UpdateAccountLocaleResult', () => {
    expect(
      encode(UpdateAccountLocaleResult)({ locale: 'en-GB' }),
    ).toStrictEqual({ locale: 'en-GB' });
  });

  it('encodes CompleteSetupResult', () => {
    expect(
      encode(CompleteSetupResult)({
        instanceName: 'Our Studio',
        signedIn: true,
      }),
    ).toStrictEqual({ instanceName: 'Our Studio', signedIn: true });
  });

  it('encodes CreateTeamInvitationResult, with the expiry as an ISO string', () => {
    expect(
      encode(CreateTeamInvitationResult)({
        invitationId: 'inv-1',
        email: 'ada@example.com',
        role: 'member',
        status: 'pending',
        expiresAt: new Date('2026-10-01T09:00:00.000Z'),
      }),
    ).toStrictEqual({
      invitationId: 'inv-1',
      email: 'ada@example.com',
      role: 'member',
      status: 'pending',
      expiresAt: '2026-10-01T09:00:00.000Z',
    });
  });

  it('encodes AcceptTeamInvitationResult', () => {
    expect(
      encode(AcceptTeamInvitationResult)({
        invitationId: 'inv-1',
        teamId: 'team-1',
        teamName: 'Team One',
        memberId: 'member-1',
        role: 'member',
        status: 'accepted',
      }),
    ).toStrictEqual({
      invitationId: 'inv-1',
      teamId: 'team-1',
      teamName: 'Team One',
      memberId: 'member-1',
      role: 'member',
      status: 'accepted',
    });
  });

  it('encodes StudySummary', () => {
    expect(encode(StudySummary)(VALID_STUDY_SUMMARY)).toStrictEqual(
      ENCODED_STUDY_SUMMARY,
    );
  });

  it('encodes StudyDetail', () => {
    expect(
      encode(StudyDetail)({
        teamId: 'team-1',
        study: VALID_STUDY_SUMMARY,
        protocolDraftId: DRAFT_UUID,
      }),
    ).toStrictEqual({
      teamId: 'team-1',
      study: ENCODED_STUDY_SUMMARY,
      protocolDraftId: DRAFT_UUID,
    });
  });

  it('encodes ProtocolSummary', () => {
    expect(
      encode(ProtocolSummary)({
        id: PROTOCOL_UUID,
        draftId: DRAFT_UUID,
        name: 'Belfast protocol',
        createdAt: OCCURRED_AT,
        updatedAt: OCCURRED_AT,
      }),
    ).toStrictEqual({
      id: PROTOCOL_UUID,
      draftId: DRAFT_UUID,
      name: 'Belfast protocol',
      createdAt: OCCURRED_AT_ISO,
      updatedAt: OCCURRED_AT_ISO,
    });
  });

  it('encodes ManifestRevision, keeping the bigint sequence a decimal string', () => {
    expect(
      encode(ManifestRevision)({
        sequence: '9223372036854775807',
        hash: 'sha256:abc',
      }),
    ).toStrictEqual({ sequence: '9223372036854775807', hash: 'sha256:abc' });
  });

  it('encodes ProtocolDraft, leaving the section documents opaque', () => {
    expect(
      encode(ProtocolDraft)({
        protocol: {
          id: PROTOCOL_UUID,
          draftId: DRAFT_UUID,
          name: 'Belfast protocol',
          createdAt: OCCURRED_AT,
          updatedAt: OCCURRED_AT,
        },
        revision: { sequence: '7', hash: 'sha256:abc' },
        sections: { stages: { order: ['stage-1'], count: 1 } },
      }),
    ).toStrictEqual({
      protocol: {
        id: PROTOCOL_UUID,
        draftId: DRAFT_UUID,
        name: 'Belfast protocol',
        createdAt: OCCURRED_AT_ISO,
        updatedAt: OCCURRED_AT_ISO,
      },
      revision: { sequence: '7', hash: 'sha256:abc' },
      sections: { stages: { order: ['stage-1'], count: 1 } },
    });
  });

  it('encodes AuditEventSummary', () => {
    expect(encode(AuditEventSummary)(VALID_AUDIT_EVENT)).toStrictEqual(
      ENCODED_AUDIT_EVENT,
    );
  });

  it('encodes AuditListOutput', () => {
    expect(
      encode(AuditListOutput)({
        items: [VALID_AUDIT_EVENT],
        nextCursor: '41',
      }),
    ).toStrictEqual({ items: [ENCODED_AUDIT_EVENT], nextCursor: '41' });
  });

  it('encodes AuditEventDetail', () => {
    expect(
      encode(AuditEventDetail)({
        ...VALID_AUDIT_EVENT,
        teamLabel: 'Team One',
        requestId: REQUEST_UUID,
        details: { role: 'member', invited: true },
      }),
    ).toStrictEqual({
      ...ENCODED_AUDIT_EVENT,
      teamLabel: 'Team One',
      requestId: REQUEST_UUID,
      details: { role: 'member', invited: true },
    });
  });

  it('encodes AuditFilterOptions', () => {
    expect(
      encode(AuditFilterOptions)({
        actions: [{ eventType: 'team.member.added', title: 'Added a member' }],
        actors: [{ kind: 'user', id: 'user-1', label: 'Ada Lovelace' }],
        truncated: false,
      }),
    ).toStrictEqual({
      actions: [{ eventType: 'team.member.added', title: 'Added a member' }],
      actors: [{ kind: 'user', id: 'user-1', label: 'Ada Lovelace' }],
      truncated: false,
    });
  });
});

describe('dates on the wire', () => {
  it('decodes an encoded AuditEventSummary back to a Date', () => {
    const decoded = decode(AuditEventSummary)(
      encode(AuditEventSummary)(VALID_AUDIT_EVENT),
    );

    expect(decoded.occurredAt).toBeInstanceOf(Date);
    expect(decoded.occurredAt.getTime()).toBe(OCCURRED_AT.getTime());
  });

  it('decodes the audit window bounds to Dates and encodes them back unchanged', () => {
    const wire = {
      teamId: 'team-1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    };
    const decoded = decode(AuditListInput)(wire);

    expect(decoded.from).toBeInstanceOf(Date);
    expect(decoded.to).toBeInstanceOf(Date);
    expect(encode(AuditListInput)(decoded)).toStrictEqual(wire);
  });

  it('leaves an absent optional bound absent on both sides, not undefined', () => {
    const decoded = decode(AuditListInput)({ teamId: 'team-1' });

    expect(Object.keys(decoded)).toStrictEqual(['teamId']);
    expect('from' in decoded).toBe(false);
    expect(encode(AuditListInput)(decoded)).toStrictEqual({
      teamId: 'team-1',
    });
  });
});

// ADR #1248: a declared output schema IS the serialization allowlist. A handler
// that hands the encoder a whole database row rather than a projection of it
// must not be able to leak the row's other columns, and these three cases are
// what makes that a property of the contract instead of handler discipline.
describe('a declared output schema is the serialization allowlist', () => {
  it('strips a field Me never declared', () => {
    const encoded = encode(Me)({ ...VALID_ME, passwordHash: 'LEAK' });

    expect(JSON.stringify(encoded)).not.toContain('passwordHash');
    expect(encoded).toStrictEqual(ENCODED_ME);
  });

  it('strips a field InstanceStatus never declared', () => {
    const encoded = encode(InstanceStatus)({
      ...VALID_STATUS,
      databaseUrl: 'postgres://LEAK',
    });

    expect(JSON.stringify(encoded)).not.toContain('databaseUrl');
    expect(encoded).toStrictEqual(ENCODED_STATUS);
  });

  it('strips an undeclared field nested inside StudyDetail', () => {
    const encoded = encode(StudyDetail)({
      teamId: 'team-1',
      study: { ...VALID_STUDY_SUMMARY, ownerEmail: 'LEAK@example.com' },
      protocolDraftId: null,
      internalNote: 'LEAK',
    });

    expect(encoded).toStrictEqual({
      teamId: 'team-1',
      study: ENCODED_STUDY_SUMMARY,
      protocolDraftId: null,
    });
  });
});

// Why every output in this package is a `Schema.Struct`. A success schema
// declared as a class refuses anything that is not an instance of it at encode
// time, so a handler returning a plain object — which is what a query, a
// mapper, or a `toHandlers` object naturally produces — would fail at the
// transport rather than at its own boundary.
class MeClass extends Schema.Class<MeClass>('MeClass')(Me.fields) {}

describe('a class success schema refuses a plain object', () => {
  it('throws for the object the Struct accepts', () => {
    expect(() => encode(MeClass)(VALID_ME)).toThrow('Expected MeClass');
    expect(encode(Me)(VALID_ME)).toStrictEqual(ENCODED_ME);
  });

  it('accepts an instance, which is the difference', () => {
    expect(encode(MeClass)(new MeClass(VALID_ME))).toStrictEqual(ENCODED_ME);
  });
});

describe('branded ids', () => {
  it('travels as the bare string it brands', () => {
    expect(encode(StudyId)(StudyId.make(STUDY_UUID))).toBe(STUDY_UUID);
  });
});
