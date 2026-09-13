import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  auditActorEventContext,
  type AuditedCommandContext,
  runAuditedCommand,
  runAuditedSystemMutation,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';
import type { EncryptionKeys } from './keys.ts';
import { createDataProtection, ProtectedDataError } from './protection.ts';

export type WebhookCiphertextRow = {
  id: string;
  team_id: string;
  secret_ciphertext: Buffer;
  secret_key_id: string;
  secret_algorithm: string;
  state: string;
};

export async function selectWebhookCiphertext(
  client: pg.PoolClient,
  teamId: string,
  id: string,
  lock = false,
): Promise<WebhookCiphertextRow | undefined> {
  const result = await client.query<WebhookCiphertextRow>(
    `SELECT id, team_id, secret_ciphertext, secret_key_id, secret_algorithm, state FROM webhook_subscriptions WHERE id = $1 AND team_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
    [id, teamId],
  );
  return result.rows[0];
}

type WebhookReadAuthority =
  | { kind: 'configuration'; context: AuditedCommandContext }
  | {
      kind: 'delivery';
      maintenancePool: pg.Pool;
      teamId: string;
      deliveryId: string;
      leaseOwner: string;
    }
  | { kind: 'rotation'; maintenancePool: pg.Pool; teamId: string };

function secretEvent(
  input: Pick<
    AuditEventInput,
    | 'teamId'
    | 'teamLabel'
    | 'actorKind'
    | 'actorId'
    | 'actorLabel'
    | 'requestId'
  >,
  id: string,
  type:
    | 'webhook.secret.read'
    | 'webhook.secret.updated'
    | 'webhook.secret.rotated',
  purpose: 'configuration' | 'delivery' | 'rotation',
): AuditEventInput {
  return {
    ...input,
    eventType: type,
    eventVersion: 1,
    category: 'integration',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'webhook_subscription',
    resourceId: id,
    resourceLabel: null,
    details: { purpose },
  };
}

const teams = new TeamStore();

/**
 * The authorization branch comes from server call-site intent. Configuration
 * rechecks live membership; delivery proves the actual unexpired database
 * lease and active subscription; rotation requires the maintenance DB role.
 */
export async function readWebhookSecret(
  keys: EncryptionKeys,
  subscriptionId: string,
  authority: WebhookReadAuthority,
): Promise<Buffer> {
  const teamId =
    authority.kind === 'configuration'
      ? authority.context.tenantDb.teamId
      : authority.teamId;
  const tenant =
    authority.kind === 'configuration'
      ? authority.context.tenantDb
      : createTenantDb(authority.maintenancePool, teamId);
  const row = await runNoAuditTenantTransaction(
    tenant,
    'integration.readCiphertext',
    (client) => selectWebhookCiphertext(client, teamId, subscriptionId),
  );
  if (!row) throw new ProtectedDataError();
  const recheck = async (client: pg.PoolClient) => {
    const current = await selectWebhookCiphertext(
      client,
      teamId,
      subscriptionId,
      true,
    );
    if (
      !current ||
      current.secret_key_id !== row.secret_key_id ||
      current.secret_algorithm !== row.secret_algorithm ||
      !current.secret_ciphertext.equals(row.secret_ciphertext)
    )
      throw new ProtectedDataError();
    return current;
  };
  const protection = createDataProtection(keys, {
    participant: async () => {
      throw new ProtectedDataError();
    },
    integration: async (_target, read) => {
      if (authority.kind === 'configuration') {
        await runAuditedCommand(authority.context, async (client, context) => {
          const actor = await teams.lockActor(
            client,
            teamId,
            context.principal.userId,
          );
          if (!actor || !roleGrantsTeamAdministration(actor.role))
            throw new ProtectedDataError();
          await recheck(client);
          read();
          return {
            status: 'succeeded',
            result: undefined,
            events: [
              secretEvent(
                auditActorEventContext(context),
                subscriptionId,
                'webhook.secret.read',
                'configuration',
              ),
            ],
          };
        });
      } else {
        await runAuditedSystemMutation(
          {
            tenantDb: tenant,
            actorLabel:
              authority.kind === 'rotation'
                ? 'Encryption maintenance'
                : 'Webhook delivery',
            requestId: randomUUID(),
          },
          async (client, context) => {
            const current = await recheck(client);
            if (authority.kind === 'delivery') {
              const lease = await client.query(
                `SELECT id FROM webhook_deliveries WHERE id = $1 AND team_id = $2 AND subscription_id = $3 AND lease_owner = $4 AND lease_expires_at > statement_timestamp() AND delivered_at IS NULL AND failed_at IS NULL FOR UPDATE`,
                [
                  authority.deliveryId,
                  teamId,
                  subscriptionId,
                  authority.leaseOwner,
                ],
              );
              if (current.state !== 'active' || lease.rowCount !== 1)
                throw new ProtectedDataError();
            }
            read();
            return {
              result: undefined,
              events: [
                secretEvent(
                  context,
                  subscriptionId,
                  'webhook.secret.read',
                  authority.kind,
                ),
              ],
            };
          },
        );
      }
    },
  });
  return protection.readIntegration(
    { kind: 'webhook', teamId, subscriptionId, column: 'secret_ciphertext' },
    {
      keyId: row.secret_key_id,
      algorithm: row.secret_algorithm,
      envelope: row.secret_ciphertext,
    },
  );
}

/** Existing subscription configuration: raw secrets never enter SQL or audit. */
export async function setWebhookSecret(
  keys: EncryptionKeys,
  context: AuditedCommandContext,
  subscriptionId: string,
  secret: Uint8Array,
): Promise<void> {
  if (secret.byteLength < 16 || secret.byteLength > 483)
    throw new ProtectedDataError();
  const plaintext = Buffer.from(secret);
  try {
    await runAuditedCommand(context, async (client, locked) => {
      const actor = await teams.lockActor(
        client,
        context.tenantDb.teamId,
        context.principal.userId,
      );
      if (!actor || !roleGrantsTeamAdministration(actor.role))
        throw new ProtectedDataError();
      const current = await selectWebhookCiphertext(
        client,
        context.tenantDb.teamId,
        subscriptionId,
        true,
      );
      if (!current) throw new ProtectedDataError();
      const protection = createDataProtection(keys, {
        participant: async () => {
          throw new ProtectedDataError();
        },
        integration: async () => {
          throw new ProtectedDataError();
        },
      });
      const sealed = protection.encryptIntegration(
        {
          kind: 'webhook',
          teamId: context.tenantDb.teamId,
          subscriptionId,
          column: 'secret_ciphertext',
        },
        plaintext,
      );
      await client.query(
        'UPDATE webhook_subscriptions SET secret_ciphertext = $3, secret_key_id = $4, secret_algorithm = $5, updated_at = now() WHERE id = $1 AND team_id = $2',
        [
          subscriptionId,
          context.tenantDb.teamId,
          sealed.envelope,
          sealed.keyId,
          sealed.algorithm,
        ],
      );
      return {
        status: 'succeeded',
        result: undefined,
        events: [
          secretEvent(
            auditActorEventContext(locked),
            subscriptionId,
            'webhook.secret.updated',
            'configuration',
          ),
        ],
      };
    });
  } finally {
    plaintext.fill(0);
  }
}
