import { Effect, Layer } from 'effect';
import { DatabaseError } from 'fresco-schema-8/network-exporters/errors';
import { type ProtocolExportInput } from 'fresco-schema-8/network-exporters/input';
import { ProtocolRepository } from 'fresco-schema-8/network-exporters/services/ProtocolRepository';
import { CodebookSchema } from 'fresco-schema-8/protocol-validation';

import { prisma } from '~/lib/db';

/**
 * `PrismaProtocolRepository` for the schema 8 exporter: the same rows, read
 * with schema 8's codebook schema.
 */
export const LegacyPrismaProtocolRepository = Layer.succeed(
  ProtocolRepository,
  {
    getProtocols: (hashes) =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          try: () =>
            prisma.protocol.findMany({
              where: { hash: { in: [...hashes] } },
            }),
          catch: (error) => new DatabaseError({ cause: error }),
        });

        const result: Record<string, ProtocolExportInput> = {};
        for (const row of rows) {
          const codebook = CodebookSchema.safeParse(row.codebook);
          if (!codebook.success) {
            return yield* new DatabaseError({
              cause: new Error(
                'A protocol selected for export holds data that could not be read',
                { cause: codebook.error },
              ),
            });
          }

          result[row.hash] = {
            hash: row.hash,
            name: row.name,
            codebook: codebook.data,
          };
        }
        return result;
      }),
  },
);
