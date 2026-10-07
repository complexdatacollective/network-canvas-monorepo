import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcEncryptionHeader,
} from '@codaco/shared-consts';

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
  network: {
    nodes: [],
    edges: [],
    ego: { _uid: ego, [entityAttributesProperty]: {} },
  },
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

const encryptionHeader: NcEncryptionHeader = {
  version: 1,
  method: 'AES-256-GCM',
  kdf: {
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    salt: [168, 29, 241, 116, 83, 207, 14, 155, 70, 222, 37, 129, 193, 48],
  },
  check: {
    iv: [183, 56, 249, 21, 142, 97, 208, 63, 125, 30, 164, 245],
    data: [92, 167, 18, 234, 79, 146, 31, 203, 58, 121, 190, 5],
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

  it('removes legacy null attributes before grouping formatted sessions', async () => {
    const session = mkSession('s1', 'hA');
    // The attribute type models the post-cleanup shape, so the legacy null this
    // test feeds in has to go round it.
    Reflect.set(
      session.network.ego[entityAttributesProperty],
      'unanswered',
      null,
    );
    const repo = mkRepo({ hA: protocol('hA') });

    const { grouped, failures } = await Effect.runPromise(
      processSessions([session], opts).pipe(Effect.provide(repo)),
    );

    expect(failures).toEqual([]);
    expect(grouped.hA?.[0]?.ego[entityAttributesProperty]).not.toHaveProperty(
      'unanswered',
    );
  });

  it('isolates invalid defined attribute values as per-session failures', async () => {
    const validSession = mkSession('valid', 'hA');
    const invalidSession = mkSession('invalid', 'hA');
    Reflect.set(
      invalidSession.network.ego[entityAttributesProperty],
      'invalid-value',
      { unsupported: true },
    );
    const repo = mkRepo({ hA: protocol('hA') });

    const { grouped, failures } = await Effect.runPromise(
      processSessions([validSession, invalidSession], opts).pipe(
        Effect.provide(repo),
      ),
    );

    expect(grouped.hA).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe('session-processing');
    expect(failures[0]?.sessionId).toBe('invalid');
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

  it.each([
    {
      label: 'metadata without a salt, under an encryption header',
      metadata: { iv: [15, 243, 77] },
      header: encryptionHeader,
    },
    {
      label: 'schema 8 metadata with a salt, without a header',
      metadata: { iv: [15, 243, 77], salt: [44, 130, 213] },
      header: undefined,
    },
  ])(
    'processes a network with encrypted values: $label',
    async ({ metadata, header }) => {
      const session = mkSession('s1', 'hA');
      session.network = {
        ...(header ? { encryption: header } : {}),
        nodes: [
          {
            _uid: 'node-1',
            type: 'person',
            [entityAttributesProperty]: { 'p-name': [201, 17, 93, 4] },
            [entitySecureAttributesMeta]: { 'p-name': metadata },
          },
        ],
        edges: [],
        ego: session.network.ego,
      };
      const repo = mkRepo({ hA: protocol('hA') });

      const { grouped, failures } = await Effect.runPromise(
        processSessions([session], opts).pipe(Effect.provide(repo)),
      );

      expect(failures).toEqual([]);
      expect(grouped.hA?.[0]?.nodes[0]?.[entityAttributesProperty]).toEqual({
        'p-name': [201, 17, 93, 4],
      });
      expect(grouped.hA?.[0]?.nodes[0]?.[entitySecureAttributesMeta]).toEqual({
        'p-name': metadata,
      });
    },
  );
});
