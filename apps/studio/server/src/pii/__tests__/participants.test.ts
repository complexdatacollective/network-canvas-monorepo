import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { seedTeam } from '../../__tests__/support/postgres.ts';
import { createContactBlindIndex } from '../contacts.ts';
import { initializeEncryption } from '../initialize.ts';
import {
  findParticipantByContact,
  ParticipantPiiError,
  readParticipantPiiField,
  updateParticipantPii,
} from '../participants.ts';
import { configuration, rootOne } from './fixtures.ts';
import {
  contacts,
  participantFixture as fixture,
} from './integration-fixture.ts';

describe('authorized and audited participant PII', () => {
  it('stores only encrypted fields and stable binary indexes, then audits each authorized read', async () => {
    await fixture(async ({ scratch, keys, context, target }) => {
      expect(
        await updateParticipantPii(keys, context, target, contacts),
      ).toEqual({ participantCode: 'P-0001' });
      const stored = await scratch.pool.query<{
        email_ciphertext: Buffer;
        phone_ciphertext: Buffer;
        name_ciphertext: Buffer;
        attributes_ciphertext: Buffer;
        email_index: Buffer;
        blind_index_key_id: string;
      }>('SELECT * FROM participants WHERE id = $1', [target.participantId]);
      const row = stored.rows[0]!;
      expect(row.email_index).toEqual(
        createContactBlindIndex(keys, {
          kind: 'email',
          value: 'person@example.org',
        }).value,
      );
      expect(row.blind_index_key_id).toBe('index-1');
      expect(JSON.stringify(row)).not.toContain('person@example.org');
      const fields = [
        ['email_ciphertext', 'person@example.org'],
        ['phone_ciphertext', '+13125550100'],
        ['name_ciphertext', contacts.name],
        ['attributes_ciphertext', JSON.stringify(contacts.attributes)],
      ] as const;
      for (const [column, expected] of fields) {
        expect(
          row[column].includes(Buffer.from(expected)),
          `${column} contains plaintext bytes`,
        ).toBe(false);
        const value = await readParticipantPiiField(keys, context, {
          ...target,
          column,
        });
        expect(value?.toString()).toBe(expected);
      }
      const audit = await scratch.pool.query<{
        event_type: string;
        details: unknown;
        resource_label: string;
      }>(
        'SELECT event_type, details, resource_label FROM audit_events ORDER BY sequence',
      );
      expect(audit.rows.map((event) => event.event_type)).toEqual([
        'participant.pii.updated',
        ...fields.map(() => 'participant.pii.read'),
      ]);
      expect(
        audit.rows.every((event) => event.resource_label === 'P-0001'),
      ).toBe(true);
      expect(JSON.stringify(audit.rows)).not.toContain('person@example.org');
      await expect(
        findParticipantByContact(keys, context, target.studyId, {
          kind: 'email',
          value: 'PERSON@example.org',
        }),
      ).resolves.toEqual([
        { participantId: target.participantId, participantCode: 'P-0001' },
      ]);
      const lookup = await scratch.pool.query(
        "SELECT details, resource_label FROM audit_events WHERE event_type = 'participant.pii.lookup'",
      );
      expect(lookup.rows).toEqual([
        { details: { kind: 'email', resultCount: 1 }, resource_label: null },
      ]);
      expect(
        (
          await scratch.pool.query(
            'SELECT event_type, alert_policy_key FROM audit_alert_outbox ORDER BY audit_event_sequence',
          )
        ).rows,
      ).toEqual([
        ...fields.map(() => ({
          event_type: 'participant.pii.read',
          alert_policy_key: 'contact_access',
        })),
        {
          event_type: 'participant.pii.lookup',
          alert_policy_key: 'contact_access',
        },
      ]);
    });
  });

  it('denies the owner after the explicit PII grant is revoked and records the denial without a target label', async () => {
    await fixture(async ({ scratch, keys, context, target }) => {
      await updateParticipantPii(keys, context, target, contacts);
      await scratch.pool.query(
        'UPDATE study_role_grants SET pii_access = false WHERE study_id = $1',
        [target.studyId],
      );
      await expect(
        readParticipantPiiField(keys, context, {
          ...target,
          column: 'email_ciphertext',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        updateParticipantPii(keys, context, target, contacts),
      ).rejects.toThrow(ParticipantPiiError);
      const audit = await scratch.pool.query<{
        resource_id: string | null;
        resource_label: string | null;
        details: unknown;
      }>(
        "SELECT resource_id, resource_label, details FROM audit_events WHERE outcome = 'denied'",
      );
      expect(audit.rows).toHaveLength(2);
      expect(
        audit.rows.every(
          (event) =>
            event.resource_id === null && event.resource_label === null,
        ),
      ).toBe(true);
    });
  });

  it('keeps old index lookups valid when the separately versioned current index changes', async () => {
    await fixture(async ({ scratch, keys, context, target }) => {
      await updateParticipantPii(keys, context, target, contacts);
      const config = configuration();
      config.blindIndex.current = 'index-2';
      const changed = await initializeEncryption({
        maintenancePool: scratch.maintenance,
        configuration: config,
        loadRootKey: async () => rootOne,
      });
      await expect(
        findParticipantByContact(changed, context, target.studyId, {
          kind: 'phone',
          value: '+1-312-555-0100',
        }),
      ).resolves.toEqual([
        { participantId: target.participantId, participantCode: 'P-0001' },
      ]);
    });
  });

  it('does not release plaintext or mutate the row if the audit append fails', async () => {
    await fixture(async ({ scratch, keys, context, target }) => {
      await updateParticipantPii(keys, context, target, contacts);
      const before = await scratch.pool.query(
        'SELECT * FROM participants WHERE id = $1',
        [target.participantId],
      );
      await scratch.pool.query(
        `CREATE FUNCTION reject_pii_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$; CREATE TRIGGER reject_pii_test_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_pii_test_audit()`,
      );
      await expect(
        readParticipantPiiField(keys, context, {
          ...target,
          column: 'email_ciphertext',
        }),
      ).rejects.toThrow('synthetic audit unavailable');
      await expect(
        updateParticipantPii(keys, context, target, {
          ...contacts,
          name: 'changed',
        }),
      ).rejects.toThrow('synthetic audit unavailable');
      await expect(
        findParticipantByContact(keys, context, target.studyId, {
          kind: 'email',
          value: contacts.email,
        }),
      ).rejects.toThrow('synthetic audit unavailable');
      expect(
        (
          await scratch.pool.query('SELECT * FROM participants WHERE id = $1', [
            target.participantId,
          ])
        ).rows,
      ).toEqual(before.rows);
    });
  });

  it('denies a different team and an absent field without relying on ciphertext failure', async () => {
    await fixture(async ({ scratch, keys, context, target }) => {
      await expect(
        readParticipantPiiField(keys, context, {
          ...target,
          column: 'email_ciphertext',
        }),
      ).resolves.toBeNull();
      const otherTeam = randomUUID();
      await seedTeam(scratch.pool, otherTeam);
      const other = {
        ...context,
        tenantDb: createTenantDb(scratch.app, otherTeam),
        requestId: randomUUID(),
      };
      await expect(
        readParticipantPiiField(keys, other, {
          ...target,
          column: 'email_ciphertext',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  it('audits an authorized null field without recording a PII value', async () => {
    await fixture(async ({ scratch, keys, context, target }) => {
      await expect(
        readParticipantPiiField(keys, context, {
          ...target,
          column: 'email_ciphertext',
        }),
      ).resolves.toBeNull();
      const audit = await scratch.pool.query<{
        event_type: string;
        details: unknown;
        resource_id: string;
        resource_label: string;
      }>(
        `SELECT event_type, details, resource_id, resource_label
         FROM audit_events WHERE event_type = 'participant.pii.read'`,
      );
      expect(audit.rows).toEqual([
        {
          event_type: 'participant.pii.read',
          details: { studyId: target.studyId, columns: ['email_ciphertext'] },
          resource_id: target.participantId,
          resource_label: 'P-0001',
        },
      ]);
      expect(JSON.stringify(audit.rows)).not.toContain('person@example.org');
    });
  });
});
