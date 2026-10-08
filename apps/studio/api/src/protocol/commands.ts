import { and, eq } from 'drizzle-orm';
import { Effect, Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { escapeMessageText } from '@codaco/protocol-validation';
import type { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type {
  Forbidden,
  NotFound,
} from '@codaco/studio-contract/schema/errors';
import { ProtocolName } from '@codaco/studio-contract/schema/protocol';
import type { SectionValidationFailedError } from '@codaco/studio-sync/section-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { audited, changed, unchanged } from '../audit/audited.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnlyBeside } from '../db/errors.ts';
import { type TeamAccess, Transaction } from '../db/tenant.ts';
import type { RequestId } from '../http/middleware/request-id.ts';
import type { Jobs } from '../jobs/jobs.ts';
import type { Analytics } from '../platform/analytics.ts';
import { requireProtocol } from '../rpc/team-scope.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { lockActor } from '../team/store.ts';
import { localizationOf } from './diff.ts';
import {
  addStage,
  type DraftRevisionConflict,
  DraftStructureError,
  loadDoc,
  lockDraftHead,
  moveStage,
} from './draft-structure.ts';
import { PROTOCOL_TABLES } from './schema.ts';
import { emptyProtocol } from './sectionize.ts';
import { createProtocol, ProtocolStoreError } from './store.ts';

const { protocols, protocolDrafts } = PROTOCOL_TABLES;

export type ProtocolRevision = { sequence: string; hash: string };
export type CreatedProtocol = { protocolId: string; draftId: string };

export class ProtocolCommandAuthorizationError extends Schema.TaggedError<ProtocolCommandAuthorizationError>()(
  'ProtocolCommandAuthorizationError',
  {},
) {
  override get message(): string {
    return 'protocol command actor no longer holds the role it requires';
  }
}

export type LockedProtocolDraft = {
  protocolId: string;
  draftId: string;
  protocolLabel: Redacted.Redacted;
};

export const lockProtocolActorMembership: (input: {
  teamId: string;
  actorUserId: string;
}) => Effect.Effect<
  void,
  ProtocolCommandAuthorizationError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.lockActorMembership')(function* (input: {
  teamId: string;
  actorUserId: string;
}) {
  const actor = yield* lockActor(input.teamId, input.actorUserId);
  if (actor === null) return yield* new ProtocolCommandAuthorizationError();
});

const lockProtocolCreationActor: (input: {
  teamId: string;
  actorUserId: string;
}) => Effect.Effect<
  void,
  ProtocolCommandAuthorizationError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.lockCreationActor')(function* (input: {
  teamId: string;
  actorUserId: string;
}) {
  const actor = yield* lockActor(input.teamId, input.actorUserId);
  if (actor === null || !roleGrantsTeamAdministration(actor.role)) {
    return yield* new ProtocolCommandAuthorizationError();
  }
});

export const lockProtocolDraft: (input: {
  teamId: string;
  protocolId: string;
  draftId: string;
}) => Effect.Effect<
  LockedProtocolDraft,
  ProtocolStoreError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.lockProtocolDraft')(function* (input: {
  teamId: string;
  protocolId: string;
  draftId: string;
}) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ name: protocols.name })
    .from(protocols)
    .innerJoin(
      protocolDrafts,
      and(
        eq(protocolDrafts.protocolId, protocols.id),
        eq(protocolDrafts.teamId, protocols.teamId),
      ),
    )
    .where(
      and(
        eq(protocols.id, input.protocolId),
        eq(protocolDrafts.draftId, input.draftId),
        eq(protocols.teamId, input.teamId),
      ),
    )
    .for('update', { of: [protocols, protocolDrafts] });
  const row = rows[0];
  if (row === undefined) {
    return yield* new ProtocolStoreError({
      reason: `no draft ${input.draftId} for protocol ${input.protocolId}`,
    });
  }
  const protocolLabel = row.name.trim();
  if (protocolLabel.length === 0) {
    return yield* new ProtocolStoreError({ reason: 'protocol name is empty' });
  }
  return {
    protocolId: input.protocolId,
    draftId: input.draftId,
    protocolLabel: Redacted.make(protocolLabel.slice(0, 320)),
  };
}, sqlErrorsOnlyBeside);

const protocolEventFields = (protocol: {
  protocolId: string;
  protocolLabel: Redacted.Redacted;
}) =>
  ({
    eventVersion: 1,
    category: 'protocol',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'protocol',
    resourceId: protocol.protocolId,
    resourceLabel: protocol.protocolLabel,
  }) as const;

const protocolRevision = (result: {
  manifestSeq: bigint;
  manifestHash: string;
}): ProtocolRevision => ({
  sequence: String(result.manifestSeq),
  hash: result.manifestHash,
});

export const createAuditedProtocol: (
  access: TeamAccess,
  input: {
    name: Redacted.Redacted;
    protocolId: string;
    draftId: string;
  },
) => Effect.Effect<
  CreatedProtocol,
  | ProtocolCommandAuthorizationError
  | ProtocolStoreError
  | SectionValidationFailedError
  | NotFound
  | SqlError.SqlError,
  | Database
  | Principal
  | AuditActor
  | RequestId
  | AuditSignal
  | SecretsCipher
  | Analytics
  | Jobs
> = Effect.fn('protocol.create')(function* (
  access: TeamAccess,
  input: {
    name: Redacted.Redacted;
    protocolId: string;
    draftId: string;
  },
) {
  const protocolName = yield* Effect.sync(() =>
    Redacted.make(
      Redacted.value(
        Schema.decodeUnknownSync(ProtocolName)(Redacted.value(input.name)),
      ).trim(),
    ),
  );
  const cipher = yield* SecretsCipher;

  return yield* audited(
    'protocol.create.audited',
    access,
    Effect.gen(function* () {
      const principal = yield* Principal;
      yield* lockProtocolCreationActor({
        teamId: access.teamId,
        actorUserId: principal.userId,
      });
      const result = yield* createProtocol(access.teamId, cipher, {
        protocol: emptyProtocol(Redacted.value(protocolName)),
        protocolId: input.protocolId,
        draftId: input.draftId,
      });
      const response = {
        protocolId: result.protocolId,
        draftId: result.draftId,
      };
      if (!result.created) return unchanged(response);

      return changed(response, [
        {
          ...protocolEventFields({
            protocolId: result.protocolId,
            protocolLabel: protocolName,
          }),
          eventType: 'protocol.created',
          details: { draftId: result.draftId },
        },
      ]);
    }),
  );
});

export const addAuditedInformationStage: (
  access: TeamAccess,
  input: { protocolId: string; draftId: string; stageId: string },
) => Effect.Effect<
  ProtocolRevision,
  | ProtocolCommandAuthorizationError
  | ProtocolStoreError
  | DraftStructureError
  | SectionValidationFailedError
  | Forbidden
  | NotFound
  | SqlError.SqlError,
  Database | Principal | AuditActor | RequestId | AuditSignal | Analytics | Jobs
> = Effect.fn('protocol.addInformationStage')(function* (
  access: TeamAccess,
  input: { protocolId: string; draftId: string; stageId: string },
) {
  return yield* audited(
    'protocol.addInformationStage.audited',
    access,
    Effect.gen(function* () {
      const principal = yield* Principal;
      // The membership row first, `FOR UPDATE`: `requireProtocol` then re-reads it
      // under a share lock this transaction already covers, rather than upgrading one.
      yield* lockProtocolActorMembership({
        teamId: access.teamId,
        actorUserId: principal.userId,
      });
      // Inside the write's own transaction, on the locked role and grants: a
      // revocation in flight must not let an edit through.
      yield* requireProtocol(access, input.protocolId);
      const protocol = yield* lockProtocolDraft({
        teamId: access.teamId,
        protocolId: input.protocolId,
        draftId: input.draftId,
      });
      // The head lock first, so the languages read here are the ones the
      // stage is committed against.
      const head = yield* lockDraftHead(access.teamId, input.draftId);
      const settingsHash = head.sectionHashes[sectionId({ kind: 'settings' })];
      const localization = localizationOf(
        settingsHash === undefined
          ? undefined
          : yield* loadDoc(access.teamId, settingsHash),
      );
      if (localization === undefined) {
        return yield* new DraftStructureError({
          reason: `draft ${input.draftId} declares no valid localization`,
        });
      }
      const untitled = Object.fromEntries(
        localization.locales.map((locale) => [
          locale,
          escapeMessageText('Untitled screen'),
        ]),
      );
      const result = yield* addStage(access.teamId, {
        draftId: input.draftId,
        stage: {
          id: input.stageId,
          type: 'Information',
          label: untitled,
          title: untitled,
          items: [],
        },
      });
      const response = protocolRevision(result);
      return changed(response, [
        {
          ...protocolEventFields(protocol),
          eventType: 'protocol.draft.committed',
          details: {
            draftId: input.draftId,
            revision: response.sequence,
            affectedSectionIds: [
              sectionId({ kind: 'stage', stageId: input.stageId }),
              sectionId({ kind: 'stageOrder' }),
            ],
            operationTypes: ['addStage'],
            operationCount: 1,
          },
        },
      ]);
    }),
  );
});

export const moveAuditedProtocolStage: (
  access: TeamAccess,
  input: {
    protocolId: string;
    draftId: string;
    stageId: string;
    toIndex: number;
    expectedRevision: string;
  },
) => Effect.Effect<
  ProtocolRevision,
  | ProtocolCommandAuthorizationError
  | ProtocolStoreError
  | DraftStructureError
  | DraftRevisionConflict
  | Forbidden
  | NotFound
  | SqlError.SqlError,
  Database | Principal | AuditActor | RequestId | AuditSignal | Analytics | Jobs
> = Effect.fn('protocol.moveStage')(function* (
  access: TeamAccess,
  input: {
    protocolId: string;
    draftId: string;
    stageId: string;
    toIndex: number;
    expectedRevision: string;
  },
) {
  return yield* audited(
    'protocol.moveStage.audited',
    access,
    Effect.gen(function* () {
      const principal = yield* Principal;
      yield* lockProtocolActorMembership({
        teamId: access.teamId,
        actorUserId: principal.userId,
      });
      yield* requireProtocol(access, input.protocolId);
      const protocol = yield* lockProtocolDraft({
        teamId: access.teamId,
        protocolId: input.protocolId,
        draftId: input.draftId,
      });
      const expectedRevision = BigInt(input.expectedRevision);
      const result = yield* moveStage(access.teamId, {
        draftId: input.draftId,
        stageId: input.stageId,
        toIndex: input.toIndex,
        expectedRevision,
      });
      const response = protocolRevision(result);
      if (result.manifestSeq === expectedRevision) return unchanged(response);

      return changed(response, [
        {
          ...protocolEventFields(protocol),
          eventType: 'protocol.draft.committed',
          details: {
            draftId: input.draftId,
            revision: response.sequence,
            affectedSectionIds: [sectionId({ kind: 'stageOrder' })],
            operationTypes: ['moveStage'],
            operationCount: 1,
          },
        },
      ]);
    }),
  );
});
