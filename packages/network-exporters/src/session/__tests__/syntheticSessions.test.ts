import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

import { generateInterviews } from '@codaco/protocol-utilities';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { NcNetworkSchema, StageMetadataSchema } from '@codaco/shared-consts';

import type { InterviewExportInput, ProtocolExportInput } from '../../input';
import type { ExportOptions } from '../../options';
import { ProtocolRepository } from '../../services/ProtocolRepository';
import { processSessions } from '../processSessions';

/**
 * C2: every session the synthetic engine produces — complete and dropped
 * alike — is a session the export pipeline accepts. The bundled protocols
 * are the fixture because they are what researchers actually export: each is
 * parsed through the schema (the host contract), generated with dropout on,
 * and pushed through `processSessions` in both formats with zero failures.
 *
 * Roster and geojson pools are deliberately left unresolved: an absent pool
 * is a legal host outcome (D18), and an exportable session must come out of
 * it all the same.
 */

const protocolsRoot = path.resolve(
  import.meta.dirname,
  '../../../../protocols',
);

// Seed and count are pinned PER protocol so each batch really carries both
// kinds of session: the showcase's per-session drop probability is only ~6%
// (closed form over its burden profile), so a six-member batch at an
// arbitrary seed frequently completes whole — and a test that never sees a
// dropped session proves nothing about exporting one.
const BUNDLED = [
  {
    name: 'development',
    file: 'development/protocol.json',
    count: 6,
    seed: 42,
  },
  { name: 'sample', file: 'sample/protocol.json', count: 6, seed: 42 },
  {
    name: 'synthetic showcase',
    file: 'e2e/synthetic-showcase/protocol.json',
    count: 12,
    seed: 21,
  },
] as const;

const parsedProtocolFor = (file: string) =>
  CurrentProtocolSchema.parse(
    JSON.parse(readFileSync(path.join(protocolsRoot, file), 'utf8')),
  );

const bothFormats: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 0,
    screenLayoutWidth: 0,
  },
};

describe.each(BUNDLED)(
  'the $name protocol round-trips (C2)',
  ({ file, count, seed }) => {
    const protocol = parsedProtocolFor(file);
    const results = generateInterviews(protocol, {
      count,
      seed,
      startWindow: '2026-08-20T12:00:00.000Z',
      simulateDropOut: true,
      minimumCompletedRatio: 0,
    });

    it('generated both kinds of session, so the claim below is not vacuous', () => {
      expect(results.some((result) => result.droppedOut)).toBe(true);
      expect(results.some((result) => !result.droppedOut)).toBe(true);
    });

    it('parses every generated network and metadata back through the schemas', () => {
      for (const result of results) {
        expect(() =>
          NcNetworkSchema.parse(result.session.network),
        ).not.toThrow();
        if (result.session.stageMetadata !== undefined) {
          expect(() =>
            StageMetadataSchema.parse(result.session.stageMetadata),
          ).not.toThrow();
        }
      }
    });

    it('exports every session, complete and dropped alike, with zero failures', async () => {
      const hash = 'synthetic-batch';
      const exportProtocol: ProtocolExportInput = {
        hash,
        name: protocol.name,
        codebook: protocol.codebook,
      };
      const sessions: InterviewExportInput[] = results.map((result, index) => ({
        id: result.session.id,
        participantIdentifier: `participant-${index}`,
        startTime: new Date(result.session.startTime),
        finishTime: result.session.finishTime
          ? new Date(result.session.finishTime)
          : null,
        network: result.session.network,
        protocolHash: hash,
      }));

      const repo = Layer.succeed(ProtocolRepository, {
        getProtocols: () => Effect.succeed({ [hash]: exportProtocol }),
      });

      const { grouped, failures } = await Effect.runPromise(
        processSessions(sessions, bothFormats).pipe(Effect.provide(repo)),
      );

      expect(failures).toEqual([]);
      expect(grouped[hash]).toHaveLength(results.length);
    });
  },
);
