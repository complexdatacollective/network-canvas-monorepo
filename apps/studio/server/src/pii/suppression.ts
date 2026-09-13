import type pg from 'pg';

import { type Contact, createContactBlindIndex } from './contacts.ts';
import type { EncryptionKeys } from './keys.ts';
import { createClassifiedLegacyContactIndex } from './legacy-indexes.ts';
import { credentialTransaction } from './oauth.ts';

/**
 * Worker-only global suppression. Historical indexes must remain queryable:
 * an erased address cannot be reindexed from its HMAC, so changing the current
 * index ID never retires an older key or undoes an existing opt-out.
 */
export function isContactSuppressed(
  maintenancePool: pg.Pool,
  keys: EncryptionKeys,
  contact: Contact,
): Promise<boolean> {
  const indexes = [
    ...keys
      .ids('pii-index')
      .map((id) => createContactBlindIndex(keys, contact, id)),
    createClassifiedLegacyContactIndex(contact),
  ];
  return credentialTransaction(
    maintenancePool,
    async (client) => {
      const result = await client.query<{ suppressed: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM participant_contact_optouts WHERE channel = $1 AND (blind_index_key_id, recipient_blind_index) IN (SELECT * FROM unnest($2::text[], $3::bytea[]))) AS suppressed`,
        [
          contact.kind === 'email' ? 'email' : 'sms',
          indexes.map((index) => index.keyId),
          indexes.map((index) => index.value),
        ],
      );
      return result.rows[0]?.suppressed === true;
    },
    true,
  );
}
