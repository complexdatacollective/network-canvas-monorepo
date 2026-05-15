import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

import { DatabaseError } from '../../errors';
import type { InterviewExportInput, ProtocolExportInput } from '../../input';
import type { ExportOptions } from '../../options';
import { ProtocolRepository } from '../../services/ProtocolRepository';
import { processSessions } from '../processSessions';

const mkSession = (
  id: string,
  hash: string,
  ego = 'ego-1',
): InterviewExportInput => ({
  id,
  participantIdentifier: `p-${id}`,
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-01'),
  network: { nodes: [], edges: [], ego: { _uid: ego, attributes: {} } },
  protocolHash: hash,
});

const protocol = (hash: string): ProtocolExportInput => ({
  hash,
  name: `Protocol ${hash}`,
  codebook: { node: {}, edge: {} },
});

const mkRepo = (mapping: Record<string, ProtocolExportInput>) =>
  Layer.succeed(ProtocolRepository, {
    getProtocols: () => Effect.succeed(mapping),
  });

const opts: ExportOptions = {
  exportGraphML: true,
  exportCSV: false,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 0,
    screenLayoutWidth: 0,
  },
};

describe('processSessions', () => {
  it('returns grouped, resequenced sessions and an empty failure list when all protocols resolve', async () => {
    const sessions = [mkSession('s1', 'hA'), mkSession('s2', 'hA')];
    const repo = mkRepo({ hA: protocol('hA') });

    const { grouped, protocols, failures } = await Effect.runPromise(
      processSessions(sessions, opts).pipe(Effect.provide(repo)),
    );

    expect(failures).toEqual([]);
    expect(protocols.hA?.hash).toBe('hA');
    expect(Object.keys(grouped)).toEqual(['hA']);
    expect(grouped.hA).toHaveLength(2);
  });

  it('routes sessions whose protocols are missing into failures with kind=protocol-missing', async () => {
    const sessions = [mkSession('s1', 'hA'), mkSession('s2', 'hMISSING')];
    const repo = mkRepo({ hA: protocol('hA') });

    const { grouped, failures } = await Effect.runPromise(
      processSessions(sessions, opts).pipe(Effect.provide(repo)),
    );

    expect(grouped.hA).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe('protocol-missing');
    expect(failures[0]?.sessionId).toBe('s2');
  });

  it('propagates DatabaseError fatally', async () => {
    const sessions = [mkSession('s1', 'hA')];
    const failingRepo = Layer.succeed(ProtocolRepository, {
      getProtocols: () =>
        Effect.fail(new DatabaseError({ cause: new Error('db down') })),
    });

    await expect(
      Effect.runPromise(
        processSessions(sessions, opts).pipe(Effect.provide(failingRepo)),
      ),
    ).rejects.toThrow();
  });
});
