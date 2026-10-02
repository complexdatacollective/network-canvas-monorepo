import { Effect, Layer, Queue } from 'effect';

import type { ExportEvent } from '../events';
import type { InterviewExportInput, ProtocolExportInput } from '../input';
import type { ExportOptions } from '../options';
import type { OutputEntry } from '../output';
import { exportPipeline } from '../pipeline';
import { InterviewRepository } from '../services/InterviewRepository';
import { Output } from '../services/Output';
import { ProtocolRepository } from '../services/ProtocolRepository';

const decoder = new TextDecoder();

const readAll = async (data: AsyncIterable<Uint8Array>) => {
  let text = '';
  for await (const chunk of data)
    text += decoder.decode(chunk, { stream: true });
  return text;
};

/**
 * Runs the whole export pipeline over `interviews` of one protocol, and keeps
 * every file it writes as text, by name.
 */
export const runRecordedExport = async (
  options: ExportOptions,
  interviews: InterviewExportInput[],
  protocol: ProtocolExportInput,
) => {
  const files = new Map<string, string>();
  const output = Layer.succeed(Output, {
    begin: () => Effect.succeed({ id: 'recording' }),
    writeEntry: (_handle, entry: OutputEntry) =>
      Effect.promise(async () => {
        files.set(entry.name, await readAll(entry.data));
      }),
    end: () => Effect.succeed({ key: 'k' }),
  });
  const repositories = Layer.mergeAll(
    Layer.succeed(InterviewRepository, {
      getForExport: () => Effect.succeed(interviews),
    }),
    Layer.succeed(ProtocolRepository, {
      getProtocols: () => Effect.succeed({ [protocol.hash]: protocol }),
    }),
  );
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<ExportEvent>();
      return yield* exportPipeline(
        interviews.map((interview) => interview.id),
        options,
        queue,
      );
    }).pipe(Effect.provide(Layer.mergeAll(repositories, output))),
  );
  return { files, result };
};
