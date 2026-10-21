import { Effect, Layer } from 'effect';
import { DatabaseError } from 'fresco-schema-8/network-exporters/errors';
import { type InterviewExportInput } from 'fresco-schema-8/network-exporters/input';
import { InterviewRepository } from 'fresco-schema-8/network-exporters/services/InterviewRepository';
import { NcNetworkSchema } from 'fresco-schema-8/shared-consts';

import { getInterviewsForExport } from '~/queries/interviews';

/**
 * `PrismaInterviewRepository` for the schema 8 exporter: the same rows, read
 * with schema 8's network schema. A schema 8 interview records no finish
 * outcome.
 */
export const LegacyPrismaInterviewRepository = Layer.succeed(
  InterviewRepository,
  {
    getForExport: (ids) =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          try: () => getInterviewsForExport([...ids]),
          catch: (error) => new DatabaseError({ cause: error }),
        });

        const inputs: InterviewExportInput[] = [];
        for (const row of rows) {
          const network = NcNetworkSchema.safeParse(row.network);
          if (!network.success) {
            return yield* new DatabaseError({
              cause: new Error(
                'An interview selected for export holds data that could not be read',
                { cause: network.error },
              ),
            });
          }

          inputs.push({
            id: row.id,
            participantIdentifier: row.participant.identifier,
            startTime: row.startTime,
            finishTime: row.finishTime,
            network: network.data,
            protocolHash: row.protocol.hash,
          });
        }

        return inputs;
      }),
  },
);
