import { describe, expect, it, vi } from 'vitest';

import recoveryFixture from './combined-recovery.fixture.json' with { type: 'json' };
import {
  assertDistributionUpgradeCanaries,
  assertRecoveredDistributionEvidence,
  executeDistributionRestore,
} from './distribution.ts';
import {
  assertKernelTelemetryControls,
  assertKernelTelemetryEgressProtocols,
  assertKernelTelemetryReady,
  assertNativeChildTelemetryControl,
  assertNoKernelTelemetryEgress,
  assertNoProcessTelemetryEgress,
  assertNoTelemetryEgress,
  assertProcessTelemetryInstrumentationPositive,
  assertTelemetryDetectorPositive,
  parseConntrackFlow,
  TELEMETRY_EGRESS_MARKER,
  TELEMETRY_KERNEL_CONTROL_MARKER,
  TELEMETRY_KERNEL_EGRESS_MARKER,
  TELEMETRY_KERNEL_LIVENESS_MARKER,
  TELEMETRY_KERNEL_OBSERVER_SOURCE,
  TELEMETRY_KERNEL_READY_MARKER,
  TELEMETRY_PROCESS_APIS,
  TELEMETRY_PROCESS_EGRESS_MARKER,
} from './telemetry-egress.ts';

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
  it('parses only the original TCP or UDP conntrack tuple', () => {
    expect(
      parseConntrackFlow(
        'ipv4 2 tcp 6 431999 ESTABLISHED src=172.18.0.3 dst=172.18.0.2 sport=45122 dport=8443 src=172.18.0.2 dst=172.18.0.3 sport=8443 dport=45122 [ASSURED] mark=0 use=1',
      ),
    ).toEqual({
      protocol: 'tcp',
      source: '172.18.0.3',
      destination: '172.18.0.2',
      sourcePort: 45_122,
      destinationPort: 8443,
    });
    expect(
      parseConntrackFlow(
        'ipv4 2 udp 17 29 src=172.18.0.3 dst=172.18.0.2 sport=53214 dport=8443 src=172.18.0.2 dst=172.18.0.3 sport=8443 dport=53214 mark=0 use=1',
      )?.protocol,
    ).toBe('udp');
    expect(parseConntrackFlow('ipv4 2 icmp 1 29 src=1.2.3.4')).toBeUndefined();
    expect(parseConntrackFlow('malformed tcp')).toBeUndefined();
  });

  it('requires a live kernel sensor and both transport controls', () => {
    const logs = `${TELEMETRY_KERNEL_READY_MARKER}\n${TELEMETRY_KERNEL_LIVENESS_MARKER} 1\n${TELEMETRY_KERNEL_LIVENESS_MARKER} 2\n${TELEMETRY_KERNEL_CONTROL_MARKER} {"protocol":"tcp","destination":"172.18.0.2","port":8443}\n${TELEMETRY_KERNEL_CONTROL_MARKER} {"protocol":"udp","destination":"172.18.0.2","port":8443}\n`;
    expect(() => assertKernelTelemetryReady(logs)).not.toThrow();
    expect(() => assertKernelTelemetryControls(logs)).not.toThrow();
    expect(() => assertNoKernelTelemetryEgress(logs)).not.toThrow();
    expect(() =>
      assertKernelTelemetryReady(
        logs.replace(`${TELEMETRY_KERNEL_LIVENESS_MARKER} 2`, 'missing'),
      ),
    ).toThrow('remain live');
    expect(() =>
      assertKernelTelemetryControls(
        logs.replace('"protocol":"udp"', '"protocol":"missing"'),
      ),
    ).toThrow('udp');
    expect(() =>
      assertNoKernelTelemetryEgress(
        `${logs}${TELEMETRY_KERNEL_EGRESS_MARKER}\n`,
      ),
    ).toThrow('detected egress');
  });

  it('ships a syntactically valid kernel observer', () => {
    expect(() => new Function(TELEMETRY_KERNEL_OBSERVER_SOURCE)).not.toThrow();
  });

  it('requires a new kernel flow for the uninstrumented native child', () => {
    const logs = `${TELEMETRY_KERNEL_CONTROL_MARKER}\n${TELEMETRY_KERNEL_CONTROL_MARKER}\n${TELEMETRY_KERNEL_CONTROL_MARKER}\n`;
    expect(() => assertNativeChildTelemetryControl(2, logs)).not.toThrow();
    expect(() => assertNativeChildTelemetryControl(3, logs)).toThrow(
      'native child',
    );
  });

  it('requires real TCP and UDP egress controls from the browser namespace', () => {
    const logs = `${TELEMETRY_KERNEL_EGRESS_MARKER} {"protocol":"tcp"}\n${TELEMETRY_KERNEL_EGRESS_MARKER} {"protocol":"udp"}\n`;
    expect(() => assertKernelTelemetryEgressProtocols(logs)).not.toThrow();
    expect(() =>
      assertKernelTelemetryEgressProtocols(
        logs.replace('"protocol":"udp"', '"protocol":"missing"'),
      ),
    ).toThrow('udp egress');
  });
  it('fails closed for a wrong-off mutant after a singular positive canary', () => {
    expect(() => assertNoTelemetryEgress('detector booted\n')).not.toThrow();
    expect(() =>
      assertNoTelemetryEgress(`detector\n${TELEMETRY_EGRESS_MARKER}\n`),
    ).toThrow('detected egress');
    expect(() =>
      assertTelemetryDetectorPositive(`${TELEMETRY_EGRESS_MARKER}\n`),
    ).not.toThrow();
    expect(() => assertTelemetryDetectorPositive('detector booted\n')).toThrow(
      'control failed',
    );
    expect(() =>
      assertTelemetryDetectorPositive(
        `${TELEMETRY_EGRESS_MARKER}\n${TELEMETRY_EGRESS_MARKER}\n`,
      ),
    ).toThrow('control failed');
  });
  it('requires every native transport in the process-level positive control', () => {
    const logs =
      TELEMETRY_PROCESS_APIS.map(
        (api) =>
          `${TELEMETRY_PROCESS_EGRESS_MARKER} {"api":"${api}","host":"192.0.2.123"}`,
      ).join('\n') +
      `\n${TELEMETRY_PROCESS_EGRESS_MARKER} {"api":"fetch","host":"postgres.example.test"}`;
    expect(() =>
      assertProcessTelemetryInstrumentationPositive(logs),
    ).not.toThrow();
    expect(() => assertNoProcessTelemetryEgress(logs)).toThrow('Instrumented');
    expect(() =>
      assertProcessTelemetryInstrumentationPositive(
        logs.replace('dgram.send', 'missing'),
      ),
    ).toThrow('dgram.send');
  });
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
