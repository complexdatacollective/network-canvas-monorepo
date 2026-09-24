import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type {
  Forbidden,
  NotFound,
} from '@codaco/studio-contract/schema/errors';
import { ProtocolNameSchema } from '@codaco/studio-rpc';
import type { SectionValidationFailedError } from '@codaco/studio-sync/section-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { audited, changed, unchanged } from '../audit/audited.ts';
import type { AuditEventBody } from '../audit/audited.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnlyBeside } from '../db/errors.ts';
import { type TeamAccess, Transaction } from '../db/tenant.ts';
import type { RequestId } from '../http/middleware/request-id.ts';
import { requireProtocol } from '../rpc/team-scope.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { lockActor } from '../team/store.ts';
import {
  addStage,
  type DraftStructureError,
  moveStage,
} from './draft-structure.ts';
import { PROTOCOL_TABLES } from './schema.ts';
import { emptyProtocol } from './sectionize.ts';
import { createProtocol, ProtocolStoreError } from './store.ts';

// The protocol tier's audited commands, and the two locks every protocol write
// takes — the editor host's as well as these (#1927 §10).
//
// `protocol-builder/tenancy.ts` carried copies of all three while this file
// was still node-postgres: a second authorization error, and its own
// `lockActorMembership` / `lockProtocolDraft` making the same checks with the
// same `FOR UPDATE OF protocols, protocol_drafts`. They are one definition
// each now, here, and the editor host imports them.
//
// `requireProtocol` is imported from the rpc plane rather than restated,
// which is the one import in this file that points the other way. #1257's
// visibility rule has exactly one definition and it lives beside the other
// two rpc-plane gates; a second copy here is precisely what would drift. It
// is called INSIDE each command's transaction, which is what it requires —
// the handlers used to open a transaction of their own for it ahead of the
// command, and a grant revoked between those two transactions could let an
// edit through.

const { protocols, protocolDrafts } = PROTOCOL_TABLES;

export type ProtocolRevision = { sequence: string; hash: string };
export type CreatedProtocol = { protocolId: string; draftId: string };

/**
 * The actor's membership was gone, or had lost the tier it needed, by the time
 * the write's transaction opened.
 *
 * One class for the rpc commands below and for the editor host, because it is
 * one refusal: both re-read the same locked membership row for the same
 * reason, and a caller cannot tell which transport asked.
 */
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
  protocolLabel: string;
};

/**
 * Re-proves the actor's membership from the LOCKED row, inside the write's own
 * transaction.
 *
 * Whatever admitted the caller — the rpc middleware, or the editor session's
 * own gate — answered about a membership that is already stale by the time a
 * transaction opens. A role revoked in that window must refuse the write
 * rather than commit it, and locking the row is what makes the answer hold for
 * the rest of the transaction.
 */
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

/**
 * Creating a protocol line that no study owns is a team Admin or Owner action
 * — the rule `createAuditedStudy` applies to the study that would otherwise
 * own one, and the same rule that makes such a line reachable by nobody else
 * (#1257, `protocol/store.ts`). Read from the LOCKED membership row, for the
 * reason above.
 */
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

/**
 * The protocol line and its draft, locked together, with the name the audit
 * event records the protocol by.
 *
 * `FOR UPDATE OF` both rows rather than the join's whole output: a draft
 * published or discarded, or a line renamed, while this write is in flight
 * would otherwise leave the event naming something that no longer holds.
 */
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
    protocolLabel: protocolLabel.slice(0, 320),
  };
}, sqlErrorsOnlyBeside);

/** The fields every protocol event carries, minus the ones `audited` owns. */
const protocolEventFields = (protocol: {
  protocolId: string;
  protocolLabel: string;
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
  input: { name: string; protocolId: string; draftId: string },
) => Effect.Effect<
  CreatedProtocol,
  | ProtocolCommandAuthorizationError
  | ProtocolStoreError
  | SectionValidationFailedError
  | NotFound
  | SqlError.SqlError,
  Database | Principal | RequestId | AuditSignal | SecretsCipher
> = Effect.fn('protocol.create')(function* (
  access: TeamAccess,
  input: { name: string; protocolId: string; draftId: string },
) {
  const protocolName = yield* Effect.sync(() =>
    ProtocolNameSchema.parse(input.name).trim(),
  );
  // From the environment rather than a parameter (#1900): the process has one
  // keyring and one cipher over it, so a call site cannot seal under a key
  // nothing else in the program can open — and the rpc plane's "wired without
  // a cipher" 500 goes with the parameter.
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
        protocol: emptyProtocol(protocolName),
        protocolId: input.protocolId,
        draftId: input.draftId,
      });
      const response = {
        protocolId: result.protocolId,
        draftId: result.draftId,
      };
      // A replay of a creation that already committed: the identities are the
      // same and nothing changed, so a second creation event would put one
      // protocol in the activity log twice.
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
  Database | Principal | RequestId | AuditSignal
> = Effect.fn('protocol.addInformationStage')(function* (
  access: TeamAccess,
  input: { protocolId: string; draftId: string; stageId: string },
) {
  return yield* audited(
    'protocol.addInformationStage.audited',
    access,
    Effect.gen(function* () {
      const principal = yield* Principal;
      // The membership row first, `FOR UPDATE`: `requireProtocol` then
      // re-reads it under a share lock this transaction already covers,
      // rather than asking to upgrade one.
      yield* lockProtocolActorMembership({
        teamId: access.teamId,
        actorUserId: principal.userId,
      });
      // #1257's visibility rule, inside the write's own transaction and on
      // the locked role and grants rather than the ones `openTeam` read ahead
      // of it: a demotion or revocation in flight can no longer let an edit
      // through.
      yield* requireProtocol(access, input.protocolId);
      const protocol = yield* lockProtocolDraft({
        teamId: access.teamId,
        protocolId: input.protocolId,
        draftId: input.draftId,
      });
      const result = yield* addStage(access.teamId, {
        draftId: input.draftId,
        stage: {
          id: input.stageId,
          type: 'Information',
          label: 'Untitled screen',
          title: 'Untitled screen',
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
  | Forbidden
  | NotFound
  | SqlError.SqlError,
  Database | Principal | RequestId | AuditSignal
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
      // The move was a no-op — the stage was already where it was asked to go
      // — so the manifest did not advance and there is nothing to record.
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

/** Exported for the suites' compile assertions; nothing in production reads it. */
export type { AuditEventBody };
