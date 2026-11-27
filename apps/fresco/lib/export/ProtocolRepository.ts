import { Effect, Layer } from 'effect';

import { DatabaseError } from '@codaco/network-exporters/errors';
import { type ProtocolExportInput } from '@codaco/network-exporters/input';
import { ProtocolRepository } from '@codaco/network-exporters/services/ProtocolRepository';
import { getLayoutNodeTypes } from '@codaco/protocol-validation';
import { prisma } from '~/lib/db';
import { parseStoredProtocol } from '~/lib/db/storedProtocol';

export const PrismaProtocolRepository = Layer.succeed(ProtocolRepository, {
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
        // An export is labelled and typed by its codebook, and its stages say
        // which node types have each layout. A protocol that does not parse
        // fails the export rather than writing out every variable unlabelled,
        // and it fails as a typed error: the batch route reports and closes
        // the stream only for those.
        const stored = parseStoredProtocol(row);
        if (!stored.success) {
          return yield* new DatabaseError({
            cause: new Error(
              'A protocol selected for export holds data that could not be read',
              { cause: stored.error },
            ),
          });
        }

        result[row.hash] = {
          hash: row.hash,
          name: row.name,
          codebook: stored.data.codebook,
          layoutNodeTypes: getLayoutNodeTypes(stored.data),
        };
      }
      return result;
    }),
});
