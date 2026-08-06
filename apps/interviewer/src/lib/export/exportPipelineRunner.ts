import { Effect, Layer, Queue, Stream } from 'effect';

import type { ExportEvent } from '@codaco/network-exporters/events';
import type {
  InterviewExportInput,
  ProtocolExportInput,
} from '@codaco/network-exporters/input';
import { makeZipOutput } from '@codaco/network-exporters/layers/ZipOutput';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type {
  ExportReturn,
  OutputResult,
} from '@codaco/network-exporters/output';
import { exportPipeline } from '@codaco/network-exporters/pipeline';
import { InterviewRepository } from '@codaco/network-exporters/services/InterviewRepository';
import { ProtocolRepository } from '@codaco/network-exporters/services/ProtocolRepository';

// The decrypted, structured-cloneable inputs the pipeline consumes. Fetched
// (and decrypted) on the main thread — the vault DEK never crosses a worker
// boundary — then handed to wherever the pipeline runs.
export type ExportPipelineData = {
  sessions: InterviewExportInput[];
  protocols: Record<string, ProtocolExportInput>;
};

export type ExportRun = {
  result: ExportReturn;
  blob: Blob | null;
  fileName: string | null;
};

function makeBlobSink() {
  let result: { blob: Blob; fileName: string } | null = null;
  const sink = (iterable: AsyncIterable<Uint8Array>, fileName: string) =>
    Effect.tryPromise({
      try: async (): Promise<OutputResult> => {
        const chunks: BlobPart[] = [];
        for await (const chunk of iterable) {
          chunks.push(new Uint8Array(chunk));
        }
        const blob = new Blob(chunks, { type: 'application/zip' });
        result = { blob, fileName };
        // No object URL: nothing consumes one, and an unrevoked URL would pin
        // the zip-sized blob in memory for the page lifetime.
        return { key: fileName };
      },
      catch: (cause) => {
        throw cause;
      },
    });
  return {
    sink,
    getResult: () => result,
  };
}

// Runs the export pipeline over pre-fetched inputs. Free of database and DOM
// access, so it executes identically inside the export worker (the normal
// path) and on the main thread (the no-Worker fallback and unit tests).
export async function runPipelineWithData({
  data,
  options,
  onEvent,
  signal,
}: {
  data: ExportPipelineData;
  options: ExportOptions;
  onEvent?: (event: ExportEvent) => void;
  signal?: AbortSignal;
}): Promise<ExportRun> {
  const interviewRepoLayer = Layer.succeed(InterviewRepository, {
    getForExport: () => Effect.succeed(data.sessions),
  });
  const protocolRepoLayer = Layer.succeed(ProtocolRepository, {
    getProtocols: () => Effect.succeed(data.protocols),
  });
  const { sink, getResult } = makeBlobSink();
  const outputLayer = makeZipOutput(sink);

  const program = Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExportEvent>();

    const drain = Effect.forkScoped(
      Stream.fromQueue(queue).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            onEvent?.(event);
          }),
        ),
      ),
    );

    yield* drain;

    const result = yield* exportPipeline(
      data.sessions.map((session) => session.id),
      options,
      queue,
    );
    yield* Queue.shutdown(queue);
    return result;
  });

  const result = await Effect.runPromise(
    Effect.scoped(program).pipe(
      Effect.provide(
        Layer.mergeAll(interviewRepoLayer, protocolRepoLayer, outputLayer),
      ),
    ),
    { signal },
  );

  const sinkResult = getResult();
  return {
    result,
    blob: sinkResult?.blob ?? null,
    fileName: sinkResult?.fileName ?? null,
  };
}
