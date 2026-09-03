import type pg from 'pg';

import { ProtocolNameSchema } from '@codaco/studio-rpc';
import type { Command } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  auditActorEventContext,
  type AuditedCommandContext,
  type LockedAuditedCommandContext,
  runAuditedCommand,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';
import { addStage, moveStage } from './draft-structure.ts';
import { emptyProtocol } from './sectionize.ts';
import { ProtocolStore, ProtocolStoreError } from './store.ts';
import { createProtocolSyncServer } from './sync.ts';

export type ProtocolRevision = { sequence: string; hash: string };
export type CreatedProtocol = { protocolId: string; draftId: string };

export class ProtocolCommandAuthorizationError extends Error {
  constructor() {
    super('protocol command actor no longer holds the role it requires');
    this.name = 'ProtocolCommandAuthorizationError';
  }
}

type LockedProtocolDraft = {
  protocolId: string;
  draftId: string;
  protocolLabel: string;
};

const teamStore = new TeamStore();

async function lockProtocolActorMembership(
  client: pg.PoolClient,
  context: AuditedCommandContext,
): Promise<void> {
  const actor = await teamStore.lockActor(
    client,
    context.tenantDb.teamId,
    context.principal.userId,
  );
  if (!actor) throw new ProtocolCommandAuthorizationError();
}

/**
 * Creating a protocol line that no study owns is a team Admin or Owner action
 * — the rule `createAuditedStudy` applies to the study that would otherwise
 * own one, and the same rule that makes such a line reachable by nobody else
 * (#1257, `protocol/store.ts`). Read from the LOCKED membership row, because
 * the middleware's answer is already stale by the time this transaction opens:
 * a role revoked in that window refuses the creation instead of committing it.
 */
async function lockProtocolCreationActor(
  client: pg.PoolClient,
  context: AuditedCommandContext,
): Promise<void> {
  const actor = await teamStore.lockActor(
    client,
    context.tenantDb.teamId,
    context.principal.userId,
  );
  if (!actor || !roleGrantsTeamAdministration(actor.role)) {
    throw new ProtocolCommandAuthorizationError();
  }
}

async function lockProtocolDraft(
  client: pg.PoolClient,
  input: { teamId: string; protocolId: string; draftId: string },
): Promise<LockedProtocolDraft> {
  const result = await client.query<{ name: string }>(
    `SELECT p.name
     FROM protocols p
     JOIN protocol_drafts pd
       ON pd.protocol_id = p.id AND pd.team_id = p.team_id
     WHERE p.id = $1 AND pd.draft_id = $2 AND p.team_id = $3
     FOR UPDATE OF p, pd`,
    [input.protocolId, input.draftId, input.teamId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ProtocolStoreError(
      `no draft ${input.draftId} for protocol ${input.protocolId}`,
    );
  }
  const protocolLabel = row.name.trim();
  if (!protocolLabel) throw new ProtocolStoreError('protocol name is empty');
  return {
    protocolId: input.protocolId,
    draftId: input.draftId,
    protocolLabel: protocolLabel.slice(0, 320),
  };
}

function protocolEventContext(
  auditContext: LockedAuditedCommandContext,
  protocol: {
    protocolId: string;
    protocolLabel: string;
  },
) {
  return {
    ...auditActorEventContext(auditContext),
    eventVersion: 1,
    category: 'protocol',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'protocol',
    resourceId: protocol.protocolId,
    resourceLabel: protocol.protocolLabel,
  } as const;
}

function protocolRevision(result: {
  manifestSeq: bigint;
  manifestHash: string;
}): ProtocolRevision {
  return {
    sequence: String(result.manifestSeq),
    hash: result.manifestHash,
  };
}

export function createAuditedProtocol(
  context: AuditedCommandContext,
  input: {
    name: string;
    protocolId: string;
    draftId: string;
  },
): Promise<CreatedProtocol> {
  const protocolName = ProtocolNameSchema.parse(input.name).trim();
  return runAuditedCommand(context, async (client, auditContext) => {
    await lockProtocolCreationActor(client, context);
    const result = await new ProtocolStore(context.tenantDb).createProtocol(
      {
        protocol: emptyProtocol(protocolName),
        protocolId: input.protocolId,
        draftId: input.draftId,
      },
      client,
    );
    const response = {
      protocolId: result.protocolId,
      draftId: result.draftId,
    };
    if (!result.created) return { status: 'unchanged', result: response };

    const event = {
      ...protocolEventContext(auditContext, {
        protocolId: result.protocolId,
        protocolLabel: protocolName,
      }),
      eventType: 'protocol.created',
      details: { draftId: result.draftId },
    } satisfies AuditEventInput;
    return { status: 'succeeded', result: response, events: [event] };
  });
}

export function commitAuditedProtocolSection(
  context: AuditedCommandContext,
  input: {
    protocolId: string;
    draftId: string;
    sectionId: string;
    clientId: string;
    leaseEpoch: string;
    clientSequence: string;
    commands: Command[];
  },
): Promise<ProtocolRevision> {
  return runAuditedCommand(context, async (client, auditContext) => {
    await lockProtocolActorMembership(client, context);
    const protocol = await lockProtocolDraft(client, {
      teamId: context.tenantDb.teamId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
    const result = await createProtocolSyncServer(context.tenantDb).commit(
      {
        draftId: input.draftId,
        sectionId: input.sectionId,
        owner: `${context.principal.userId}:${input.clientId}`,
        epoch: BigInt(input.leaseEpoch),
        clientSeq: BigInt(input.clientSequence),
        commands: input.commands,
      },
      client,
    );
    const response = protocolRevision(result);
    if (result.deduped) {
      return { status: 'unchanged', result: response };
    }

    const event = {
      ...protocolEventContext(auditContext, protocol),
      eventType: 'protocol.draft.committed',
      details: {
        draftId: input.draftId,
        revision: response.sequence,
        affectedSectionIds: [input.sectionId],
        operationTypes: [...new Set(input.commands.map(({ op }) => op))],
        operationCount: input.commands.length,
      },
    } satisfies AuditEventInput;
    return { status: 'succeeded', result: response, events: [event] };
  });
}

export function addAuditedInformationStage(
  context: AuditedCommandContext,
  input: { protocolId: string; draftId: string; stageId: string },
): Promise<ProtocolRevision> {
  return runAuditedCommand(context, async (client, auditContext) => {
    await lockProtocolActorMembership(client, context);
    const protocol = await lockProtocolDraft(client, {
      teamId: context.tenantDb.teamId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
    const result = await addStage(
      context.tenantDb,
      {
        draftId: input.draftId,
        stage: {
          id: input.stageId,
          type: 'Information',
          label: 'Untitled screen',
          title: 'Untitled screen',
          items: [],
        },
      },
      client,
    );
    const response = protocolRevision(result);
    const event = {
      ...protocolEventContext(auditContext, protocol),
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
    } satisfies AuditEventInput;
    return { status: 'succeeded', result: response, events: [event] };
  });
}

export function moveAuditedProtocolStage(
  context: AuditedCommandContext,
  input: {
    protocolId: string;
    draftId: string;
    stageId: string;
    toIndex: number;
    expectedRevision: string;
  },
): Promise<ProtocolRevision> {
  return runAuditedCommand(context, async (client, auditContext) => {
    await lockProtocolActorMembership(client, context);
    const protocol = await lockProtocolDraft(client, {
      teamId: context.tenantDb.teamId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
    const expectedRevision = BigInt(input.expectedRevision);
    const result = await moveStage(
      context.tenantDb,
      {
        draftId: input.draftId,
        stageId: input.stageId,
        toIndex: input.toIndex,
        expectedRevision,
      },
      client,
    );
    const response = protocolRevision(result);
    if (result.manifestSeq === expectedRevision) {
      return { status: 'unchanged', result: response };
    }

    const event = {
      ...protocolEventContext(auditContext, protocol),
      eventType: 'protocol.draft.committed',
      details: {
        draftId: input.draftId,
        revision: response.sequence,
        affectedSectionIds: [sectionId({ kind: 'stageOrder' })],
        operationTypes: ['moveStage'],
        operationCount: 1,
      },
    } satisfies AuditEventInput;
    return { status: 'succeeded', result: response, events: [event] };
  });
}
