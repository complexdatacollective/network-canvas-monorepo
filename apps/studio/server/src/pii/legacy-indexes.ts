import { createHash, createHmac, randomUUID } from 'node:crypto';

import type pg from 'pg';

import { normalizeContact, type Contact } from './contacts.ts';

export const RAW_LEGACY_CONTACT_INDEX_ID = 'legacy-hex-v1';
export const RAW_LEGACY_PARTICIPANT_INDEX_ID = 'legacy-unverified-v1';
export const CLASSIFIED_LEGACY_CONTACT_INDEX_ID = 'legacy-public-hmac-v1';

/**
 * Add this sidecar definition in the first composed migration after frozen
 * 0001-0006. It remains separate here so the remediation and its database
 * boundary can be tested on the PII-only history without claiming migration
 * number 0004, which already belongs to the audit history.
 */
export const LEGACY_INDEX_REMEDIATION_GUARD_SQL = `
CREATE OR REPLACE FUNCTION public.legacy_blind_index_writes_are_guarded() RETURNS trigger AS $$
DECLARE
  raw_id text := CASE WHEN TG_TABLE_NAME = 'participants' THEN '${RAW_LEGACY_PARTICIPANT_INDEX_ID}' ELSE '${RAW_LEGACY_CONTACT_INDEX_ID}' END;
  classified_id text := '${CLASSIFIED_LEGACY_CONTACT_INDEX_ID}';
  marker text := pg_catalog.current_setting('app.legacy_index_remediation', true);
  old_reserved boolean;
  new_reserved boolean;
  proof_ready boolean;
BEGIN
  new_reserved := coalesce(NEW.blind_index_key_id IN (raw_id, classified_id), false);
  IF TG_OP = 'INSERT' THEN
    IF new_reserved THEN
      RAISE EXCEPTION 'legacy blind indexes are written only by encryption maintenance';
    END IF;
    RETURN NEW;
  END IF;

  old_reserved := coalesce(OLD.blind_index_key_id IN (raw_id, classified_id), false);
  IF TG_TABLE_NAME = 'participants' THEN
    IF NEW.blind_index_key_id IS NOT DISTINCT FROM OLD.blind_index_key_id
       AND NEW.email_index IS NOT DISTINCT FROM OLD.email_index
       AND NEW.phone_index IS NOT DISTINCT FROM OLD.phone_index
       AND NEW.email_ciphertext IS NOT DISTINCT FROM OLD.email_ciphertext
       AND NEW.phone_ciphertext IS NOT DISTINCT FROM OLD.phone_ciphertext
       AND NEW.name_ciphertext IS NOT DISTINCT FROM OLD.name_ciphertext
       AND NEW.attributes_ciphertext IS NOT DISTINCT FROM OLD.attributes_ciphertext
       AND NEW.pii_key_id IS NOT DISTINCT FROM OLD.pii_key_id
       AND NEW.pii_algorithm IS NOT DISTINCT FROM OLD.pii_algorithm THEN
      RETURN NEW;
    END IF;

    IF old_reserved AND marker = 'v1' AND current_user = 'studio_maintenance'
       AND OLD.blind_index_key_id = raw_id
       AND NEW.blind_index_key_id IS NOT NULL
       AND NEW.blind_index_key_id NOT IN (raw_id, classified_id)
       AND OLD.pii_key_id IS NOT NULL
       AND NEW.pii_key_id IS NOT NULL
       AND NEW.pii_key_id IS DISTINCT FROM OLD.pii_key_id
       AND NEW.pii_algorithm = 'aes-256-gcm.v1'
       AND ((OLD.email_ciphertext IS NULL AND NEW.email_ciphertext IS NULL)
         OR (OLD.email_ciphertext IS NOT NULL AND NEW.email_ciphertext IS NOT NULL
           AND NEW.email_ciphertext IS DISTINCT FROM OLD.email_ciphertext))
       AND ((OLD.phone_ciphertext IS NULL AND NEW.phone_ciphertext IS NULL)
         OR (OLD.phone_ciphertext IS NOT NULL AND NEW.phone_ciphertext IS NOT NULL
           AND NEW.phone_ciphertext IS DISTINCT FROM OLD.phone_ciphertext))
       AND ((OLD.name_ciphertext IS NULL AND NEW.name_ciphertext IS NULL)
         OR (OLD.name_ciphertext IS NOT NULL AND NEW.name_ciphertext IS NOT NULL
           AND NEW.name_ciphertext IS DISTINCT FROM OLD.name_ciphertext))
       AND ((OLD.attributes_ciphertext IS NULL AND NEW.attributes_ciphertext IS NULL)
         OR (OLD.attributes_ciphertext IS NOT NULL AND NEW.attributes_ciphertext IS NOT NULL
           AND NEW.attributes_ciphertext IS DISTINCT FROM OLD.attributes_ciphertext))
       AND ((OLD.email_index IS NULL AND NEW.email_index IS NULL)
         OR (OLD.email_index IS NOT NULL AND NEW.email_index IS NOT NULL
           AND NEW.email_index IS DISTINCT FROM OLD.email_index))
       AND ((OLD.phone_index IS NULL AND NEW.phone_index IS NULL)
         OR (OLD.phone_index IS NOT NULL AND NEW.phone_index IS NOT NULL
           AND NEW.phone_index IS DISTINCT FROM OLD.phone_index)) THEN
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM %I.encryption_key_verifications WHERE purpose = ''pii-enc'' AND key_id = $1)
           AND EXISTS (SELECT 1 FROM %I.encryption_key_verifications WHERE purpose = ''pii-enc'' AND key_id = $2)
           AND EXISTS (SELECT 1 FROM %I.encryption_key_verifications WHERE purpose = ''pii-index'' AND key_id = $3)',
        TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA
      ) INTO proof_ready USING OLD.pii_key_id, NEW.pii_key_id, NEW.blind_index_key_id;
      IF proof_ready THEN RETURN NEW; END IF;
    END IF;
  ELSE
    IF NEW.blind_index_key_id IS NOT DISTINCT FROM OLD.blind_index_key_id
       AND NEW.recipient_blind_index IS NOT DISTINCT FROM OLD.recipient_blind_index
       AND NEW.channel IS NOT DISTINCT FROM OLD.channel THEN
      RETURN NEW;
    END IF;
    IF old_reserved AND marker = 'v1'
       AND current_user = pg_catalog.pg_get_userbyid(
         (SELECT relation.relowner FROM pg_catalog.pg_class AS relation WHERE relation.oid = TG_RELID)
       )
       AND OLD.blind_index_key_id = raw_id
       AND NEW.blind_index_key_id = classified_id
       AND NEW.recipient_blind_index IS NOT DISTINCT FROM OLD.recipient_blind_index
       AND NEW.channel IS NOT DISTINCT FROM OLD.channel THEN
      RETURN NEW;
    END IF;
  END IF;

  IF old_reserved OR new_reserved THEN
    RAISE EXCEPTION 'legacy blind indexes are written only by encryption maintenance';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog;

CREATE OR REPLACE TRIGGER participants_legacy_blind_index_guard
  BEFORE INSERT OR UPDATE OF blind_index_key_id, email_index, phone_index,
    email_ciphertext, phone_ciphertext, name_ciphertext, attributes_ciphertext,
    pii_key_id, pii_algorithm ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.legacy_blind_index_writes_are_guarded();
CREATE OR REPLACE TRIGGER message_deliveries_legacy_blind_index_guard
  BEFORE INSERT OR UPDATE OF blind_index_key_id, recipient_blind_index, channel
  ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.legacy_blind_index_writes_are_guarded();
CREATE OR REPLACE TRIGGER participant_contact_optouts_legacy_blind_index_guard
  BEFORE INSERT OR UPDATE OF blind_index_key_id, recipient_blind_index, channel
  ON public.participant_contact_optouts
  FOR EACH ROW EXECUTE FUNCTION public.legacy_blind_index_writes_are_guarded();
`;

// This value was public source code used only by the pre-encryption synthetic
// seed. It is retained solely to honor already-stored global opt-outs; it must
// never protect or index a newly written address.
const LEGACY_DEVELOPMENT_INDEX_KEY = 'studio-development-blind-index-key';

export function createClassifiedLegacyContactIndex(contact: Contact) {
  return {
    keyId: CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
    value: createHmac('sha256', LEGACY_DEVELOPMENT_INDEX_KEY)
      .update(normalizeContact(contact))
      .digest(),
  };
}

type LegacyDeliveryIndex = {
  kind: 'message-delivery';
  id: string;
  index: Buffer;
};

type LegacyOptOutIndex = {
  kind: 'contact-opt-out';
  channel: string;
  index: Buffer;
};

type LegacyContactIndex = LegacyDeliveryIndex | LegacyOptOutIndex;

function remediationDigest(rows: readonly LegacyContactIndex[]): Buffer {
  const canonical = rows.map((row) =>
    row.kind === 'message-delivery'
      ? [row.kind, row.id, row.index.toString('hex')]
      : [row.kind, row.channel, row.index.toString('hex')],
  );
  return createHash('sha256').update(JSON.stringify(canonical)).digest();
}

/**
 * Classify at most `limit` irreversible pre-encryption digests. Bytes and
 * suppression relationships stay unchanged. The new reserved ID names the
 * known public development HMAC algorithm without pretending it is a proved
 * deployment key, and immutable evidence commits with every batch.
 */
export async function classifyLegacyContactIndexBatch(
  operatorPool: pg.Pool,
  limit: number,
): Promise<{ processed: number; passComplete: boolean }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Legacy index batch limit must be between 1 and 100.');
  const client = await operatorPool.connect();
  try {
    await client.query('BEGIN');
    const authority = await client.query<{ allowed: boolean }>(
      `SELECT current_user = session_user AND identity.rolcanlogin AND bool_and(relation.relowner = identity.oid) AS allowed
       FROM pg_roles identity CROSS JOIN pg_class relation
       WHERE identity.rolname = session_user
         AND relation.oid = ANY(ARRAY[
           'message_deliveries'::regclass,
           'participant_contact_optouts'::regclass,
           'credential_audit_events'::regclass
         ]) GROUP BY identity.rolcanlogin`,
    );
    if (authority.rows[0]?.allowed !== true)
      throw new Error('Legacy index classification requires the table owner.');
    await client.query(
      'LOCK TABLE message_deliveries, participant_contact_optouts IN EXCLUSIVE MODE',
    );
    await client.query(
      "SELECT set_config('app.legacy_index_remediation', 'v1', true)",
    );
    const deliveries = await client.query<{ id: string; index: Buffer }>(
      `SELECT id, recipient_blind_index AS index FROM message_deliveries
       WHERE blind_index_key_id = $1 ORDER BY id LIMIT $2 FOR UPDATE`,
      [RAW_LEGACY_CONTACT_INDEX_ID, limit],
    );
    const remaining = limit - deliveries.rows.length;
    const optOuts =
      remaining === 0
        ? { rows: [] as { channel: string; index: Buffer }[] }
        : await client.query<{ channel: string; index: Buffer }>(
            `SELECT channel, recipient_blind_index AS index FROM participant_contact_optouts
             WHERE blind_index_key_id = $1 ORDER BY channel, recipient_blind_index
             LIMIT $2 FOR UPDATE`,
            [RAW_LEGACY_CONTACT_INDEX_ID, remaining],
          );
    const rows: LegacyContactIndex[] = [
      ...deliveries.rows.map((row) => ({
        kind: 'message-delivery' as const,
        ...row,
      })),
      ...optOuts.rows.map((row) => ({
        kind: 'contact-opt-out' as const,
        ...row,
      })),
    ];
    if (deliveries.rows.length > 0) {
      // The payload trigger makes the addressing label immutable. The offline
      // table owner disables only that trigger inside this transaction; a
      // rollback restores it with the rows, and the exact update below cannot
      // change the digest or any delivery state.
      await client.query(
        'ALTER TABLE message_deliveries DISABLE TRIGGER message_delivery_payload_immutable',
      );
      const updated = await client.query(
        `UPDATE message_deliveries SET blind_index_key_id = $1
         WHERE id = ANY($2::uuid[]) AND blind_index_key_id = $3`,
        [
          CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
          deliveries.rows.map(({ id }) => id),
          RAW_LEGACY_CONTACT_INDEX_ID,
        ],
      );
      if (updated.rowCount !== deliveries.rows.length)
        throw new Error('Legacy delivery classification changed concurrently.');
      await client.query(
        'ALTER TABLE message_deliveries ENABLE TRIGGER message_delivery_payload_immutable',
      );
    }
    if (optOuts.rows.length > 0) {
      const updated = await client.query(
        `UPDATE participant_contact_optouts SET blind_index_key_id = $1
         WHERE blind_index_key_id = $2
           AND (channel, recipient_blind_index) IN
             (SELECT * FROM unnest($3::text[], $4::bytea[]))`,
        [
          CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
          RAW_LEGACY_CONTACT_INDEX_ID,
          optOuts.rows.map(({ channel }) => channel),
          optOuts.rows.map(({ index }) => index),
        ],
      );
      if (updated.rowCount !== optOuts.rows.length)
        throw new Error('Legacy opt-out classification changed concurrently.');
    }
    if (rows.length > 0) {
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO credential_audit_events
          (id, user_id, account_id, action, outcome, request_id)
         VALUES ($1, 'system:encryption-maintenance', $2, 'migrate_legacy', 'succeeded', $3)`,
        [
          eventId,
          `legacy-index-batch:${remediationDigest(rows).toString('hex')}`,
          randomUUID(),
        ],
      );
    }
    await client.query('COMMIT');
    return { processed: rows.length, passComplete: rows.length < limit };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Normal startup/readiness accepts only explicitly classified legacy data. */
export async function verifyLegacyIndexRemediationTransaction(
  client: pg.PoolClient,
): Promise<void> {
  const result = await client.query<{ safe: boolean }>(
    `SELECT
      NOT EXISTS (SELECT 1 FROM participants WHERE blind_index_key_id = $1)
      AND NOT EXISTS (SELECT 1 FROM message_deliveries WHERE blind_index_key_id = $2)
      AND NOT EXISTS (SELECT 1 FROM participant_contact_optouts WHERE blind_index_key_id = $2)
      AND NOT EXISTS (
        SELECT 1 FROM participants WHERE blind_index_key_id = $3
      ) AS safe`,
    [
      RAW_LEGACY_PARTICIPANT_INDEX_ID,
      RAW_LEGACY_CONTACT_INDEX_ID,
      CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
    ],
  );
  if (result.rows[0]?.safe !== true)
    throw new Error('Legacy blind-index remediation is incomplete.');
}
