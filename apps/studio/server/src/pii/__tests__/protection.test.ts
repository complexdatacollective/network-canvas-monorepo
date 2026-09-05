import { webcrypto } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  KeyConfigurationError,
  loadEncryptionKeys,
  type EncryptionKeys,
} from '../keys.ts';
import {
  createDataProtection,
  type IntegrationField,
  type ParticipantField,
  ProtectedDataError,
  type ProtectedReadBoundary,
  type ProtectedValue,
} from '../protection.ts';
import { configuration, loadTestKeys, rootOne } from './fixtures.ts';

const participant: ParticipantField = {
  teamId: 'team-1',
  studyId: 'study-1',
  participantId: 'participant-1',
  column: 'email_ciphertext',
};
const webhook: IntegrationField = {
  kind: 'webhook',
  teamId: 'team-1',
  subscriptionId: 'subscription-1',
  column: 'secret_ciphertext',
};
const oauth: IntegrationField = {
  kind: 'oauth',
  userId: 'user-1',
  accountRowId: 'account-1',
  column: 'accessToken',
};
const plaintext = Buffer.from('person@example.org');

// Test-only boundary. Production must supply permission checks and a durable
// audit event inside its transaction; the foundation has no default adapter.
async function permittedRead(_target: unknown, read: () => Buffer) {
  read();
}

function protection(
  keys: EncryptionKeys,
  boundaries?: {
    participant?: ProtectedReadBoundary<ParticipantField>;
    integration?: ProtectedReadBoundary<IntegrationField>;
  },
) {
  return createDataProtection(keys, {
    participant: boundaries?.participant ?? permittedRead,
    integration: boundaries?.integration ?? permittedRead,
  });
}

describe('participant AES-256-GCM envelope', () => {
  it.each([
    ['email_ciphertext', plaintext],
    ['phone_ciphertext', Buffer.from('+13125550100')],
    ['name_ciphertext', Buffer.from('Zoë 李')],
    [
      'attributes_ciphertext',
      Buffer.from('{"sensitive":"synthetic attribute"}'),
    ],
  ] satisfies [ParticipantField['column'], Buffer][])(
    'round-trips %s',
    async (column, bytes) => {
      const api = protection(await loadTestKeys());
      const target = { ...participant, column };
      const value = api.encryptParticipant(target, bytes, 'v1');
      expect(value.algorithm).toBe('aes-256-gcm.v1');
      expect(value.keyId).toBe('v1');
      expect(value.envelope[0]).toBe(1);
      expect(value.envelope).toHaveLength(1 + 12 + bytes.length + 16);
      expect(await api.readParticipant(target, value)).toEqual(bytes);
    },
  );

  it.each([Buffer.alloc(0), Buffer.from([0, 255, 128, 1])])(
    'round-trips binary case %# including empty plaintext',
    async (bytes) => {
      const api = protection(await loadTestKeys());
      expect(
        await api.readParticipant(
          participant,
          api.encryptParticipant(participant, bytes, 'v1'),
        ),
      ).toEqual(bytes);
    },
  );

  it.each(['studyId', 'participantId'] as const)(
    'canonicalizes UUID case for %s before encryption and the read boundary',
    async (axis) => {
      const canonical = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const target = { ...participant, [axis]: canonical };
      const upper = { ...target, [axis]: canonical.toUpperCase() };
      const audited: ParticipantField[] = [];
      const api = protection(await loadTestKeys(), {
        participant: async (context, read) => {
          audited.push(context);
          read();
        },
      });
      const fromUpper = api.encryptParticipant(upper, plaintext, 'v1');
      expect(await api.readParticipant(target, fromUpper)).toEqual(plaintext);
      const fromCanonical = api.encryptParticipant(target, plaintext, 'v1');
      expect(await api.readParticipant(upper, fromCanonical)).toEqual(
        plaintext,
      );
      expect(audited).toEqual([target, target]);
      await expect(
        api.readParticipant(
          { ...target, [axis]: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12' },
          fromUpper,
        ),
      ).rejects.toThrow(ProtectedDataError);
    },
  );

  it('preserves case-sensitive text team identifiers even when shaped like UUIDs', async () => {
    const target = {
      ...participant,
      teamId: 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11',
    };
    const audited: ParticipantField[] = [];
    const api = protection(await loadTestKeys(), {
      participant: async (context, read) => {
        audited.push(context);
        read();
      },
    });
    const value = api.encryptParticipant(target, plaintext, 'v1');
    expect(await api.readParticipant(target, value)).toEqual(plaintext);
    expect(audited).toEqual([target]);
    await expect(
      api.readParticipant(
        { ...target, teamId: target.teamId.toLowerCase() },
        value,
      ),
    ).rejects.toThrow(ProtectedDataError);
  });

  const participantMoves: [string, Partial<ParticipantField>][] = [
    ['team', { teamId: 'team-2' }],
    ['study', { studyId: 'study-2' }],
    ['participant', { participantId: 'participant-2' }],
    ['column', { column: 'name_ciphertext' }],
  ];

  it('has one rejection probe for each participant AAD axis', () => {
    expect(participantMoves.map(([axis]) => axis)).toEqual([
      'team',
      'study',
      'participant',
      'column',
    ]);
  });

  it.each(participantMoves)(
    'rejects ciphertext moved to another %s',
    async (_axis, move) => {
      const api = protection(await loadTestKeys());
      const value = api.encryptParticipant(participant, plaintext, 'v1');
      await expect(
        api.readParticipant({ ...participant, ...move }, value),
      ).rejects.toThrow(ProtectedDataError);
    },
  );

  it('binds all four AAD axes independently of the team key derivation', async () => {
    // A WebCrypto consumer uses the original team key for every attempt.
    // Moving the team therefore tests AAD itself, not only a different key.
    const api = protection(await loadTestKeys());
    const value = api.encryptParticipant(participant, plaintext, 'v1');
    const encoder = new TextEncoder();
    const root = await webcrypto.subtle.importKey(
      'raw',
      rootOne,
      'HKDF',
      false,
      ['deriveKey'],
    );
    const key = await webcrypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(),
        info: encoder.encode(
          '["studio-encryption.v1","pii-enc","v1","team","team-1"]',
        ),
      },
      root,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const open = (target: ParticipantField) =>
      webcrypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: Uint8Array.from(value.envelope.subarray(1, 13)),
          additionalData: encoder.encode(
            JSON.stringify([
              target.teamId,
              target.studyId,
              target.participantId,
              target.column,
            ]),
          ),
          tagLength: 128,
        },
        key,
        Uint8Array.from(value.envelope.subarray(13)),
      );
    expect(Buffer.from(await open(participant))).toEqual(plaintext);
    expect(participantMoves).toHaveLength(4);
    for (const [, move] of participantMoves) {
      await expect(open({ ...participant, ...move })).rejects.toThrow();
    }
  });

  it('frames context tuples without delimiter collisions', async () => {
    const api = protection(await loadTestKeys());
    const target = {
      ...participant,
      studyId: 'study|one',
      participantId: 'person',
    };
    const value = api.encryptParticipant(target, plaintext, 'v1');
    await expect(
      api.readParticipant(
        { ...target, studyId: 'study', participantId: 'one|person' },
        value,
      ),
    ).rejects.toThrow(ProtectedDataError);
  });

  it.each(['teamId', 'studyId', 'participantId'] as const)(
    'rejects an empty %s before encryption',
    async (axis) => {
      const api = protection(await loadTestKeys());
      expect(() =>
        api.encryptParticipant({ ...participant, [axis]: '' }, plaintext, 'v1'),
      ).toThrow(ProtectedDataError);
    },
  );

  it('generates a fresh 96-bit nonce for every encryption', async () => {
    const api = protection(await loadTestKeys());
    const first = api.encryptParticipant(participant, plaintext, 'v1');
    const second = api.encryptParticipant(participant, plaintext, 'v1');
    expect(first.envelope.subarray(1, 13)).not.toEqual(
      second.envelope.subarray(1, 13),
    );
    expect(first.envelope).not.toEqual(second.envelope);
    expect(await api.readParticipant(participant, first)).toEqual(plaintext);
    expect(await api.readParticipant(participant, second)).toEqual(plaintext);
  });

  const malformed: [string, (value: ProtectedValue) => ProtectedValue][] = [
    [
      'unknown algorithm',
      (value) => ({ ...value, algorithm: 'aes-256-gcm.v2' }),
    ],
    ['empty envelope', (value) => ({ ...value, envelope: Buffer.alloc(0) })],
    [
      'short envelope',
      (value) => ({ ...value, envelope: value.envelope.subarray(0, 28) }),
    ],
    [
      'unknown version',
      (value) => {
        value.envelope[0] = 2;
        return value;
      },
    ],
    [
      'changed nonce',
      (value) => {
        value.envelope[1] = (value.envelope[1] ?? 0) ^ 1;
        return value;
      },
    ],
    [
      'changed ciphertext',
      (value) => {
        value.envelope[13] = (value.envelope[13] ?? 0) ^ 1;
        return value;
      },
    ],
    [
      'changed tag',
      (value) => {
        const last = value.envelope.length - 1;
        value.envelope[last] = (value.envelope[last] ?? 0) ^ 1;
        return value;
      },
    ],
    [
      'truncated tag',
      (value) => ({ ...value, envelope: value.envelope.subarray(0, -1) }),
    ],
    [
      'appended byte',
      (value) => ({
        ...value,
        envelope: Buffer.concat([value.envelope, Buffer.from([0])]),
      }),
    ],
  ];

  it('has envelope corruption probes', () => {
    expect(malformed.length).toBeGreaterThan(0);
  });

  it.each(malformed)(
    'rejects %s without exposing crypto details',
    async (_name, corrupt) => {
      const api = protection(await loadTestKeys());
      const error: unknown = await api
        .readParticipant(
          participant,
          corrupt(api.encryptParticipant(participant, plaintext, 'v1')),
        )
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(ProtectedDataError);
      expect(error).toHaveProperty(
        'message',
        'Stored encrypted data could not be read.',
      );
      expect(error).not.toHaveProperty('cause');
    },
  );

  it.each(['missing', 'v2', 'same-root-new-id', 'index-1'])(
    'rejects substituted key id %s',
    async (keyId) => {
      const api = protection(await loadTestKeys());
      const value = api.encryptParticipant(participant, plaintext, 'v1');
      await expect(
        api.readParticipant(participant, { ...value, keyId }),
      ).rejects.toThrow(ProtectedDataError);
    },
  );

  it('rejects wrong root material even when the key id is present', async () => {
    const api = protection(await loadTestKeys());
    const value = api.encryptParticipant(participant, plaintext, 'v1');
    const wrongKeys = await loadEncryptionKeys(configuration(), async () =>
      Buffer.alloc(32, 201),
    );
    expect(wrongKeys.has('pii-enc', value.keyId)).toBe(true);
    await expect(
      protection(wrongKeys).readParticipant(participant, value),
    ).rejects.toThrow(ProtectedDataError);
  });

  it('keeps a partial field update readable under the existing row key after rotation', async () => {
    const oldKeys = await loadTestKeys();
    const old = protection(oldKeys);
    const rowKeyId = oldKeys.currentId('pii-enc');
    const nameTarget = { ...participant, column: 'name_ciphertext' } as const;
    const email = old.encryptParticipant(participant, plaintext, rowKeyId);
    const name = old.encryptParticipant(
      nameTarget,
      Buffer.from('Original name'),
      rowKeyId,
    );
    const row = {
      algorithm: email.algorithm,
      keyId: rowKeyId,
      email: email.envelope,
      name: name.envelope,
    };
    const config = configuration();
    config.pii.current = 'v2';
    const rotatedKeys = await loadTestKeys(config);
    const rotated = protection(rotatedKeys);
    expect(rotatedKeys.currentId('pii-enc')).toBe('v2');
    const replacement = Buffer.from('Updated name');
    const updated = rotated.encryptParticipant(
      nameTarget,
      replacement,
      row.keyId,
    );
    // One row-wide metadata pair must still open the unchanged and changed fields.
    row.name = updated.envelope;
    expect(
      await rotated.readParticipant(participant, {
        algorithm: row.algorithm,
        keyId: row.keyId,
        envelope: row.email,
      }),
    ).toEqual(plaintext);
    expect(
      await rotated.readParticipant(nameTarget, {
        algorithm: row.algorithm,
        keyId: row.keyId,
        envelope: row.name,
      }),
    ).toEqual(replacement);
    expect(updated.keyId).toBe(row.keyId);
  });

  it('refuses a selected row key that is not present instead of falling back to current', async () => {
    const api = protection(await loadTestKeys());
    expect(() =>
      api.encryptParticipant(participant, plaintext, 'retired'),
    ).toThrow(KeyConfigurationError);
  });

  it('reads retained historical rows while new encryption uses the current key', async () => {
    const old = protection(await loadTestKeys());
    const historical = old.encryptParticipant(participant, plaintext, 'v1');
    const config = configuration();
    config.pii.current = 'v2';
    const rotated = protection(await loadTestKeys(config));
    const current = rotated.encryptParticipant(participant, plaintext, 'v2');
    expect(historical.keyId).toBe('v1');
    expect(current.keyId).toBe('v2');
    expect(await rotated.readParticipant(participant, historical)).toEqual(
      plaintext,
    );
    expect(await rotated.readParticipant(participant, current)).toEqual(
      plaintext,
    );
    expect(rotated.encryptIntegration(webhook, plaintext).keyId).toBe('v1');
    config.pii.keys = config.pii.keys.filter(({ id }) => id !== 'v1');
    await expect(
      protection(await loadTestKeys(config)).readParticipant(
        participant,
        historical,
      ),
    ).rejects.toThrow(ProtectedDataError);
  });
});

describe('integration credentials', () => {
  it('canonicalizes the webhook subscription UUID before encryption and its read boundary', async () => {
    const canonical = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const target = { ...webhook, subscriptionId: canonical };
    const upper = { ...target, subscriptionId: canonical.toUpperCase() };
    const audited: IntegrationField[] = [];
    const api = protection(await loadTestKeys(), {
      integration: async (context, read) => {
        audited.push(context);
        read();
      },
    });
    const fromUpper = api.encryptIntegration(upper, plaintext);
    expect(await api.readIntegration(target, fromUpper)).toEqual(plaintext);
    const fromCanonical = api.encryptIntegration(target, plaintext);
    expect(await api.readIntegration(upper, fromCanonical)).toEqual(plaintext);
    expect(audited).toEqual([target, target]);
    await expect(
      api.readIntegration(
        {
          ...target,
          subscriptionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        },
        fromUpper,
      ),
    ).rejects.toThrow(ProtectedDataError);
  });

  it.each(['userId', 'accountRowId'] as const)(
    'preserves the case-sensitive OAuth text %s even when shaped like a UUID',
    async (axis) => {
      const target = {
        ...oauth,
        [axis]: 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11',
      };
      const audited: IntegrationField[] = [];
      const api = protection(await loadTestKeys(), {
        integration: async (context, read) => {
          audited.push(context);
          read();
        },
      });
      const value = api.encryptIntegration(target, plaintext);
      expect(await api.readIntegration(target, value)).toEqual(plaintext);
      expect(audited).toEqual([target]);
      await expect(
        api.readIntegration(
          {
            ...target,
            [axis]: target[axis].toLowerCase(),
          },
          value,
        ),
      ).rejects.toThrow(ProtectedDataError);
    },
  );

  it('binds OAuth credentials to the account primary row even when providers repeat external IDs', async () => {
    const firstAccount = {
      id: 'account-row-one',
      providerId: 'provider-one',
      accountId: 'same-external-id',
    };
    const secondAccount = {
      id: 'account-row-two',
      providerId: 'provider-two',
      accountId: 'same-external-id',
    };
    expect(firstAccount.accountId).toBe(secondAccount.accountId);
    const api = protection(await loadTestKeys());
    const first = { ...oauth, accountRowId: firstAccount.id };
    const second = { ...oauth, accountRowId: secondAccount.id };
    const value = api.encryptIntegration(first, plaintext);
    expect(await api.readIntegration(first, value)).toEqual(plaintext);
    await expect(api.readIntegration(second, value)).rejects.toThrow(
      ProtectedDataError,
    );
  });

  it.each([
    webhook,
    oauth,
    { ...oauth, column: 'refreshToken' },
    { ...oauth, column: 'idToken' },
  ] satisfies IntegrationField[])(
    'round-trips $kind $column',
    async (target) => {
      const api = protection(await loadTestKeys());
      const value = api.encryptIntegration(target, plaintext);
      expect(value.algorithm).toBe('aes-256-gcm.v1');
      expect(value.keyId).toBe('v1');
      expect(await api.readIntegration(target, value)).toEqual(plaintext);
      await expect(api.readParticipant(participant, value)).rejects.toThrow(
        ProtectedDataError,
      );
    },
  );

  it.each([
    ['webhook team', webhook, { ...webhook, teamId: 'team-2' }],
    [
      'webhook subscription',
      webhook,
      { ...webhook, subscriptionId: 'subscription-2' },
    ],
    ['OAuth user', oauth, { ...oauth, userId: 'user-2' }],
    ['OAuth account', oauth, { ...oauth, accountRowId: 'account-2' }],
    ['OAuth column', oauth, { ...oauth, column: 'refreshToken' }],
    ['integration kind', webhook, oauth],
  ] satisfies [string, IntegrationField, IntegrationField][])(
    'rejects a different %s',
    async (_axis, target, moved) => {
      const api = protection(await loadTestKeys());
      await expect(
        api.readIntegration(moved, api.encryptIntegration(target, plaintext)),
      ).rejects.toThrow(ProtectedDataError);
    },
  );

  it('rotates integration credentials without selecting a different PII key', async () => {
    const old = protection(await loadTestKeys());
    const historical = old.encryptIntegration(oauth, plaintext);
    const config = configuration();
    config.integration.current = 'v2';
    const rotated = protection(await loadTestKeys(config));
    const current = rotated.encryptIntegration(oauth, plaintext);
    expect(current.keyId).toBe('v2');
    expect(await rotated.readIntegration(oauth, historical)).toEqual(plaintext);
    expect(await rotated.readIntegration(oauth, current)).toEqual(plaintext);
    expect(rotated.encryptParticipant(participant, plaintext, 'v1').keyId).toBe(
      'v1',
    );
  });
});

describe('authorization and audit integration seam', () => {
  it('does not derive or decrypt before authorization permits the read', async () => {
    const keys = await loadTestKeys();
    const source = protection(keys).encryptParticipant(
      participant,
      plaintext,
      'v1',
    );
    const derive = vi.spyOn(keys, 'derive');
    const denied = vi.fn(async () => {
      throw new Error('Permission denied');
    });
    await expect(
      protection(keys, { participant: denied }).readParticipant(
        participant,
        source,
      ),
    ).rejects.toThrow('Permission denied');
    expect(denied).toHaveBeenCalledOnce();
    expect(derive).not.toHaveBeenCalled();
  });

  it('waits for the audit transaction to complete before releasing plaintext', async () => {
    const opened = Promise.withResolvers<void>();
    const committed = Promise.withResolvers<void>();
    const keys = await loadTestKeys();
    const api = protection(keys, {
      participant: async (target, read) => {
        expect(target).toEqual(participant);
        expect(read()).toEqual(plaintext);
        opened.resolve();
        await committed.promise;
      },
    });
    let returned = false;
    const result = api
      .readParticipant(
        participant,
        api.encryptParticipant(participant, plaintext, 'v1'),
      )
      .then((bytes) => {
        returned = true;
        return bytes;
      });
    await opened.promise;
    expect(returned).toBe(false);
    committed.resolve();
    expect(await result).toEqual(plaintext);
    expect(returned).toBe(true);
  });

  it('rejects failed audit persistence and wipes retained plaintext', async () => {
    const retained: Buffer[] = [];
    const api = protection(await loadTestKeys(), {
      participant: async (_target, read) => {
        retained.push(read());
        expect(retained[0]).toEqual(plaintext);
        throw new Error('Audit commit failed');
      },
    });
    await expect(
      api.readParticipant(
        participant,
        api.encryptParticipant(participant, plaintext, 'v1'),
      ),
    ).rejects.toThrow('Audit commit failed');
    expect(retained).toHaveLength(1);
    expect(retained[0]).toEqual(Buffer.alloc(plaintext.length));
  });

  it('requires the integration read to pass its own audit boundary', async () => {
    const denied = vi.fn(async () => {
      throw new Error('Integration access denied');
    });
    const api = protection(await loadTestKeys(), { integration: denied });
    await expect(
      api.readIntegration(oauth, api.encryptIntegration(oauth, plaintext)),
    ).rejects.toThrow('Integration access denied');
    expect(denied).toHaveBeenCalledExactlyOnceWith(oauth, expect.any(Function));
  });

  it('snapshots caller-owned target and stored ciphertext before an async boundary', async () => {
    const gate = Promise.withResolvers<void>();
    const audited: ParticipantField[] = [];
    const api = protection(await loadTestKeys(), {
      participant: async (target, read) => {
        await gate.promise;
        audited.push(target);
        expect(Object.isFrozen(target)).toBe(true);
        read();
      },
    });
    const target = { ...participant };
    const value = api.encryptParticipant(target, plaintext, 'v1');
    const result = api.readParticipant(target, value);
    target.participantId = 'mutated-participant';
    value.keyId = 'missing';
    value.algorithm = 'mutated';
    value.envelope.fill(0);
    gate.resolve();
    expect(await result).toEqual(plaintext);
    expect(audited).toEqual([participant]);
  });

  it('allows its decryption callback only once and revokes it after completion', async () => {
    const callbacks: (() => Buffer)[] = [];
    const api = protection(await loadTestKeys(), {
      participant: async (_target, read) => {
        callbacks.push(read);
        read();
        expect(read).toThrow(ProtectedDataError);
      },
    });
    expect(
      await api.readParticipant(
        participant,
        api.encryptParticipant(participant, plaintext, 'v1'),
      ),
    ).toEqual(plaintext);
    expect(callbacks).toHaveLength(1);
    expect(callbacks[0]).toThrow(ProtectedDataError);
  });

  it('refuses a boundary that never reads and revokes the unused callback', async () => {
    const callbacks: (() => Buffer)[] = [];
    const keys = await loadTestKeys();
    const api = protection(keys, {
      participant: async (_target, read) => {
        callbacks.push(read);
      },
    });
    const source = api.encryptParticipant(participant, plaintext, 'v1');
    const derive = vi.spyOn(keys, 'derive');
    await expect(api.readParticipant(participant, source)).rejects.toThrow(
      ProtectedDataError,
    );
    expect(callbacks).toHaveLength(1);
    expect(callbacks[0]).toThrow(ProtectedDataError);
    expect(derive).not.toHaveBeenCalled();
  });
});
