import { Effect } from 'effect';
import { DatabaseError } from 'fresco-schema-8/network-exporters/errors';
import { InterviewRepository } from 'fresco-schema-8/network-exporters/services/InterviewRepository';
import { ProtocolRepository } from 'fresco-schema-8/network-exporters/services/ProtocolRepository';
import { describe, expect, it, vi } from 'vitest';

import { schema8EncryptedNetwork } from '~/lib/__tests__/encryptedNetworks';

vi.mock('server-only', () => ({}));

const { mockFindMany, mockGetInterviewsForExport } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGetInterviewsForExport: vi.fn(),
}));

vi.mock('~/lib/db', () => ({
  prisma: { protocol: { findMany: mockFindMany } },
}));
vi.mock('~/queries/interviews', () => ({
  getInterviewsForExport: mockGetInterviewsForExport,
}));

import { LegacyPrismaInterviewRepository } from '~/lib/schema-8/export/InterviewRepository';
import { LegacyPrismaProtocolRepository } from '~/lib/schema-8/export/ProtocolRepository';

const getForExport = Effect.gen(function* () {
  const repository = yield* InterviewRepository;
  return yield* repository.getForExport(['interview-1']);
}).pipe(Effect.provide(LegacyPrismaInterviewRepository));

const getProtocols = Effect.gen(function* () {
  const repository = yield* ProtocolRepository;
  return yield* repository.getProtocols(['protocol-hash']);
}).pipe(Effect.provide(LegacyPrismaProtocolRepository));

const interviewRow = (network: unknown) => ({
  id: 'interview-1',
  participant: { identifier: 'P001', label: null },
  startTime: new Date('2026-01-01'),
  finishTime: null,
  finishOutcome: null,
  network,
  protocol: { hash: 'protocol-hash' },
});

describe('the schema 8 export repositories', () => {
  it('export a schema 8 interview as it is stored, with no finish outcome', async () => {
    mockGetInterviewsForExport.mockResolvedValue([
      interviewRow(schema8EncryptedNetwork),
    ]);

    const [input] = await Effect.runPromise(getForExport);

    expect(input?.network).toEqual(schema8EncryptedNetwork);
    expect(input).not.toHaveProperty('finishOutcome');
  });

  it('fail the export, as a typed error, on a network that does not parse', async () => {
    mockGetInterviewsForExport.mockResolvedValue([
      interviewRow({ nodes: 'not a list' }),
    ]);

    const error = await Effect.runPromise(Effect.flip(getForExport));

    expect(error).toBeInstanceOf(DatabaseError);
  });

  it('export the schema 8 codebook it reads', async () => {
    const codebook = { node: {}, edge: {}, ego: { variables: {} } };
    mockFindMany.mockResolvedValue([
      { hash: 'protocol-hash', name: 'Study', codebook },
    ]);

    const protocols = await Effect.runPromise(getProtocols);

    expect(protocols['protocol-hash']?.codebook).toEqual(codebook);
  });

  it('fail the export, as a typed error, on a codebook that does not parse', async () => {
    mockFindMany.mockResolvedValue([
      {
        hash: 'protocol-hash',
        name: 'Study',
        codebook: { node: { person: 'not a type' } },
      },
    ]);

    const error = await Effect.runPromise(Effect.flip(getProtocols));

    expect(error).toBeInstanceOf(DatabaseError);
  });
});
