import { describe, expect, it, vi } from 'vitest';

import recoveryFixture from './combined-recovery.fixture.json' with { type: 'json' };
import {
  assertDistributionUpgradeCanaries,
  assertRecoveredDistributionEvidence,
  executeDistributionRestore,
} from './distribution.ts';

const registryEvidence = {
  entries: 1,
  sessions: 0,
  verifications: 0,
  activeCredentials: 0,
};
const recovered = {
  studioCanary: recoveryFixture.studio.participantCode,
  registryCanary: JSON.stringify(registryEvidence),
  studioWriterLoginsClosed: 't',
  registryWriterLoginsClosed: 't',
  runningServices: ['registry-postgres', 'minio', 'postgres', 'registry-minio'],
};

describe('local distribution recovery boundary', () => {
  it('requires owner, team, research and object canaries after each historical upgrade', () => {
    const bytes = Buffer.from(
      recoveryFixture.studio.object.bytesBase64,
      'base64',
    );
    const expected = { ownerId: 'owner-canary', teamId: 'team-canary' };
    const observed = {
      ...expected,
      ownerEmail: 'owner@example.test',
      participantCode: recoveryFixture.studio.participantCode,
      objectBytes: bytes,
    };
    expect(() =>
      assertDistributionUpgradeCanaries(observed, expected),
    ).not.toThrow();
    expect(() =>
      assertDistributionUpgradeCanaries(
        { ...observed, ownerEmail: undefined },
        expected,
      ),
    ).toThrow('lost a populated canary');
    expect(() =>
      assertDistributionUpgradeCanaries(
        { ...observed, participantCode: 'lost-participant' },
        expected,
      ),
    ).toThrow('lost a populated canary');
    expect(() =>
      assertDistributionUpgradeCanaries(
        { ...observed, objectBytes: Buffer.from('lost object') },
        expected,
      ),
    ).toThrow('lost a populated canary');
  });

  it('invokes the hardened restore with every independently held input', () => {
    const execute = vi.fn(() => 'restored');
    expect(
      executeDistributionRestore(execute, {
        script: '/private/restored/deployment/restore.sh',
        backup: '/private/backup',
        keyCustody: '/custody/encryption.env',
        registryCustody: '/custody/registry.env',
        reconciliation: '/custody/reconciliation.json',
        reconciliationSha256: 'a'.repeat(64),
        directory: '/private/restored',
        project: 'studio-qualification-restored',
      }),
    ).toBe('restored');
    expect(execute).toHaveBeenCalledWith(
      'sh',
      [
        '/private/restored/deployment/restore.sh',
        '/private/backup',
        '/custody/encryption.env',
        '/custody/registry.env',
        '/custody/reconciliation.json',
        'a'.repeat(64),
      ],
      {
        cwd: '/private/restored',
        env: { COMPOSE_PROJECT_NAME: 'studio-qualification-restored' },
      },
    );
  });

  it('propagates restore failure and cannot create recovery evidence', () => {
    const failure = new Error('synthetic restore failure');
    expect(() =>
      executeDistributionRestore(
        () => {
          throw failure;
        },
        {
          script: '/restore.sh',
          backup: '/backup',
          keyCustody: '/keys',
          registryCustody: '/registry',
          reconciliation: '/reconciliation',
          reconciliationSha256: 'b'.repeat(64),
          directory: '/target',
          project: 'target',
        },
      ),
    ).toThrow(failure);
  });

  it.each([
    ['Studio writer', { studioWriterLoginsClosed: 'f' }],
    ['Registry writer', { registryWriterLoginsClosed: 'f' }],
    [
      'HTTP service',
      { runningServices: [...recovered.runningServices, 'studio'] },
    ],
    [
      'session',
      {
        registryCanary: JSON.stringify({ ...registryEvidence, sessions: 1 }),
      },
    ],
  ])('refuses surviving %s evidence', (_name, mutation) => {
    expect(() =>
      assertRecoveredDistributionEvidence({ ...recovered, ...mutation }),
    ).toThrow('restore evidence is invalid');
  });

  it('accepts only the complete closed-admission evidence shape', () => {
    expect(() => assertRecoveredDistributionEvidence(recovered)).not.toThrow();
  });
});
